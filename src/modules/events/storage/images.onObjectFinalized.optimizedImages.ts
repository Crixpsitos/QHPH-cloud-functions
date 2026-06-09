import {logger} from "firebase-functions";
import {onObjectFinalized} from "firebase-functions/storage";
import path from "path";
import {compressImage} from "../helpers/compressImage";
import {db} from "../../../config/firebase";
import {FieldValue} from "firebase-admin/firestore";

const VALID_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

export const optimizeEventImages = onObjectFinalized(
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

    if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) return;
    if (filePath?.split("/")[0] !== "public") return;
    if (filePath?.split("/")[3] !== "images") return;

    const eventId = filePath?.split("/")[2];
    if (!eventId) return;

    const fileName = path.basename(filePath);
    if (!fileName) return;

    if (fileName.startsWith("optimized_")) return;

    logger.info(`Processing: ${filePath}`);

    if (fileName.startsWith("deoptimized-main-image")) {
      try {
        const {
          publicUrl,
          path: compressedPath,
        } = await compressImage(filePath);

        await db.doc(`events/${eventId}`).update({
          "mainImage.status": "ready",
          "mainImage.temporaryUrl": FieldValue.delete(),
          "mainImage.path": compressedPath,
          "mainImage.url": publicUrl,
        });
      } catch (error) {
        logger.error(
          `Error processing main image for event ${eventId}:`,
          error,
        );
        await db.doc(`events/${eventId}`).update({
          "mainImage.status": "error",
        });
        throw error;
      }
    } else {
      try {
        const {
          publicUrl,
          path: compressedPath,
          width,
          height,
        } = await compressImage(filePath);

        await db.runTransaction(async (transaction) => {
          const docRef = db.doc(`events/${eventId}`);
          const doc = await transaction.get(docRef);
          if (!doc.exists) throw new Error("Event does not exist");

          const currentMedia = doc.data()?.media || [];
          const targetIndex = currentMedia.findIndex(
            (item: {data: {path: string}}) => item.data.path === filePath,
          );

          if (targetIndex === -1) {
            logger.warn(`No media item found for path: ${filePath}`);
            throw new Error("Media not found");
          }

          const mediaDataWithoutTemporaryUrl = {
            ...currentMedia[targetIndex].data,
          };
          delete mediaDataWithoutTemporaryUrl.temporaryUrl;

          currentMedia[targetIndex].data = {
            ...mediaDataWithoutTemporaryUrl,
            url: publicUrl,
            width,
            height,
            path: compressedPath,
            originalPath: filePath,
            status: "ready",
          };

          transaction.update(docRef, {media: currentMedia});
        });
      } catch (error) {
        logger.error(
          `Error processing gallery media for event ${eventId}:`,
          error,
        );
        await db.runTransaction(async (transaction) => {
          const docRef = db.doc(`events/${eventId}`);
          const doc = await transaction.get(docRef);
          if (!doc.exists) return;

          const currentMedia = doc.data()?.media || [];
          const targetIndex = currentMedia.findIndex(
            (item: {data: {path: string}}) => item.data.path === filePath,
          );

          if (targetIndex !== -1) {
            currentMedia[targetIndex].data.status = "error";
            transaction.update(docRef, {media: currentMedia});
          }
        });

        throw error;
      }
    }
  },
);
