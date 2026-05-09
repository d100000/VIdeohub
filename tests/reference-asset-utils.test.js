import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReferenceAssets,
  normalizeReferenceSubjectType,
  primaryReferenceImageUrl,
} from "../lib/reference-asset-utils.js";

test("normalizeReferenceSubjectType only accepts person and generic", () => {
  assert.equal(normalizeReferenceSubjectType("person"), "person");
  assert.equal(normalizeReferenceSubjectType("PERSON"), "person");
  assert.equal(normalizeReferenceSubjectType("generic"), "generic");
  assert.equal(normalizeReferenceSubjectType("unknown"), "generic");
});

test("normalizeReferenceAssets supports structured references and legacy fallback", () => {
  assert.deepEqual(
    normalizeReferenceAssets({
      referenceAssets: [
        { url: "https://example.com/person.png", subjectType: "person" },
        { url: " https://example.com/style.png ", subject_type: "generic" },
        { url: "   " },
      ],
    }),
    [
      { url: "https://example.com/person.png", subjectType: "person" },
      { url: "https://example.com/style.png", subjectType: "generic" },
    ],
  );

  assert.deepEqual(
    normalizeReferenceAssets({ referenceImageUrl: "https://example.com/legacy.png" }),
    [{ url: "https://example.com/legacy.png", subjectType: "generic" }],
  );
});

test("primaryReferenceImageUrl returns the first usable reference", () => {
  assert.equal(
    primaryReferenceImageUrl({
      referenceAssets: [
        { url: "https://example.com/a.png", subjectType: "person" },
        { url: "https://example.com/b.png", subjectType: "generic" },
      ],
    }),
    "https://example.com/a.png",
  );
  assert.equal(primaryReferenceImageUrl({ referenceImageUrl: "https://example.com/legacy.png" }), "https://example.com/legacy.png");
  assert.equal(primaryReferenceImageUrl({}), "");
});
