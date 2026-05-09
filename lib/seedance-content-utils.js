import { normalizeReferenceSubjectType } from "./reference-asset-utils.js";

function normalizeContentUrl(url) {
  return String(url || "").trim();
}

export function buildSeedanceTextContentItem(text) {
  const value = String(text || "").trim();
  return value
    ? {
        type: "text",
        text: value,
      }
    : null;
}

export function buildReferenceImageContentItem(asset) {
  const url = normalizeContentUrl(asset?.url || asset?.imageUrl);
  if (!url) return null;
  return {
    type: "image_url",
    role: "reference_image",
    subject_type: normalizeReferenceSubjectType(asset?.subjectType || asset?.subject_type),
    image_url: {
      url,
    },
  };
}

export function buildReferenceVideoContentItem(url) {
  const value = normalizeContentUrl(url);
  if (!value) return null;
  return {
    type: "video_url",
    role: "reference_video",
    video_url: {
      url: value,
    },
  };
}

export function buildReferenceAudioContentItem(url) {
  const value = normalizeContentUrl(url);
  if (!value) return null;
  return {
    type: "audio_url",
    role: "reference_audio",
    audio_url: {
      url: value,
    },
  };
}

export function buildFrameImageContentItem(url, role) {
  const value = normalizeContentUrl(url);
  if (!value) return null;
  return {
    type: "image_url",
    role,
    image_url: {
      url: value,
    },
  };
}
