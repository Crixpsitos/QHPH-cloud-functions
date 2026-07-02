import {logger} from "firebase-functions";
import {onObjectFinalized} from "firebase-functions/storage";
import path from "path";
import os from "os";
import fs from "fs/promises";
import {bucket, db} from "../../config/firebase";
import {compressImage} from "../../modules/events/helpers/compressImage";
import {processVideo} from "../../modules/events/helpers/processVideo";
import {extractThumbnail} from "../../modules/events/helpers/extractThumbnail";
import {isOptimizableFolder} from "./config/storageOptimization.config";

/**
 * Optimizador genérico de media (imágenes + videos) para el estándar de sites:
 * el media es PLANO y se matchea por `item.path` (no `item.data.path`).
 *
 * Aplica a cualquier carpeta whitelisteada en OPTIMIZABLE_FOLDERS EXCEPTO events,
 * que conserva sus triggers dedicados (mainImage + data.path).
 *
 * Ruta esperada: public/{collection}/{docId}/{images|videos}/{file}
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

interface FlatMediaItem {
  path?: string;
  [key: string]: unknown;
}

/**
 * Parsea y valida la ruta. Devuelve null si no aplica a este optimizador.
 * @param {string | undefined} filePath ruta del objeto en storage
 * @param {"images" | "videos"} subFolder subcarpeta esperada
 * @return {{collection: string, docId: string, fileName: string} | null}
 */
function parsePath(
  filePath: string | undefined,
  subFolder: "images" | "videos",
): { collection: string; docId: string; fileName: string } | null {
  const parts = filePath?.split("/") ?? [];
  if (parts[0] !== "public") return null;
  const collection = parts[1];
  // events tiene sus propios triggers dedicados
  if (collection === "events") return null;
  // whitelist — solo carpetas registradas (hoy: sites)
  if (!isOptimizableFolder(collection)) return null;
  if (parts[3] !== subFolder) return null;

  const docId = parts[2];
  if (!docId) return null;

  const fileName = path.basename(filePath as string);
  if (!fileName || fileName.startsWith("optimized_")) return null;

  return {collection, docId, fileName};
}

/**
 * Aplica un patch al media item cuyo `path` coincide, dentro de una transacción.
 * @param {string} collection colección Firestore (ej: sites)
 * @param {string} docId id del documento
 * @param {string} matchPath path del storage a matchear (item.path === matchPath)
 * @param {Function} patch actualizador del item
 * @return {Promise<boolean>} true si encontró y actualizó el item
 */
async function patchMediaByPath(
  collection: string,
  docId: string,
  matchPath: string,
  patch: (item: FlatMediaItem) => FlatMediaItem,
): Promise<boolean> {
  let found = false;
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`${collection}/${docId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      logger.warn(`${collection}/${docId} does not exist, skipping.`);
      return;
    }

    const media: FlatMediaItem[] = snap.data()?.media || [];
    const i = media.findIndex((m) => m.path === matchPath);
    if (i === -1) {
      logger.warn(`No media item found for path: ${matchPath}, skipping.`);
      return;
    }

    found = true;
    media[i] = patch(media[i]);
    tx.update(ref, {media});
  });
  return found;
}

/**
 * Marca el media item como error.
 * @param {string} collection colección
 * @param {string} docId id del documento
 * @param {string} matchPath path a matchear
 * @return {Promise<void>}
 */
async function markMediaError(
  collection: string,
  docId: string,
  matchPath: string,
): Promise<void> {
  await patchMediaByPath(collection, docId, matchPath, (item) => ({
    ...item,
    status: "error",
  }));
}

// ── Imágenes ─────────────────────────────────────────────────────────────────

export const optimizeMediaImages = onObjectFinalized(
  {
    memory: "1GiB",
    cpu: 1,
    concurrency: 10,
    bucket: "quehaypahacer-develop.firebasestorage.app",
    region: "us-east1",
    retry: true,
  },
  async (event) => {
    const {name: filePath, contentType} = event.data;
    if (!contentType || !VALID_IMAGE_TYPES.includes(contentType)) return;

    const parsed = parsePath(filePath, "images");
    if (!parsed) return;
    const {collection, docId} = parsed;

    logger.info(`[optimizeMedia] image ${filePath} → ${collection}/${docId}`);

    try {
      const {
        publicUrl,
        path: compressedPath,
        width,
        height,
      } = await compressImage(filePath as string);

      const found = await patchMediaByPath(
        collection,
        docId,
        filePath as string,
        (item) => {
          const next = {...item};
          delete next.temporaryUrl;
          return {
            ...next,
            url: publicUrl,
            path: compressedPath,
            width,
            height,
            status: "ready",
          };
        },
      );

      if (found) logger.info(`✅ Image ready: ${publicUrl}`);
    } catch (error) {
      logger.error(`❌ Error processing image: ${filePath}`, error);
      await markMediaError(collection, docId, filePath as string);
      throw error;
    }
  },
);

// ── Videos ───────────────────────────────────────────────────────────────────

export const optimizeMediaVideos = onObjectFinalized(
  {
    bucket: "quehaypahacer-develop.firebasestorage.app",
    region: "us-east1",
    retry: true,
    memory: "2GiB",
    cpu: 2,
    timeoutSeconds: 540,
  },
  async (event) => {
    const {name: filePath, contentType} = event.data;
    if (!contentType || !VALID_VIDEO_TYPES.includes(contentType)) return;

    const parsed = parsePath(filePath, "videos");
    if (!parsed) return;
    const {collection, docId, fileName} = parsed;

    const fileSizeMB = Number(event.data.size) / (1024 * 1024);
    if (fileSizeMB > 200) {
      logger.warn(`Video is too big (${fileSizeMB.toFixed(1)}MB), skipping`);
      return;
    }

    logger.info(`[optimizeMedia] video ${filePath} → ${collection}/${docId}`);

    const tempDir = os.tmpdir();
    const baseName = path.basename(fileName, path.extname(fileName));
    const videosDir = path.dirname(filePath as string);
    const imagesDir = videosDir.replace("/videos", "/images");

    const tempInput = path.join(tempDir, fileName);
    const outputVideoName = `optimized_${baseName}.mp4`;
    const outputThumbName = `optimized_${baseName}_thumbnail.jpg`;
    const tempOutput = path.join(tempDir, outputVideoName);
    const tempThumb = path.join(tempDir, outputThumbName);

    const destVideo = path.join(videosDir, outputVideoName);
    const destThumb = path.join(imagesDir, outputThumbName);

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

      const found = await patchMediaByPath(
        collection,
        docId,
        filePath as string,
        (item) => {
          const next = {...item};
          delete next.temporaryUrl;
          return {
            ...next,
            url: videoUrl,
            path: destVideo,
            originalPath: filePath,
            width,
            height,
            duration: Math.round(duration),
            thumbnailUrl,
            thumbnailPath,
            status: "ready",
          };
        },
      );

      if (found) logger.info(`✅ Video ready: ${videoUrl}`);
    } catch (error) {
      logger.error(`❌ Error processing video: ${filePath}`, error);
      await markMediaError(collection, docId, filePath as string);
      throw error;
    } finally {
      // eslint-disable-next-line
      await fs.unlink(tempInput).catch(() => {});
      logger.info("Cleaning temp files...");
    }
  },
);
