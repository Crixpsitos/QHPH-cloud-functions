import ffmpeg from "../../../config/ffmpeg";
import {getVideoInfo} from "./getVideoInfo";

export interface ProcessedVideoResult {
  width: number;
  height: number;
  duration: number;
}

export const processVideo = async (
  input: string,
  output: string,
): Promise<ProcessedVideoResult> => {
  const {isVertical, hasAudio} = await getVideoInfo(input);

  const scaleFilter = isVertical ?
    "scale=-2:min(1280\\,ih)" :
    "scale=min(1280\\,iw):-2";

  const crf = isVertical ? "28" : "26";

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(input)
      .videoCodec("libx264")
      .outputOptions([
        `-vf ${scaleFilter}`,
        `-crf ${crf}`,
        "-preset slow",
        "-profile:v main",
        "-movflags +faststart",
        "-pix_fmt yuv420p",
      ])
      .fps(30)
      .toFormat("mp4")
      .output(output);

    if (hasAudio) {
      command.audioCodec("aac").audioBitrate("128k");
    } else {
      command.noAudio();
    }

    command.on("end", () => resolve()).on("error", reject).run();
  });

  const outputInfo = await getVideoInfo(output);

  return {
    width: outputInfo.width,
    height: outputInfo.height,
    duration: outputInfo.duration,
  };
};
