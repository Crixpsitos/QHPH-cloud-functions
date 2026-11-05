import sharp from "sharp";

export interface WebpOptions {
  maxWidth: number;
  quality: number;
  effort?: number;
}

/**
 * Imágenes de eventos: 1920 px de ancho y calidad 90. Medido contra fotos reales
 * (SSIM): el daño visible venía de 1200 px/q80 y de la segunda compresión q75
 * de /_next/image; 2400 px no mejora lo bastante para pagar el peso.
 * ponytail: ajustar con SSIM si cambia la política de calidad.
 */
export const EVENT_IMAGE_OPTIONS: WebpOptions = {
  maxWidth: 1920,
  quality: 90,
  effort: 5,
};

/**
 * Codifica una imagen a WebP respetando la orientación EXIF y sin ampliarla.
 * @param {string | Buffer} input ruta o buffer de la imagen original
 * @param {WebpOptions} o ancho máximo, calidad y esfuerzo
 * @return {sharp.Sharp} pipeline listo para `toFile` o `toBuffer`
 */
export function webpPipeline(input: string | Buffer, o: WebpOptions) {
  return sharp(input)
    .rotate()
    .resize({width: o.maxWidth, withoutEnlargement: true, fit: "inside"})
    .webp({quality: o.quality, effort: o.effort ?? 4, smartSubsample: true});
}

/**
 * Igual que `webpPipeline` pero devuelve el buffer.
 * @param {string | Buffer} input ruta o buffer de la imagen original
 * @param {WebpOptions} o ancho máximo, calidad y esfuerzo
 * @return {Promise<Buffer>} imagen WebP
 */
export const encodeWebp = (input: string | Buffer, o: WebpOptions) =>
  webpPipeline(input, o).toBuffer();
