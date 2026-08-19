import path from "path";
import {onObjectFinalized} from "firebase-functions/storage";
import {logger} from "firebase-functions";
import {FieldValue} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {bucket, db} from "../../../config/firebase";
import {compressImage} from "../../events/helpers/compressImage";

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
 * Parsea la ruta y devuelve null si no corresponde a una imagen de perfil subida por el usuario.
 */
function parseProfilePath(filePath: string | undefined): ProfilePathInfo | null {
  const parts = filePath?.split("/") ?? [];
  if (parts[0] !== "public" || parts[1] !== "profile") return null;

  const uid = parts[2];
  if (!uid) return null;

  const subFolder = parts[3] as ProfileSubFolder;
  if (subFolder !== "avatar" && subFolder !== "banner") return null;

  const fileName = path.basename(filePath as string);
  // Evita bucle: el archivo ya optimizado no se reprocesa.
  if (!fileName || fileName.startsWith("optimized_")) return null;

  return {uid, subFolder, fileName};
}

/**
 * Optimiza imágenes de perfil (avatar y banner) al subirse a Storage.
 *
 * Avatar  → redimensiona a máx 400 px, convierte a WebP, actualiza Firestore + Firebase Auth.
 * Banner  → convierte a WebP (ya recortado a 1500×500 por el cliente), actualiza Firestore.
 *
 * Tras la optimización elimina el archivo original (best-effort).
 * El documento Firestore pasa de la URL original a la URL optimizada en background;
 * el cliente ya muestra el blob local mientras tanto.
 */
export const optimizeProfileMedia = onObjectFinalized(
  {
    memory: "512MiB",
    cpu: 1,
    concurrency: 5,
    bucket: "quehaypahacer-develop.firebasestorage.app",
    region: "us-east1",
    retry: true,
  },
  async (event) => {
    const {name: filePath, contentType} = event.data;

    if (!contentType || !VALID_IMAGE_TYPES.includes(contentType)) return;

    const info = parseProfilePath(filePath);
    if (!info) return;

    const {uid, subFolder} = info;
    logger.info("[optimizeProfileMedia] Iniciando", {uid, subFolder, filePath});

    // Avatar: recorta a 400 px para no servir fotos de 5 MB a 80 px.
    // Banner: mantiene 1500 px (ya recortado por el cliente), sólo convierte a WebP.
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
        // Sincroniza también el perfil de Firebase Auth para que el token refleje la nueva foto.
        await getAuth().updateUser(uid, {photoURL: publicUrl});
      } else {
        await userRef.update({
          bannerUrl: publicUrl,
          bannerPath: compressedPath,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Eliminar el archivo original una vez optimizado (best-effort).
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
