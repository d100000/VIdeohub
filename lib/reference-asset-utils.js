export function normalizeReferenceSubjectType(value) {
  return String(value || "").trim().toLowerCase() === "person" ? "person" : "generic";
}

export function normalizeReferenceAssets(value, fallbackUrl = "") {
  const assets = Array.isArray(value)
    ? value
    : value && Array.isArray(value.referenceAssets)
      ? value.referenceAssets
      : [];

  const normalized = assets
    .map((asset) => {
      const url = String(asset?.url || asset?.imageUrl || "").trim();
      if (!url) return null;
      return {
        url,
        subjectType: normalizeReferenceSubjectType(asset?.subjectType || asset?.subject_type),
      };
    })
    .filter(Boolean);

  if (normalized.length) return normalized;

  const legacyUrl = String(
    fallbackUrl ||
      (value && !Array.isArray(value) ? value.referenceImageUrl || "" : ""),
  ).trim();

  return legacyUrl
    ? [{ url: legacyUrl, subjectType: "generic" }]
    : [];
}

export function primaryReferenceImageUrl(value, fallbackUrl = "") {
  return normalizeReferenceAssets(value, fallbackUrl)[0]?.url || "";
}
