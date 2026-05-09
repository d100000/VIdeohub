import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFrameImageContentItem,
  buildReferenceAudioContentItem,
  buildReferenceImageContentItem,
  buildReferenceVideoContentItem,
  buildSeedanceTextContentItem,
} from "../lib/seedance-content-utils.js";

test("buildReferenceImageContentItem uses the exact person reference image shape", () => {
  assert.deepEqual(
    buildReferenceImageContentItem({
      url: " https://example.com/person.png ",
      subjectType: "person",
    }),
    {
      type: "image_url",
      role: "reference_image",
      subject_type: "person",
      image_url: {
        url: "https://example.com/person.png",
      },
    },
  );
});

test("buildReferenceImageContentItem normalizes generic references into the nested image_url format", () => {
  const item = buildReferenceImageContentItem({
    imageUrl: "https://example.com/style.png",
    subject_type: "unknown",
  });

  assert.deepEqual(item, {
    type: "image_url",
    role: "reference_image",
    subject_type: "generic",
    image_url: {
      url: "https://example.com/style.png",
    },
  });
  assert.equal(Object.hasOwn(item, "url"), false);
  assert.equal(Object.hasOwn(item, "imageUrl"), false);
});

test("Seedance content helpers keep non-image reference roles in the provider format", () => {
  assert.deepEqual(buildSeedanceTextContentItem("  hello world  "), {
    type: "text",
    text: "hello world",
  });
  assert.deepEqual(buildReferenceVideoContentItem("https://example.com/reference.mp4"), {
    type: "video_url",
    role: "reference_video",
    video_url: {
      url: "https://example.com/reference.mp4",
    },
  });
  assert.deepEqual(buildReferenceAudioContentItem("https://example.com/reference.mp3"), {
    type: "audio_url",
    role: "reference_audio",
    audio_url: {
      url: "https://example.com/reference.mp3",
    },
  });
  assert.deepEqual(buildFrameImageContentItem("https://example.com/first-frame.png", "first_frame"), {
    type: "image_url",
    role: "first_frame",
    image_url: {
      url: "https://example.com/first-frame.png",
    },
  });
});
