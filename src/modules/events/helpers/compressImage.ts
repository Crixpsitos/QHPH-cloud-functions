import {logger} from "firebase-functions";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {bucket} from "../../../config/firebase";
import os from "os";

export const compressImage = async (
  filePath: string,
): Promise<{
  publicUrl: string;
  path: string;
  width: number;
  height: number;
}> => {
  const tempDir = os.tmpdir();
  const fileName = path.basename(filePath);
  const baseName = path.basename(fileName, path.extname(fileName));
  const tempInput = path.join(tempDir, fileName);

  const cleanBaseName = baseName.replace(/^deoptimized[-_]?/i, "");
  const outputFileName = `optimized_${cleanBaseName}.webp`;
  const tempOutput = path.join(tempDir, outputFileName);
  const destinationPath = path.join(path.dirname(filePath), outputFileName);

  try {
    await bucket.file(filePath).download({destination: tempInput});

    const infoInfo = await sharp(tempInput)
      .rotate()
      .resize({
        width: 1200,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({
        quality: 80,
        effort: 4,
        smartSubsample: true,
      })
      .toFile(tempOutput);

    const uploadedFile = bucket.file(destinationPath);

    await bucket.upload(tempOutput, {
      destination: destinationPath,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000",
        metadata: {
          process: "true",
          variant: "compressed",
          original: filePath,
        },
      },
    });

    await uploadedFile.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;

    logger.info(`✅ Compressed: ${publicUrl}`);
    await fs.unlink(tempOutput);

    return {
      publicUrl,
      path: destinationPath,
      width: infoInfo.width,
      height: infoInfo.height,
    };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await fs.unlink(tempInput).catch(() => {});
  }
};
