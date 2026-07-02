import {logger} from "firebase-functions";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {bucket} from "../../../config/firebase";
import os from "os";

type FocalPoint = {x: number; y: number};

const VARIANTES = [
  {
    suffix: "desktop",
    width: 1920,
    height: 1080,
    webp: {quality: 88, effort: 6, smartSubsample: true},
  },
  {
    suffix: "tablet",
    width: 768,
    height: 432,
    webp: {quality: 78, effort: 5, smartSubsample: true},
  },
  {
    suffix: "mobile",
    width: 390,
    height: 219,
    webp: {quality: 72, effort: 4, smartSubsample: true},
  },
];

/**
 * Clamps a number between 0 and 1.
 * @param {number} n - The number to clamp.
 * @return {number} The clamped value.
 */
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Calculates the crop rectangle based on a focal point.
 * @param {number} sourceWidth - Original image width.
 * @param {number} sourceHeight - Original image height.
 * @param {number} targetWidth - Desired width.
 * @param {number} targetHeight - Desired height.
 * @param {FocalPoint} focalPoint - The focal point coordinates (0-1).
 * @return {object} The crop rectangle (left, top, width, height).
 */
function getCropRectFromFocalPoint(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  focalPoint: FocalPoint,
) {
  const srcRatio = sourceWidth / sourceHeight;
  const dstRatio = targetWidth / targetHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (srcRatio > dstRatio) {
    cropWidth = Math.round(sourceHeight * dstRatio);
    cropHeight = sourceHeight;
  } else if (srcRatio < dstRatio) {
    cropWidth = sourceWidth;
    cropHeight = Math.round(sourceWidth / dstRatio);
  }
  // If srcRatio === dstRatio, use the full source dimensions

  // If there's room to move the crop (source is bigger than required crop),
  // center it on the focal point
  const maxLeftOffset = sourceWidth - cropWidth;
  const maxTopOffset = sourceHeight - cropHeight;

  let left = 0;
  let top = 0;

  if (maxLeftOffset > 0 || maxTopOffset > 0) {
    const fx = clamp01(focalPoint.x) * sourceWidth;
    const fy = clamp01(focalPoint.y) * sourceHeight;

    left = Math.round(fx - cropWidth / 2);
    top = Math.round(fy - cropHeight / 2);

    left = Math.max(0, Math.min(left, maxLeftOffset));
    top = Math.max(0, Math.min(top, maxTopOffset));
  }

  return {left, top, width: cropWidth, height: cropHeight};
}

export const optimizedAndCreateVariants = async (
  filePath: string,
  options?: {focalPoint?: FocalPoint},
): Promise<
  Record<
    string,
    {publicUrl: string; width: number; height: number; path: string}
  >
> => {
  logger.info(`🚀 Starting optimization for: ${filePath}`);
  logger.info("focalPoint:", options?.focalPoint);

  const tempDir = os.tmpdir();
  const fileName = path.basename(filePath);
  const baseName = path.basename(fileName, path.extname(fileName));
  const destinationDir = path.dirname(filePath);
  const tempInput = path.join(tempDir, fileName);
  const cleanBaseName = baseName.replace(/^deoptimized[-_]?/i, "");

  try {
    await bucket.file(filePath).download({destination: tempInput});

    // First, get metadata AFTER applying rotation to account for EXIF orientation
    const image = sharp(tempInput).rotate();
    const inputMeta = await image.metadata();
    const sourceWidth = inputMeta.width ?? 0;
    const sourceHeight = inputMeta.height ?? 0;

    const results = await Promise.all(
      VARIANTES.map(async ({suffix, width, height, webp}) => {
        const outputFileName = `optimized_${cleanBaseName}_${suffix}.webp`;
        const tempVariant = path.join(tempDir, outputFileName);
        const fullDestPath = path.join(destinationDir, outputFileName);

        const pipeline = sharp(tempInput).rotate();

        if (options?.focalPoint && sourceWidth > 0 && sourceHeight > 0) {
          const crop = getCropRectFromFocalPoint(
            sourceWidth,
            sourceHeight,
            width,
            height,
            options.focalPoint,
          );

          logger.info("crop:", crop);

          await pipeline
            .extract(crop)
            .resize({
              width,
              height,
              fit: "fill",
              withoutEnlargement: true,
            })
            .webp(webp)
            .toFile(tempVariant);
        } else {
          await pipeline
            .resize({
              width,
              height,
              fit: "cover",
              position: "centre",
              withoutEnlargement: true,
            })
            .webp(webp)
            .toFile(tempVariant);
        }

        const uploadedFile = bucket.file(fullDestPath);

        await bucket.upload(tempVariant, {
          destination: fullDestPath,
          metadata: {
            contentType: "image/webp",
            cacheControl: "public, max-age=31536000, immutable",
            metadata: {
              process: "true",
              variant: suffix,
              original: filePath,
            },
          },
        });

        await uploadedFile.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fullDestPath}`;

        await fs.unlink(tempVariant);
        logger.info(`✅ Variant ${suffix}: ${publicUrl}`);

        return {suffix, publicUrl, width, height, path: fullDestPath};
      }),
    );

    return results.reduce(
      (acc, {suffix, publicUrl, width, height, path}) => ({
        ...acc,
        [suffix]: {publicUrl, width, height, path},
      }),
      {} as Record<
        string,
        {publicUrl: string; width: number; height: number; path: string}
      >,
    );
  } finally {
    // eslint-disable-next-line
    await fs.unlink(tempInput).catch(() => {});
    logger.info(`🎉 Done: ${filePath}`);
  }
};
