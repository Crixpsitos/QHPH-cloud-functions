import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {bucket} from "../../../config/firebase";

interface MediaData {
  path: string;
  thumbnailPath?: string;
}

interface MediaItem {
  id: string;
  type: "image" | "video";
  data: MediaData;
}

interface MainImage {
  url?: string;
  path?: string;
  status?: string;
}

export const cleanupOldMediaFiles = onDocumentWritten(
  {
    document: "events/{eventId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    const before = documentEvent.data?.before.data();
    const after = documentEvent.data?.after.data();

    if (!before || !after) return;

    const pathsToDelete: string[] = [];

    const beforeMedia: MediaItem[] = before.media || [];
    const afterMedia: MediaItem[] = after.media || [];

    for (const beforeItem of beforeMedia) {
      const afterItem = afterMedia.find((item) => item.id === beforeItem.id);

      if (!afterItem) {
        if (beforeItem.data?.path) {
          pathsToDelete.push(beforeItem.data.path);
        }
        if (beforeItem.data?.thumbnailPath) {
          pathsToDelete.push(beforeItem.data.thumbnailPath);
        }
      } else {
        if (
          beforeItem.data?.path &&
          beforeItem.data.path !== afterItem.data?.path
        ) {
          pathsToDelete.push(beforeItem.data.path);
        }
        if (
          beforeItem.data?.thumbnailPath &&
          beforeItem.data.thumbnailPath !== afterItem.data?.thumbnailPath
        ) {
          pathsToDelete.push(beforeItem.data.thumbnailPath);
        }
      }
    }

    const beforeMain: MainImage = before.mainImage;
    const afterMain: MainImage = after.mainImage;

    if (beforeMain?.path && beforeMain.path !== afterMain?.path) {
      pathsToDelete.push(beforeMain.path);
    }

    if (pathsToDelete.length === 0) return;

    logger.info(`🗑 Archivos a eliminar: ${pathsToDelete.length}`, {
      pathsToDelete,
    });

    await Promise.all(
      pathsToDelete.map(async (filePath) => {
        try {
          await bucket.file(filePath).delete();
          logger.info(`✅ Eliminado: ${filePath}`);
        } catch {
          logger.warn(
            `⚠️ No se pudo eliminar (puede que ya no exista): ${filePath}`,
          );
        }
      }),
    );
  },
);
