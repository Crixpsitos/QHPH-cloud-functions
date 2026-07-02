import {logger} from "firebase-functions";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import os from "os";
import {bucket} from "../../../config/firebase";

const MARKER_SIZE = 40;

export const createMarkerImage = async (
  sourceImagePath: string,
  siteId: string,
): Promise<{publicUrl: string; storagePath: string}> => {
  const tempDir = os.tmpdir();
  const tempInput = path.join(tempDir, path.basename(sourceImagePath));
  const outputFileName = `marker_${siteId}.webp`;
  const tempOutput = path.join(tempDir, outputFileName);
  const storagePath = `public/sites/${siteId}/images/${outputFileName}`;

  try {
    await bucket.file(sourceImagePath).download({destination: tempInput});

    await sharp(tempInput)
      .rotate()
      .resize({
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        fit: "cover",
        position: "centre",
      })
      .webp({quality: 85})
      .toFile(tempOutput);

    const uploadedFile = bucket.file(storagePath);
    await bucket.upload(tempOutput, {
      destination: storagePath,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {
          process: "true",
          variant: "marker",
          original: sourceImagePath,
        },
      },
    });

    await uploadedFile.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    logger.info(`✅ Marker image created: ${publicUrl}`);

    return {publicUrl, storagePath};
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await fs.unlink(tempInput).catch(() => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await fs.unlink(tempOutput).catch(() => {});
  }
};
