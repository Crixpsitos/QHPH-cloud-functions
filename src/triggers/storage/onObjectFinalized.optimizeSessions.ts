import {logger} from "firebase-functions";
import {onObjectFinalized} from "firebase-functions/storage";
import path from "path";
import os from "os";
import fs from "fs/promises";
import {FieldValue} from "firebase-admin/firestore";
import {bucket, db} from "../../config/firebase";
import {compressImage} from "../../modules/events/helpers/compressImage";
import {processVideo} from "../../modules/events/helpers/processVideo";
import {extractThumbnail} from "../../modules/events/helpers/extractThumbnail";

/**
 * Optimizadores de media para SESIONES de eventos multi-fecha.
 *
 * Las sesiones viven en la subcolección `events/{eventId}/sessions/{sessionId}`.
 * El `eventId` no está en la ruta del storage, así que viaja en la metadata
 * personalizada `event-id` que el front adjunta al firmar el PUT.
 *
 * Layout en storage (distinto al de events):
 *   - Portada:  public/sessions/{sessionId}/{file}         (imagen, sin subcarpeta)
 *   - Galería:  public/sessions/{sessionId}/media/{file}   (imágenes + videos)
 *
 * Shape del doc (igual a events): `mainImage` anidado + `media[].data.path`.
 */

const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

const VALID_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/3gpp",
];

interface SessionPathInfo {
  sessionId: string;
  fileName: string;
  isMain: boolean;
  isMedia: boolean;
}

/**
 * Parsea la ruta de un objeto de sesión. Devuelve null si no aplica.
 * @param {string | undefined} filePath ruta del objeto en storage
 * @return {SessionPathInfo | null}
 */
function parseSessionPath(filePath: string | undefined): SessionPathInfo | null {
  const parts = filePath?.split("/") ?? [];
  if (parts[0] !== "public" || parts[1] !== "sessions") return null;

  const sessionId = parts[2];
  if (!sessionId) return null;

  const fileName = path.basename(filePath as string);
  if (!fileName || fileName.startsWith("optimized_")) return null;

  // public/sessions/{id}/{file}          → portada (length 4)
  // public/sessions/{id}/media/{file}    → galería (length 5, parts[3] = "media")
  const isMedia = parts.length >= 5 && parts[3] === "media";
  const isMain = parts.length === 4;
  if (!isMain && !isMedia) return null;

  return {sessionId, fileName, isMain, isMedia};
}

/**
 * Decide si NO hay que optimizar la portada subida porque la sesión usa una
 * portada COMPARTIDA (la del evento u otra sesión). Condicional pedida: si la
 * imagen es una referencia ya optimizada, no la re-optimizamos.
 * @param {string} eventId id del evento padre
 * @param {string} sessionId id de la sesión
 * @return {Promise<boolean>} true si debe saltarse la optimización
 */
async function isSharedCover(
  eventId: string,
  sessionId: string,
): Promise<boolean> {
  const snap = await db.doc(`events/${eventId}/sessions/${sessionId}`).get();
  if (!snap.exists) return false; // doc aún no persistido → optimiza igual (retry-safe)

  const data = snap.data() ?? {};

  // coverSource distinto de "own" ⇒ usa la portada del evento u otra sesión.
  if (data.coverSource && data.coverSource !== "own") return true;

  // Defensa extra: si la url ya es la portada del evento (imagen compartida
  // ya optimizada), tampoco re-optimizar. El caso "otra sesión" queda cubierto
  // por coverSource (sería un objeto {sessionId}, distinto de "own").
  const url = data.mainImage?.url;
  if (url) {
    const parentUrl = (
      await db.doc(`events/${eventId}`).get()
    ).data()?.mainImage?.url;
    if (parentUrl && parentUrl === url) return true;
  }

  return false;
}

// ── Imágenes de sesión (portada + galería) ────────────────────────────────────

export const optimizeSessionImages = onObjectFinalized(
  {
    memory: "1GiB",
    cpu: 1,
    concurrency: 10,
    bucket: "quehaypahacer-develop.firebasestorage.app",
    region: "us-east1",
    retry: true,
  },
  async (event) => {
    const {name: filePath, contentType, metadata} = event.data;
    if (!contentType || !VALID_IMAGE_TYPES.includes(contentType)) return;

    const parsed = parseSessionPath(filePath);
    if (!parsed) return;
    const {sessionId, isMain} = parsed;

    const eventId = metadata?.["event-id"];
    if (!eventId) {
      logger.warn(`Session image ${filePath} without event-id metadata, skip.`);
      return;
    }

    const sessionRef = db.doc(`events/${eventId}/sessions/${sessionId}`);

    // ── Portada ───────────────────────────────────────────────────────────
    if (isMain) {
      if (await isSharedCover(eventId, sessionId)) {
        logger.info(
          `Session ${sessionId} usa portada compartida, no se re-optimiza.`,
        );
        return;
      }

      logger.info(`Processing session cover: ${filePath}`);
      try {
        const {publicUrl, path: compressedPath} = await compressImage(
          filePath as string,
        );
        await sessionRef.update({
          "mainImage.status": "ready",
          "mainImage.temporaryUrl": FieldValue.delete(),
          "mainImage.path": compressedPath,
          "mainImage.url": publicUrl,
        });
      } catch (error) {
        logger.error(`Error optimizing session cover ${sessionId}:`, error);
        await sessionRef
          .update({"mainImage.status": "error"})
          .catch(() => undefined);
        throw error;
      }
      return;
    }

    // ── Galería (imagen) ──────────────────────────────────────────────────
    logger.info(`Processing session gallery image: ${filePath}`);
    try {
      const {publicUrl, path: compressedPath, width, height} =
        await compressImage(filePath as string);

      await patchSessionMediaByPath(
        sessionRef,
        filePath as string,
        (data) => {
          const next = {...data};
          delete next.temporaryUrl;
          return {
            ...next,
            url: publicUrl,
            width,
            height,
            path: compressedPath,
            originalPath: filePath,
            status: "ready",
          };
        },
      );
    } catch (error) {
      logger.error(`Error optimizing session gallery ${sessionId}:`, error);
      await markSessionMediaError(sessionRef, filePath as string);
      throw error;
    }
  },
);

// ── Videos de sesión (galería) ────────────────────────────────────────────────

export const optimizeSessionVideos = onObjectFinalized(
  {
    bucket: "quehaypahacer-develop.firebasestorage.app",
    region: "us-east1",
    retry: true,
    memory: "2GiB",
    cpu: 2,
    timeoutSeconds: 540,
  },
  async (event) => {
    const {name: filePath, contentType, metadata} = event.data;
    if (!contentType || !VALID_VIDEO_TYPES.includes(contentType)) return;

    const parsed = parseSessionPath(filePath);
    if (!parsed || !parsed.isMedia) return; // los videos solo van en /media
    const {sessionId, fileName} = parsed;

    const eventId = metadata?.["event-id"];
    if (!eventId) {
      logger.warn(`Session video ${filePath} without event-id metadata, skip.`);
      return;
    }

    const fileSizeMB = Number(event.data.size) / (1024 * 1024);
    if (fileSizeMB > 200) {
      logger.warn(`Video is too big (${fileSizeMB.toFixed(1)}MB), skipping`);
      return;
    }

    const sessionRef = db.doc(`events/${eventId}/sessions/${sessionId}`);
    logger.info(`Processing session video: ${filePath}`);

    const tempDir = os.tmpdir();
    const baseName = path.basename(fileName, path.extname(fileName));
    // Video y thumbnail viven en la misma carpeta /media de la sesión.
    const mediaDir = path.dirname(filePath as string);

    const tempInput = path.join(tempDir, fileName);
    const outputVideoName = `optimized_${baseName}.mp4`;
    const outputThumbName = `optimized_${baseName}_thumbnail.jpg`;
    const tempOutput = path.join(tempDir, outputVideoName);
    const tempThumb = path.join(tempDir, outputThumbName);

    const destVideo = path.join(mediaDir, outputVideoName);
    const destThumb = path.join(mediaDir, outputThumbName);

    try {
      await bucket.file(filePath as string).download({destination: tempInput});

      const {width, height, duration} = await processVideo(
        tempInput,
        tempOutput,
      );

      await extractThumbnail(tempInput, tempDir, outputThumbName);

      const uploadedVideo = bucket.file(destVideo);
      await bucket.upload(tempOutput, {
        destination: destVideo,
        metadata: {
          contentType: "video/mp4",
          cacheControl: "public, max-age=31536000, immutable",
          metadata: {process: "true", original: filePath},
        },
      });
      await uploadedVideo.makePublic();
      // eslint-disable-next-line
      await fs.unlink(tempOutput).catch(() => {});

      const videoUrl =
        `https://storage.googleapis.com/${bucket.name}/${destVideo}`;

      let thumbnailUrl: string | null = null;
      let thumbnailPath: string | null = null;
      try {
        const uploadedThumb = bucket.file(destThumb);
        await bucket.upload(tempThumb, {
          destination: destThumb,
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "public, max-age=31536000, immutable",
          },
        });
        await uploadedThumb.makePublic();
        // eslint-disable-next-line
        await fs.unlink(tempThumb).catch(() => {});
        thumbnailUrl =
          `https://storage.googleapis.com/${bucket.name}/${destThumb}`;
        thumbnailPath = destThumb;
      } catch {
        logger.warn("Thumbnail could not be uploaded, continuing...");
      }

      const found = await patchSessionMediaByPath(
        sessionRef,
        filePath as string,
        (data) => {
          const next = {...data};
          delete next.temporaryUrl;
          return {
            ...next,
            url: videoUrl,
            path: destVideo,
            originalPath: filePath,
            status: "ready",
            width,
            height,
            duration: Math.round(duration),
            thumbnailUrl,
            thumbnailPath,
          };
        },
      );

      if (found) logger.info(`✅ Session video ready: ${videoUrl}`);
    } catch (error) {
      logger.error(`❌ Error processing session video: ${filePath}`, error);
      await markSessionMediaError(sessionRef, filePath as string);
      throw error;
    } finally {
      // eslint-disable-next-line
      await fs.unlink(tempInput).catch(() => {});
      logger.info("Cleaning temp files...");
    }
  },
);

// ── Helpers de media (galería) ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaData = Record<string, any>;

/**
 * Actualiza en transacción el item de `media` cuyo `data.path` coincide.
 * @param {FirebaseFirestore.DocumentReference} ref doc de la sesión
 * @param {string} matchPath path del storage a matchear
 * @param {Function} patch actualizador de `item.data`
 * @return {Promise<boolean>} true si encontró y actualizó el item
 */
async function patchSessionMediaByPath(
  ref: FirebaseFirestore.DocumentReference,
  matchPath: string,
  patch: (data: MediaData) => MediaData,
): Promise<boolean> {
  let found = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      logger.warn(`Session doc ${ref.path} does not exist, skipping.`);
      return;
    }
    const media = snap.data()?.media ?? [];
    const i = media.findIndex(
      (item: {data: {path: string}}) => item.data?.path === matchPath,
    );
    if (i === -1) {
      logger.warn(`No session media for path: ${matchPath}, skipping.`);
      return;
    }
    found = true;
    media[i].data = patch(media[i].data);
    tx.update(ref, {media});
  });
  return found;
}

/**
 * Marca como "error" el item de media cuyo `data.path` coincide.
 * @param {FirebaseFirestore.DocumentReference} ref doc de la sesión
 * @param {string} matchPath path del storage a matchear
 * @return {Promise<void>}
 */
async function markSessionMediaError(
  ref: FirebaseFirestore.DocumentReference,
  matchPath: string,
): Promise<void> {
  await patchSessionMediaByPath(ref, matchPath, (data) => ({
    ...data,
    status: "error",
  }));
}
