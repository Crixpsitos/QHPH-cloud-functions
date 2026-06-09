import ffmpeg from "../../../config/ffmpeg";

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  isVertical: boolean;
  hasAudio: boolean;
}

export const getVideoInfo = (filePath: string): Promise<VideoInfo> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const videoStream = data.streams.find((s) => s.codec_type === "video");
      const audioStream = data.streams.find((s) => s.codec_type === "audio");

      const width = videoStream?.width ?? 1280;
      const height = videoStream?.height ?? 720;

      resolve({
        width,
        height,
        duration: data.format.duration ?? 0,
        isVertical: height > width,
        hasAudio: !!audioStream,
      });
    });
  });
};
