import {logger} from "firebase-functions";
import {onObjectFinalized} from "firebase-functions/storage";
import path from "path";
import os from "os";
import fs from "fs/promises";
import {bucket, db} from "../../config/firebase";
import {processVideo} from "../../modules/events/helpers/processVideo";
import {extractThumbnail} from "../../modules/events/helpers/extractThumbnail";

const VALID_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/3gpp",
];

export const onObjectFinalizedOptimizeVideos = onObjectFinalized(
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

    if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) return;
    if (filePath?.split("/")[0] !== "public") return;
    if (filePath?.split("/")[1] !== "events") return;
    if (filePath?.split("/")[3] !== "videos") return;

    const eventId = filePath?.split("/")[2];
    if (!eventId) return;

    const fileName = path.basename(filePath);
    if (!fileName) return;

    if (fileName.startsWith("optimized_")) return;

    const fileSizeMB = Number(event.data.size) / (1024 * 1024);
    if (fileSizeMB > 200) {
      logger.warn(`Video is too big (${fileSizeMB.toFixed(1)}MB), skipping`);
      return;
    }

    logger.info(`Processing video: ${filePath}`);

    const tempDir = os.tmpdir();
    const baseName = path.basename(fileName, path.extname(fileName));
    const eventVideosDir = path.dirname(filePath);
    const eventImagesDir = eventVideosDir.replace("/videos", "/images");

    const tempInput = path.join(tempDir, fileName);
    const outputVideoName = `optimized_${baseName}.mp4`;
    const outputThumbName = `optimized_${baseName}_thumbnail.jpg`;
    const tempOutput = path.join(tempDir, outputVideoName);
    const tempThumb = path.join(tempDir, outputThumbName);

    const destVideo = path.join(eventVideosDir, outputVideoName);
    const destThumb = path.join(eventImagesDir, outputThumbName);

    try {
      await bucket.file(filePath).download({destination: tempInput});

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

      const videoUrl = `https://storage.googleapis.com/${bucket.name}/${destVideo}`;

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

        thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${destThumb}`;
        thumbnailPath = destThumb;
      } catch {
        logger.warn("Thumbnail could not be uploaded, continuing...");
      }

      let mediaFound = false;

      await db.runTransaction(async (transaction) => {
        const docRef = db.doc(`events/${eventId}`);
        const doc = await transaction.get(docRef);
        if (!doc.exists) {
          logger.warn(`Event ${eventId} does not exist, skipping.`);
          return;
        }

        const currentMedia = doc.data()?.media || [];

        const targetIndex = currentMedia.findIndex(
          (item: {data: {path: string}}) => item.data.path === filePath,
        );

        if (targetIndex === -1) {
          logger.warn(`No media item found for path: ${filePath}, skipping.`);
          return;
        }

        mediaFound = true;

        const mediaDataWithoutTemporaryUrl = {
          ...currentMedia[targetIndex].data,
        };
        delete mediaDataWithoutTemporaryUrl.temporaryUrl;

        currentMedia[targetIndex].data = {
          ...mediaDataWithoutTemporaryUrl,
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

        transaction.update(docRef, {media: currentMedia});
      });

      if (!mediaFound) return;

      logger.info(`✅ Video ready: ${videoUrl}`);
    } catch (error) {
      logger.error(`❌ Error processing video: ${filePath}`, error);

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
    } finally {
      // eslint-disable-next-line
      await fs.unlink(tempInput).catch(() => {});
      logger.info("Cleaning temp files...");
    }
  },
);
