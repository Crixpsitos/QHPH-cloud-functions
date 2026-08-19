import {onDocumentDeleted} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {bucket} from "../../../config/firebase";

interface MediaDataItem {
  data?: {path?: string; thumbnailPath?: string};
}

export const cleanupSessionMedia = onDocumentDeleted(
  {
    document: "events/{eventId}/sessions/{sessionId}",
    database: "quehaypahacer-db",
  },
  async (event) => {
    const {sessionId, eventId} = event.params;
    const data = event.data?.data();
    if (!data) return;

    const paths: string[] = [];

    if (data.mainImage?.path) paths.push(data.mainImage.path);

    const media: MediaDataItem[] = data.media || [];
    for (const item of media) {
      if (item.data?.path) paths.push(item.data.path);
      if (item.data?.thumbnailPath) paths.push(item.data.thumbnailPath);
    }

    if (paths.length === 0) return;

    logger.info("[cleanupSessionMedia] Limpiando archivos de sesión", {
      sessionId,
      eventId,
      count: paths.length,
    });

    await Promise.all(
      paths.map(async (p) => {
        try {
          await bucket.file(p).delete();
        } catch {
          logger.warn("[cleanupSessionMedia] No se pudo eliminar (puede que ya no exista)", {path: p});
        }
      }),
    );
  },
);
