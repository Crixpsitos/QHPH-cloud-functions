import ffmpeg from "../../../config/ffmpeg";

export const extractThumbnail = (
  input: string,
  outputDir: string,
  filename: string,
): Promise<void> => {
  return new Promise((resolve) => {
    ffmpeg(input)
      .screenshots({
        timestamps: ["00:00:01"], // frame del segundo 1
        filename,
        folder: outputDir,
      })
      .on("end", () => resolve())
      .on("error", (err) => {
        console.warn("⚠️ Thumbnail falló:", err.message);
        resolve();
      });
  });
};
