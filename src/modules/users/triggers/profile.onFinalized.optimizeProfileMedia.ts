import path from "path";
import {onObjectFinalized} from "firebase-functions/storage";
import {logger} from "firebase-functions";
import {FieldValue} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {bucket, db} from "../../../config/firebase";
import {compressImage} from "../../events/helpers/compressImage";
import {STORAGE_BUCKET} from "../../../config/bucket";

const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/avif",
];

type ProfileSubFolder = "avatar" | "banner";

interface ProfilePathInfo {
  uid: string;
  subFolder: ProfileSubFolder;
  fileName: string;
}

/**
 * Extrae uid, subcarpeta y nombre de archivo desde una ruta de profile en Storage.
 * @param {string | undefined} filePath Ruta del archivo en Storage.
 * @return {ProfilePathInfo | null} Metadatos parseados o null si no coincide.
 */
function parseProfilePath(filePath: string | undefined): ProfilePathInfo | null {
  const parts = filePath?.split("/") ?? [];
  if (parts[0] !== "public" || parts[1] !== "profile") return null;

  const uid = parts[2];
  if (!uid) return null;

  const subFolder = parts[3] as ProfileSubFolder;
  if (subFolder !== "avatar" && subFolder !== "banner") return null;

  const fileName = path.basename(filePath as string);


  return {uid, subFolder, fileName};
}

export const optimizeProfileMedia = onObjectFinalized(
  {
    memory: "512MiB",
    cpu: 1,
    concurrency: 5,
    bucket: STORAGE_BUCKET,
    region: "us-east1",
    retry: true,
  },
  async (event) => {
    const {name: filePath, contentType} = event.data;

    if (!contentType || !VALID_IMAGE_TYPES.includes(contentType)) return;

    const info = parseProfilePath(filePath);
    if (!info) return;
    // Sin esto la función se re-dispara sobre su propia salida (optimized_optimized_…).
    if (info.fileName.startsWith("optimized_")) return;

    const {uid, subFolder} = info;
    logger.info("[optimizeProfileMedia] Iniciando", {uid, subFolder, filePath});

    const maxWidth = subFolder === "avatar" ? 400 : 1500;

    try {
      const {publicUrl, path: compressedPath} = await compressImage(
        filePath,
        {maxWidth},
      );

      const userRef = db.collection("users").doc(uid);

      if (subFolder === "avatar") {
        await userRef.update({
          photoURL: publicUrl,
          imagePath: compressedPath,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await getAuth().updateUser(uid, {photoURL: publicUrl});
      } else {
        await userRef.update({
          bannerUrl: publicUrl,
          bannerPath: compressedPath,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await bucket.file(filePath).delete().catch((err) => {
        logger.warn("[optimizeProfileMedia] No se pudo eliminar el original", {
          filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info("[optimizeProfileMedia] Completado", {
        uid,
        subFolder,
        publicUrl,
        compressedPath,
      });
    } catch (error) {
      logger.error("[optimizeProfileMedia] Error", {
        uid,
        subFolder,
        filePath,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "Sin stack",
      });
      throw error;
    }
  },
);
