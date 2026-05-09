function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function singleImageOutputArgs(outputPath) {
  return ["-frames:v", "1", "-update", "1", "-q:v", "2", outputPath];
}

export function missingFrameAssets(task = {}) {
  const firstFrameAssetId = task.first_frame_asset_id ?? task.firstFrameAssetId;
  const lastFrameAssetId = task.last_frame_asset_id ?? task.lastFrameAssetId;
  return {
    needFirstFrame: !hasValue(firstFrameAssetId),
    needLastFrame: !hasValue(lastFrameAssetId),
  };
}

export function buildFrameCaptureAttempts({ frame, inputPath, outputPath }) {
  if (frame === "first") {
    return [
      {
        label: "decode_first_frame",
        args: ["-y", "-i", inputPath, "-vf", "select=eq(n\\,0)", ...singleImageOutputArgs(outputPath)],
      },
      {
        label: "seek_zero",
        args: ["-y", "-ss", "0", "-i", inputPath, ...singleImageOutputArgs(outputPath)],
      },
    ];
  }

  if (frame === "last") {
    return [
      {
        label: "seek_from_end",
        args: ["-y", "-sseof", "-0.1", "-i", inputPath, ...singleImageOutputArgs(outputPath)],
      },
      {
        label: "seek_tail_window",
        args: ["-y", "-sseof", "-1", "-i", inputPath, ...singleImageOutputArgs(outputPath)],
      },
    ];
  }

  throw new Error(`Unsupported frame kind: ${frame}`);
}
