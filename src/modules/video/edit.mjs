// FlowWitness video module — edit model validation and render planning.
// Pure functions only: no I/O, no imports beyond node:crypto, safe to unit test.

import { createHash } from "node:crypto";

export class VideoFault extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "VideoFault";
    this.code = code;
    this.status = status;
  }
}

export function demand(ok, message, code = "invalid_request", status = 400) {
  if (!ok) throw new VideoFault(code, message, status);
}

export const LOCALES = ["en", "zh"];

export const DEFAULT_COLORS = Object.freeze({
  primary: "#ffcc00",
  background: "#000000",
  text: "#ffffff",
});

export const DEFAULT_LIMITS = Object.freeze({
  maxSegments: 50,
  maxCaptions: 200,
  maxHighlights: 50,
  maxOutputMs: 15 * 60 * 1000,
  maxCaptionChars: 500,
});

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const WHITESPACE = /\s/;

// Control characters are rejected without regex escapes so this file stays
// plain printable ASCII/UTF-8. Newlines are allowed only in caption text.
function hasControlChars(value, { allowNewline = false } = {}) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 10 && allowNewline) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

// Artifact references are opaque scoped IDs, never filesystem paths or URLs.
export function isArtifactRef(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("?") &&
    !value.includes("..") &&
    !WHITESPACE.test(value) &&
    !hasControlChars(value)
  );
}

export function isOpaqueId(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    !WHITESPACE.test(value) &&
    !hasControlChars(value)
  );
}

function isMs(value) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isFraction(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function demandMs(value, label) {
  demand(isMs(value), `${label} must be a non-negative integer millisecond value`);
}

const EDIT_KEYS = [
  "trim",
  "segments",
  "captions",
  "logoArtifactId",
  "colors",
  "highlights",
  "narrationArtifactId",
];

function rejectUnknownKeys(obj, allowed, label) {
  demand(obj !== null && typeof obj === "object" && !Array.isArray(obj), `${label} must be an object`);
  for (const key of Object.keys(obj)) {
    demand(allowed.includes(key), `Unknown ${label} field "${key}"`);
  }
}

export function defaultEdit() {
  return {
    trim: null,
    segments: [],
    captions: [],
    logoArtifactId: null,
    colors: { ...DEFAULT_COLORS },
    highlights: [],
    narrationArtifactId: null,
  };
}

function normalizeTrim(trim) {
  if (trim === undefined || trim === null) return null;
  rejectUnknownKeys(trim, ["startMs", "endMs"], "trim");
  const startMs = trim.startMs ?? 0;
  demandMs(startMs, "trim.startMs");
  const endMs = trim.endMs ?? null;
  if (endMs !== null) {
    demandMs(endMs, "trim.endMs");
    demand(endMs > startMs, "trim.endMs must be greater than trim.startMs", "edit_out_of_bounds");
  }
  return { startMs, endMs };
}

function normalizeSegments(segments) {
  if (segments === undefined || segments === null) return [];
  demand(Array.isArray(segments), "segments must be an array");
  demand(
    segments.length <= DEFAULT_LIMITS.maxSegments,
    `At most ${DEFAULT_LIMITS.maxSegments} segments`,
    "edit_out_of_bounds",
  );
  return segments.map((segment, index) => {
    rejectUnknownKeys(segment, ["startMs", "endMs"], `segments[${index}]`);
    demandMs(segment?.startMs, `segments[${index}].startMs`);
    demandMs(segment?.endMs, `segments[${index}].endMs`);
    demand(
      segment.endMs > segment.startMs,
      `segments[${index}].endMs must be greater than startMs`,
      "edit_out_of_bounds",
    );
    return { startMs: segment.startMs, endMs: segment.endMs };
  });
}

function normalizeCaption(caption, index, limits) {
  rejectUnknownKeys(caption, ["startMs", "endMs", "text"], `captions[${index}]`);
  demandMs(caption?.startMs, `captions[${index}].startMs`);
  demandMs(caption?.endMs, `captions[${index}].endMs`);
  demand(
    caption.endMs > caption.startMs,
    `captions[${index}].endMs must be greater than startMs`,
    "edit_out_of_bounds",
  );
  demand(
    typeof caption.text === "string" &&
      caption.text.trim().length > 0 &&
      caption.text.length <= limits.maxCaptionChars &&
      !hasControlChars(caption.text, { allowNewline: true }),
    `captions[${index}].text must be 1..${limits.maxCaptionChars} printable characters`,
  );
  return { startMs: caption.startMs, endMs: caption.endMs, text: caption.text };
}

function normalizeCaptions(captions, limits) {
  if (captions === undefined || captions === null) return [];
  demand(Array.isArray(captions), "captions must be an array");
  demand(
    captions.length <= limits.maxCaptions,
    `At most ${limits.maxCaptions} captions`,
    "edit_out_of_bounds",
  );
  return captions.map((caption, index) => normalizeCaption(caption, index, limits));
}

function normalizeHighlight(highlight, index) {
  rejectUnknownKeys(highlight, ["startMs", "endMs", "x", "y", "width", "height"], `highlights[${index}]`);
  demandMs(highlight?.startMs, `highlights[${index}].startMs`);
  demandMs(highlight?.endMs, `highlights[${index}].endMs`);
  demand(
    highlight.endMs > highlight.startMs,
    `highlights[${index}].endMs must be greater than startMs`,
    "edit_out_of_bounds",
  );
  for (const key of ["x", "y", "width", "height"]) {
    demand(isFraction(highlight[key]), `highlights[${index}].${key} must be a number in [0,1]`);
  }
  demand(highlight.width > 0 && highlight.height > 0, `highlights[${index}] must have positive size`);
  demand(
    highlight.x + highlight.width <= 1 && highlight.y + highlight.height <= 1,
    `highlights[${index}] must fit inside the frame`,
  );
  return {
    startMs: highlight.startMs,
    endMs: highlight.endMs,
    x: highlight.x,
    y: highlight.y,
    width: highlight.width,
    height: highlight.height,
  };
}

function normalizeHighlights(highlights) {
  if (highlights === undefined || highlights === null) return [];
  demand(Array.isArray(highlights), "highlights must be an array");
  demand(
    highlights.length <= DEFAULT_LIMITS.maxHighlights,
    `At most ${DEFAULT_LIMITS.maxHighlights} highlights`,
    "edit_out_of_bounds",
  );
  return highlights.map((highlight, index) => normalizeHighlight(highlight, index));
}

function normalizeColors(colors) {
  if (colors === undefined || colors === null) return { ...DEFAULT_COLORS };
  rejectUnknownKeys(colors, ["primary", "background", "text"], "colors");
  const merged = { ...DEFAULT_COLORS };
  for (const key of ["primary", "background", "text"]) {
    if (colors[key] !== undefined) {
      demand(
        typeof colors[key] === "string" && HEX_COLOR.test(colors[key]),
        `colors.${key} must be a #RRGGBB hex color`,
      );
      merged[key] = colors[key].toLowerCase();
    }
  }
  return merged;
}

function normalizeRef(value, label) {
  if (value === undefined || value === null) return null;
  demand(
    isArtifactRef(value),
    `${label} must be an opaque artifact ID, never a path or URL`,
    "artifact_ref_invalid",
  );
  return value;
}

// Structural validation of a complete edit object. Timing bounds that depend on
// the probed source duration are checked separately by resolveTiming().
export function normalizeEdit(input, { limits = DEFAULT_LIMITS } = {}) {
  if (input === undefined || input === null) return defaultEdit();
  rejectUnknownKeys(input, EDIT_KEYS, "edit");
  return {
    trim: normalizeTrim(input.trim),
    segments: normalizeSegments(input.segments),
    captions: normalizeCaptions(input.captions, limits),
    logoArtifactId: normalizeRef(input.logoArtifactId, "edit.logoArtifactId"),
    colors: normalizeColors(input.colors),
    highlights: normalizeHighlights(input.highlights),
    narrationArtifactId: normalizeRef(input.narrationArtifactId, "edit.narrationArtifactId"),
  };
}

// Merge operator-supplied partial edit fields over an existing edit object,
// then revalidate the whole result.
export function mergeEdit(existing, patch, options = {}) {
  const merged = { ...existing };
  if (patch !== undefined && patch !== null) {
    rejectUnknownKeys(patch, EDIT_KEYS, "edit");
    for (const key of EDIT_KEYS) {
      if (key in patch) merged[key] = patch[key];
    }
  }
  return normalizeEdit(merged, options);
}

// Resolve the concrete cut list against the probed source duration. When
// sourceDurationMs is null (duration not yet probed), only the checks that
// are computable from the edit itself run; the remaining bounds are enforced
// at render submission time once ffprobe has measured the source artifact.
export function resolveTiming(edit, sourceDurationMs = null, limits = DEFAULT_LIMITS) {
  const startMs = edit.trim?.startMs ?? 0;
  const endMs = edit.trim?.endMs ?? sourceDurationMs;
  if (sourceDurationMs !== null) {
    demand(
      startMs < sourceDurationMs,
      `trim.startMs ${startMs} is at or beyond the source duration ${sourceDurationMs}ms`,
      "edit_out_of_bounds",
    );
    if (endMs !== null) {
      demand(
        endMs <= sourceDurationMs,
        `trim.endMs ${endMs} exceeds the source duration ${sourceDurationMs}ms`,
        "edit_out_of_bounds",
      );
    }
  }
  let segments;
  if (edit.segments.length > 0) {
    segments = edit.segments.map((segment, index) => {
      demand(
        segment.startMs >= startMs,
        `segments[${index}] starts before the trim window`,
        "edit_out_of_bounds",
      );
      if (endMs !== null) {
        demand(
          segment.endMs <= endMs,
          `segments[${index}] ends after the trim window`,
          "edit_out_of_bounds",
        );
      }
      return { startMs: segment.startMs, endMs: segment.endMs };
    });
  } else {
    demand(
      endMs !== null,
      "Source duration is required to resolve the trim window",
      "edit_out_of_bounds",
    );
    segments = [{ startMs, endMs }];
  }
  const outputDurationMs = segments.reduce((total, s) => total + (s.endMs - s.startMs), 0);
  demand(
    outputDurationMs > 0 && outputDurationMs <= limits.maxOutputMs,
    `Rendered duration must be 1..${limits.maxOutputMs}ms`,
    "edit_out_of_bounds",
  );
  for (const [index, caption] of edit.captions.entries()) {
    demand(
      caption.endMs <= outputDurationMs,
      `captions[${index}] ends after the ${outputDurationMs}ms rendered timeline`,
      "edit_out_of_bounds",
    );
  }
  for (const [index, highlight] of edit.highlights.entries()) {
    demand(
      highlight.endMs <= outputDurationMs,
      `highlights[${index}] ends after the ${outputDurationMs}ms rendered timeline`,
      "edit_out_of_bounds",
    );
  }
  return {
    trim: { startMs, endMs: endMs ?? segments[segments.length - 1].endMs },
    segments,
    outputDurationMs,
  };
}

// Timing checks that can run before the source duration is known (create/update).
export function preflightTiming(edit, limits = DEFAULT_LIMITS) {
  if (edit.trim?.endMs != null || edit.segments.length > 0) {
    resolveTiming(edit, null, limits);
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

// Content hash binding a rendered output to the exact edit that produced it.
// Publication refuses outputs whose hash no longer matches the current edit.
export function editHash(locale, edit) {
  return createHash("sha256")
    .update(stableStringify({ locale, edit }))
    .digest("hex");
}
