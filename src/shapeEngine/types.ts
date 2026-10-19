export type Point = {
  x: number;
  y: number;
};

export type PathSample = {
  x: number;
  y: number;
  /** Local tangent angle in radians (−π..π). */
  angle: number;
  /** Index in the dense sample list. */
  pathIndex: number;
  /** Distance along the path from the start, in normalized units. */
  distance: number;
};

export type LineCell = {
  /** Flat index: `y * gridSize + x`. */
  index: number;
  x: number;
  y: number;
  center: Point;
  /** Mean local line direction in radians. */
  angle: number;
  /** Order of first visit along the path (0..lineCells-1). */
  pathIndex: number;
};

export type ShapeDefinition = {
  name: string;
  /** SVG path `d` in normalized 0..1 coordinates. */
  path: string;
  gridSize: number;
};

export type BuiltShape = {
  definition: ShapeDefinition;
  samples: PathSample[];
  lineCells: LineCell[];
  lineCellCount: number;
};

/** Inclusive cell bounds on the project grid. */
export type GridRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ClaimValidation =
  | { ok: true; fraction: number }
  | {
      ok: false;
      fraction: number;
      reason: 'too_few' | 'too_many' | 'overlap' | 'unknown_cell' | 'empty' | 'no_line';
    };

export type GrayImage = {
  width: number;
  height: number;
  /** Row-major luminance 0..255. */
  pixels: Uint8Array;
};

/**
 * Capture diagnostics for agent Metro grepping (`SCORE_MATCH_DEBUG_JSON=`).
 * Not shown in the UI.
 */
export type ScoreMatchDebug = {
  templatePointCount: number;
  rawHits: number;
  rawHitRate: number;
  runMax: number;
  longRunCount: number;
  scoredHits: number;
  shiftX: number;
  shiftY: number;
  /** OCM similarity after continuity soft weight, before NOCD gate. */
  rawSimilarity: number;
  /** Best normalizer similarity at the same pose (NOCD). */
  accidentalSimilarity: number;
  minPassScore: number;
  minCoherentRun: number;
  imageWidth: number;
  imageHeight: number;
  viewWindow: { x: number; y: number; size: number } | null;
  /**
   * Machine-readable cause for the next fix:
   * - `ok` — passed gates
   * - `empty_template` — no samples in claim
   * - `run_filter_killed_hits` — raw hits exist but runMax < minCoherentRun
   * - `large_claim_sparse_hits` — many samples, few raw hits (empty neck/base likely)
   * - `weak_silhouette` — few raw hits overall
   * - `below_pass_floor` — score structure ok-ish but under minPassScore
   * - `null_baseline` — lost to null percentile only
   */
  diagnosis:
    | 'ok'
    | 'empty_template'
    | 'run_filter_killed_hits'
    | 'large_claim_sparse_hits'
    | 'weak_silhouette'
    | 'below_pass_floor'
    | 'null_baseline';
};

export type ScoreMatchResult = {
  /** Best soft match score in 0..1 after shift search. */
  score: number;
  /** True when score beats the null-baseline percentile gate. */
  passed: boolean;
  /** Null-baseline score at the configured percentile. */
  nullPercentileScore: number;
  /** Per-capture diagnostics for tuning (temporary). */
  debug: ScoreMatchDebug;
};
