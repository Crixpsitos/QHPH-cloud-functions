import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {bucket, db} from "../../../config/firebase";
import {createMarkerImage} from "../helpers/createMarkerImage";

interface MediaData {
  path: string;
  url?: string;
  thumbnailPath?: string;
  isCover?: boolean;
}

interface MediaItem {
  id: string;
  type: "image" | "video";
  path?: string;
  url?: string;
  thumbnailPath?: string;
  isCover?: boolean;
  markerUrl?: {
    url: string;
    path: string;
  } | null;
  data?: MediaData;
}

interface MainImage {
  url?: string;
  path?: string;
  status?: string;
}

export const syncSiteMarkerAndCleanupMedia = onDocumentWritten(
  {
    document: "sites/{siteId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    const before = documentEvent.data?.before.data();
    const after = documentEvent.data?.after.data();
    const siteId = documentEvent.params.siteId;

    if (!before || !after) return;

    const beforeMedia: MediaItem[] = before.media || [];
    const afterMedia: MediaItem[] = after.media || [];


    const afterCoverIndex = afterMedia.findIndex(
      (item) => item.type === "image" && item.isCover === true,
    );
    const beforeCoverItem = beforeMedia.find(
      (item) => item.type === "image" && item.isCover === true,
    );

    const afterCoverItem = afterCoverIndex !== -1 ? afterMedia[afterCoverIndex] : undefined;
    const coverPathChanged = afterCoverItem?.path !== beforeCoverItem?.path;

    if (afterCoverItem && coverPathChanged) {
      const coverPath = afterCoverItem.path;

      if (coverPath) {
        try {
          logger.info(
            `🗺 Cover changed for site ${siteId}, generating marker image...`,
          );
          const {publicUrl, storagePath} = await createMarkerImage(coverPath, siteId);

          const updatedMedia = afterMedia.map((item, index) => ({
            ...item,
            markerUrl: index === afterCoverIndex ? {url: publicUrl, path: storagePath} : null,
          }));

          await db.doc(`sites/${siteId}`).update({
            media: updatedMedia,
          });
          logger.info(`✅ markerUrl updated in cover item for site ${siteId}`);
        } catch (error) {
          logger.error(
            `❌ Error generating marker image for site ${siteId}:`,
            error,
          );
        }
      }
    } else if (!afterCoverItem && beforeCoverItem) {
      logger.info(`🗺 Cover removed for site ${siteId}, clearing markerUrl in media`);
      const updatedMedia = afterMedia.map((item) => ({
        ...item,
        markerUrl: null,
      }));
      await db.doc(`sites/${siteId}`).update({media: updatedMedia});
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Cleanup old media files from Storage
    // ─────────────────────────────────────────────────────────────────────────

    const pathsToDelete: string[] = [];

    for (const beforeItem of beforeMedia) {
      const afterItem = afterMedia.find((item) => item.id === beforeItem.id);

      if (!afterItem) {
        // Item removed entirely
        if (beforeItem.path) {
          pathsToDelete.push(beforeItem.path);
        }
        if (beforeItem.thumbnailPath) {
          pathsToDelete.push(beforeItem.thumbnailPath);
        }
      } else {
        // Item still exists. Only delete the old file when `after` points to a NEW file
        // (genuine optimization replacement). If after.path is empty/undefined the app just
        // re-saved without carrying it — NOT a replacement — so we must not delete it.
        if (
          beforeItem.path &&
          afterItem.path &&
          beforeItem.path !== afterItem.path
        ) {
          pathsToDelete.push(beforeItem.path);
        }
        if (
          beforeItem.thumbnailPath &&
          afterItem.thumbnailPath &&
          beforeItem.thumbnailPath !== afterItem.thumbnailPath
        ) {
          pathsToDelete.push(beforeItem.thumbnailPath);
        }
      }
    }

    const beforeMain: MainImage = before.mainImage;
    const afterMain: MainImage = after.mainImage;

    if (beforeMain?.path && afterMain?.path && beforeMain.path !== afterMain.path) {
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
