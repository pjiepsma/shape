import { gameRules } from '@/config/gameRules';

import { rectContainsCell } from './gridRect';
import type {
  GrayImage,
  GridRect,
  PathSample,
  ScoreMatchDebug,
  ScoreMatchResult,
} from './types';

export type ScoreViewWindow = {
  x: number;
  y: number;
  size: number;
};

/** Camera / preview layout size — required for cover-aligned projection. */
export type ScoreViewSize = {
  width: number;
  height: number;
};

export type TemplatePoint = {
  /** Normalized project x (0..1). */
  x: number;
  /** Normalized project y (0..1). */
  y: number;
  /** Local tangent angle in radians. */
  angle: number;
};

type EdgeScene = {
  width: number;
  height: number;
  /** Distance to nearest edge pixel (px). */
  dist: Float32Array;
  /** Tangent angle of the nearest edge pixel. */
  nearestTangent: Float32Array;
};

type ProjectedPoint = {
  x: number;
  y: number;
  angle: number;
};

type OcmScore = {
  /** Similarity 0..1 after NOCD-lite accidentalness. */
  score: number;
  /** Raw OCM similarity before accidentalness. */
  rawSimilarity: number;
  /** Best normalizer similarity at the same pose. */
  accidentalSimilarity: number;
  rawHits: number;
  rawHitRate: number;
  runMax: number;
  longRunCount: number;
  scoredHits: number;
};

/**
 * Oriented Chamfer Matching (OCM) + NOCD-lite accidentalness.
 *
 * Literature:
 * - Chamfer / oriented edge matching (Huttenlocher, Olson & Huttenlocher TIP 1997)
 * - OCM form d=(1-λ)d_dist+λd_orient (chess-piece OCM; Shotton-style)
 * - Accidentalness via normalizer curves (Latecki NOCD / BMVC Chamfer regularization)
 */
export function scoreMatch(args: {
  image: GrayImage;
  templatePoints: readonly TemplatePoint[];
  viewWindow?: ScoreViewWindow;
  /**
   * Preview layout size in the same space as the camera overlay.
   * When set, template points map through cover-fit (what the user saw).
   * When omitted, uses a centered square crop (fixtures / offline).
   */
  viewSize?: ScoreViewSize;
}): ScoreMatchResult {
  const { image, templatePoints, viewWindow, viewSize } = args;
  const scoring = gameRules.scoring;

  const emptyDebug = (): ScoreMatchResult => ({
    score: 0,
    passed: false,
    nullPercentileScore: 0,
    debug: {
      templatePointCount: templatePoints.length,
      rawHits: 0,
      rawHitRate: 0,
      runMax: 0,
      longRunCount: 0,
      scoredHits: 0,
      shiftX: 0,
      shiftY: 0,
      rawSimilarity: 0,
      accidentalSimilarity: 0,
      minPassScore: scoring.minPassScore,
      minCoherentRun: scoring.minCoherentRun,
      imageWidth: image.width,
      imageHeight: image.height,
      viewWindow: viewWindow
        ? { x: viewWindow.x, y: viewWindow.y, size: viewWindow.size }
        : null,
      diagnosis: 'empty_template',
    },
  });

  if (templatePoints.length === 0) {
    return emptyDebug();
  }

  const scene = buildEdgeScene(image, scoring.edgeMagnitudeFloor);
  const projected = templatePoints.map((point) =>
    projectNormalizedToImage(point, image, viewWindow, viewSize),
  );

  const best = bestShiftScore(
    scene,
    projected,
    scoring.chamferTauPx,
    scoring.orientLambda,
    scoring.partialKeepFraction,
    scoring.normalizerMargin,
    scoring.shiftSearchPx,
    scoring.shiftSearchStep,
  );

  const nullScores: number[] = [];
  for (let i = 0; i < scoring.nullBaselineCopies; i += 1) {
    nullScores.push(
      scoreNullProbe(
        scene,
        projected,
        scoring.chamferTauPx,
        scoring.orientLambda,
        scoring.partialKeepFraction,
        scoring.normalizerMargin,
        i,
        image.width,
        image.height,
      ),
    );
  }
  nullScores.sort((a, b) => a - b);
  const percentileIndex = Math.min(
    nullScores.length - 1,
    Math.max(0, Math.floor(scoring.nullBaselinePercentile * (nullScores.length - 1))),
  );
  const nullPercentileScore = nullScores[percentileIndex] ?? 0;
  // Top-end lift is applied inside ocmAtOffset for excellent matches only.
  const score = clamp01(best.score);
  const passed = score > nullPercentileScore && score >= scoring.minPassScore;

  const debug: ScoreMatchDebug = {
    templatePointCount: templatePoints.length,
    rawHits: best.rawHits,
    rawHitRate: best.rawHitRate,
    runMax: best.runMax,
    longRunCount: best.longRunCount,
    scoredHits: best.scoredHits,
    shiftX: best.shiftX,
    shiftY: best.shiftY,
    rawSimilarity: best.rawSimilarity,
    accidentalSimilarity: best.accidentalSimilarity,
    minPassScore: scoring.minPassScore,
    minCoherentRun: scoring.minCoherentRun,
    imageWidth: image.width,
    imageHeight: image.height,
    viewWindow: viewWindow
      ? { x: viewWindow.x, y: viewWindow.y, size: viewWindow.size }
      : null,
    diagnosis: diagnoseScoreMatch({
      passed,
      score,
      nullPercentileScore,
      rawHits: best.rawHits,
      rawHitRate: best.rawHitRate,
      runMax: best.runMax,
      accidentalSimilarity: best.accidentalSimilarity,
      rawSimilarity: best.rawSimilarity,
      templatePointCount: templatePoints.length,
      minPassScore: scoring.minPassScore,
    }),
  };

  return {
    score,
    passed,
    nullPercentileScore,
    debug,
  };
}

/** Full capture record for Metro: grep `SCORE_MATCH_DEBUG_JSON=`. */
export function buildScoreMatchCaptureLog(args: {
  draftRect: GridRect | null;
  guideLineCellCount: number;
  score: ScoreMatchResult;
}): Record<string, unknown> {
  const { draftRect, guideLineCellCount, score } = args;
  return {
    draftRect,
    guideLineCellCount,
    score: score.score,
    passed: score.passed,
    nullPercentileScore: score.nullPercentileScore,
    debug: score.debug,
    nextFix:
      score.debug.diagnosis === 'run_filter_killed_hits'
        ? 'scorer_run_gate'
        : score.debug.diagnosis === 'large_claim_sparse_hits'
          ? 'claim_or_overlay_mismatch'
          : score.debug.diagnosis === 'weak_silhouette'
            ? 'scorer_edge_gates_or_alignment'
            : score.debug.diagnosis === 'below_pass_floor'
              ? 'minPassScore'
              : score.debug.diagnosis === 'null_baseline'
                ? 'null_baseline'
                : score.debug.diagnosis === 'empty_template'
                  ? 'claim_has_no_outline_samples'
                  : 'none',
  };
}

function diagnoseScoreMatch(args: {
  passed: boolean;
  score: number;
  nullPercentileScore: number;
  rawHits: number;
  rawHitRate: number;
  runMax: number;
  accidentalSimilarity: number;
  rawSimilarity: number;
  templatePointCount: number;
  minPassScore: number;
}): ScoreMatchDebug['diagnosis'] {
  if (args.passed) {
    return 'ok';
  }
  if (args.templatePointCount === 0) {
    return 'empty_template';
  }
  if (
    args.rawSimilarity >= args.minPassScore &&
    args.accidentalSimilarity + 0.08 >= args.rawSimilarity
  ) {
    return 'null_baseline';
  }
  if (args.templatePointCount >= 120 && args.rawHitRate < 0.2) {
    return 'large_claim_sparse_hits';
  }
  if (args.rawHits < 12 || args.rawHitRate < 0.12) {
    return 'weak_silhouette';
  }
  if (args.score >= args.minPassScore && args.score <= args.nullPercentileScore) {
    return 'null_baseline';
  }
  if (args.score < args.minPassScore) {
    return 'below_pass_floor';
  }
  return 'null_baseline';
}

/** Path samples inside an inclusive grid claim rect → template points. */
export function templatePointsInRect(
  samples: readonly PathSample[],
  rect: GridRect,
  gridSize: number,
): TemplatePoint[] {
  const points: TemplatePoint[] = [];
  for (const sample of samples) {
    const cellX = Math.min(gridSize - 1, Math.max(0, Math.floor(sample.x * gridSize)));
    const cellY = Math.min(gridSize - 1, Math.max(0, Math.floor(sample.y * gridSize)));
    if (!rectContainsCell(rect, cellX, cellY)) {
      continue;
    }
    points.push({ x: sample.x, y: sample.y, angle: sample.angle });
  }
  return points;
}

function projectNormalizedToImage(
  point: TemplatePoint,
  image: GrayImage,
  viewWindow: ScoreViewWindow | undefined,
  viewSize: ScoreViewSize | undefined,
): ProjectedPoint {
  let nx = point.x;
  let ny = point.y;
  if (viewWindow) {
    nx = (point.x - viewWindow.x) / viewWindow.size;
    ny = (point.y - viewWindow.y) / viewWindow.size;
  }

  // Cover-fit photo into the preview, then map the centered square overlay —
  // same geometry as CameraView (fill) + ShapeCameraOverlay square.
  if (viewSize && viewSize.width > 0 && viewSize.height > 0) {
    const scale = Math.max(viewSize.width / image.width, viewSize.height / image.height);
    const sideView = Math.min(viewSize.width, viewSize.height);
    const sqX = (viewSize.width - sideView) / 2;
    const sqY = (viewSize.height - sideView) / 2;
    const originX = (viewSize.width - image.width * scale) / 2;
    const originY = (viewSize.height - image.height * scale) / 2;
    const vx = sqX + nx * sideView;
    const vy = sqY + ny * sideView;
    return {
      x: (vx - originX) / scale,
      y: (vy - originY) / scale,
      angle: point.angle,
    };
  }

  const side = Math.min(image.width, image.height);
  const ox = (image.width - side) / 2;
  const oy = (image.height - side) / 2;
  return {
    x: ox + nx * side,
    y: oy + ny * side,
    angle: point.angle,
  };
}

function bestShiftScore(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  normalizerMargin: number,
  shiftPx: number,
  step: number,
): OcmScore & { shiftX: number; shiftY: number } {
  let best: OcmScore & { shiftX: number; shiftY: number } = {
    score: 0,
    rawSimilarity: 0,
    accidentalSimilarity: 0,
    rawHits: 0,
    rawHitRate: 0,
    runMax: 0,
    longRunCount: 0,
    scoredHits: 0,
    shiftX: 0,
    shiftY: 0,
  };

  for (let dy = -shiftPx; dy <= shiftPx; dy += step) {
    for (let dx = -shiftPx; dx <= shiftPx; dx += step) {
      const result = ocmAtOffset(scene, points, tau, lambda, partialKeep, normalizerMargin, dx, dy);
      const betterScore = result.score > best.score + 1e-4;
      const sameScoreCloser =
        Math.abs(result.score - best.score) <= 1e-4 &&
        dx * dx + dy * dy < best.shiftX * best.shiftX + best.shiftY * best.shiftY;
      if (betterScore || sameScoreCloser) {
        best = { ...result, shiftX: dx, shiftY: dy };
      }
    }
  }
  return best;
}

function scoreNullProbe(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  normalizerMargin: number,
  seed: number,
  width: number,
  height: number,
): number {
  const ox = ((((seed * 13) % 1000) / 1000) - 0.5) * width * 0.5;
  const oy = ((((seed * 29) % 1000) / 1000) - 0.5) * height * 0.5;
  const angleSpin = (((seed * 37) % 1000) / 1000) * Math.PI;
  const spun = points.map((point) => ({
    x: point.x,
    y: point.y,
    angle: point.angle + angleSpin,
  }));
  return ocmAtOffset(scene, spun, tau, lambda, partialKeep, normalizerMargin, ox, oy).score;
}

function ocmAtOffset(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  normalizerMargin: number,
  offsetX: number,
  offsetY: number,
): OcmScore {
  if (points.length === 0) {
    return {
      score: 0,
      rawSimilarity: 0,
      accidentalSimilarity: 0,
      rawHits: 0,
      rawHitRate: 0,
      runMax: 0,
      longRunCount: 0,
      scoredHits: 0,
    };
  }

  const ocm = orientedChamferDetailed(
    scene,
    points,
    tau,
    lambda,
    partialKeep,
    offsetX,
    offsetY,
  );
  const hitStats = probeHitStats(scene, points, tau, offsetX, offsetY);

  const accidentalSimilarity = maxNormalizerSimilarity(
    scene,
    points,
    tau,
    lambda,
    partialKeep,
    offsetX,
    offsetY,
  );

  // Continuity: soft weight — full kill only when runs are tiny (clutter speckles).
  const continuity = continuityFactor(ocm.perPointGood, gameRules.scoring.minCoherentRun);
  const rawSimilarity = ocm.similarity * (0.35 + 0.65 * continuity);

  // NOCD-lite: crush when a simple curve matches about as well (clutter).
  // Dense hits that clearly beat accidental keep the measured OCM — no free %.
  const surplus = rawSimilarity - accidentalSimilarity;
  const nocdGate = softGate(surplus, normalizerMargin);
  const denseClearMatch =
    hitStats.rawHitRate >= 0.9 && surplus >= normalizerMargin;
  const score = clamp01(
    denseClearMatch ? rawSimilarity : rawSimilarity * nocdGate,
  );

  return {
    score,
    rawSimilarity,
    accidentalSimilarity,
    rawHits: hitStats.rawHits,
    rawHitRate: hitStats.rawHitRate,
    runMax: hitStats.runMax,
    longRunCount: hitStats.longRunCount,
    scoredHits: hitStats.scoredHits,
  };
}

function orientedChamferSimilarity(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  offsetX: number,
  offsetY: number,
): number {
  return orientedChamferDetailed(scene, points, tau, lambda, partialKeep, offsetX, offsetY)
    .similarity;
}

function orientedChamferDetailed(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  offsetX: number,
  offsetY: number,
): { similarity: number; perPointGood: boolean[] } {
  const costs: number[] = [];
  const perPointGood: boolean[] = [];
  for (const point of points) {
    const px = Math.round(point.x + offsetX);
    const py = Math.round(point.y + offsetY);
    if (px < 0 || py < 0 || px >= scene.width || py >= scene.height) {
      costs.push(1);
      perPointGood.push(false);
      continue;
    }
    const index = py * scene.width + px;
    const dDist = Math.min(tau, scene.dist[index] ?? tau) / tau;
    const dOrient = angleDelta(point.angle, scene.nearestTangent[index] ?? 0) / (Math.PI / 2);
    const cost = (1 - lambda) * dDist + lambda * Math.min(1, dOrient);
    costs.push(cost);
    perPointGood.push(cost <= 0.35);
  }

  const sorted = [...costs].sort((a, b) => a - b);
  const keep = Math.max(1, Math.floor(sorted.length * partialKeep));
  let sum = 0;
  for (let i = 0; i < keep; i += 1) {
    sum += sorted[i] ?? 1;
  }
  const dScore = sum / keep;
  return { similarity: clamp01(1 - dScore), perPointGood };
}

function continuityFactor(good: readonly boolean[], minRun: number): number {
  if (good.length === 0) {
    return 0;
  }
  let inLong = 0;
  let run = 0;
  let runMax = 0;
  for (let i = 0; i <= good.length; i += 1) {
    if (i < good.length && good[i]) {
      run += 1;
      continue;
    }
    if (run > runMax) {
      runMax = run;
    }
    if (run >= minRun) {
      inLong += run;
    }
    run = 0;
  }
  if (runMax < minRun) {
    return runMax / Math.max(minRun, 1);
  }
  return inLong / good.length;
}

function probeHitStats(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  offsetX: number,
  offsetY: number,
): { rawHits: number; rawHitRate: number; runMax: number; longRunCount: number; scoredHits: number } {
  const hitThreshold = tau * 0.35;
  let rawHits = 0;
  let run = 0;
  let runMax = 0;
  let longRunCount = 0;
  const minRun = gameRules.scoring.minCoherentRun;

  for (const point of points) {
    const px = Math.round(point.x + offsetX);
    const py = Math.round(point.y + offsetY);
    const inside = px >= 0 && py >= 0 && px < scene.width && py < scene.height;
    const dist = inside ? (scene.dist[py * scene.width + px] ?? tau) : tau;
    const hit = dist <= hitThreshold;
    if (hit) {
      rawHits += 1;
      run += 1;
      if (run > runMax) {
        runMax = run;
      }
    } else {
      if (run >= minRun) {
        longRunCount += 1;
      }
      run = 0;
    }
  }
  if (run >= minRun) {
    longRunCount += 1;
  }

  return {
    rawHits,
    rawHitRate: rawHits / points.length,
    runMax,
    longRunCount,
    scoredHits: rawHits,
  };
}

/**
 * Accidentalness: same tangents, loci spatially scrambled in the claim bbox.
 * True silhouettes are sparse — scrambled points fall off the ridge.
 * Clutter is dense — scrambled points still land near edges (NOCD-lite).
 */
function maxNormalizerSimilarity(
  scene: EdgeScene,
  points: readonly ProjectedPoint[],
  tau: number,
  lambda: number,
  partialKeep: number,
  offsetX: number,
  offsetY: number,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = point.x + offsetX;
    const y = point.y + offsetY;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // Scramble in a square pad — a flat bbox (straight edge) would otherwise
  // keep scrambled points on the same ridge and falsely look accidental.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const side = Math.max(maxX - minX, maxY - minY, 28);

  const scramble = (seed: number): ProjectedPoint[] =>
    points.map((point, index) => {
      const u = ((index * (17 + seed) * 13) % 1000) / 1000;
      const v = ((index * (29 + seed) * 7) % 1000) / 1000;
      return {
        x: cx - side / 2 + u * side,
        y: cy - side / 2 + v * side,
        angle: point.angle,
      };
    });

  return Math.max(
    orientedChamferSimilarity(scene, scramble(3), tau, lambda, partialKeep, 0, 0),
    orientedChamferSimilarity(scene, scramble(11), tau, lambda, partialKeep, 0, 0),
    orientedChamferSimilarity(scene, scramble(41), tau, lambda, partialKeep, 0, 0),
  );
}

function buildEdgeScene(image: GrayImage, magFloor: number): EdgeScene {
  const { width, height, pixels } = image;
  const magnitude = new Float32Array(width * height);
  const gradAngle = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = (ix: number, iy: number) => pixels[iy * width + ix] ?? 0;
      const gx =
        -p(x - 1, y - 1) +
        p(x + 1, y - 1) +
        -2 * p(x - 1, y) +
        2 * p(x + 1, y) +
        -p(x - 1, y + 1) +
        p(x + 1, y + 1);
      const gy =
        -p(x - 1, y - 1) +
        -2 * p(x, y - 1) +
        -p(x + 1, y - 1) +
        p(x - 1, y + 1) +
        2 * p(x, y + 1) +
        p(x + 1, y + 1);
      const index = y * width + x;
      magnitude[index] = Math.sqrt(gx * gx + gy * gy) / (255 * 4);
      gradAngle[index] = Math.atan2(gy, gx);
    }
  }

  const dist = new Float32Array(width * height);
  const nearestTangent = new Float32Array(width * height);
  const INF = width + height;

  for (let i = 0; i < width * height; i += 1) {
    if ((magnitude[i] ?? 0) >= magFloor) {
      dist[i] = 0;
      // Edge tangent is perpendicular to gradient.
      nearestTangent[i] = (gradAngle[i] ?? 0) + Math.PI / 2;
    } else {
      dist[i] = INF;
      nearestTangent[i] = 0;
    }
  }

  // Two-pass chamfer DT with nearest-edge tangent propagation.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      relax(dist, nearestTangent, width, height, index, x - 1, y, 1);
      relax(dist, nearestTangent, width, height, index, x, y - 1, 1);
      relax(dist, nearestTangent, width, height, index, x - 1, y - 1, Math.SQRT2);
      relax(dist, nearestTangent, width, height, index, x + 1, y - 1, Math.SQRT2);
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      relax(dist, nearestTangent, width, height, index, x + 1, y, 1);
      relax(dist, nearestTangent, width, height, index, x, y + 1, 1);
      relax(dist, nearestTangent, width, height, index, x + 1, y + 1, Math.SQRT2);
      relax(dist, nearestTangent, width, height, index, x - 1, y + 1, Math.SQRT2);
    }
  }

  return { width, height, dist, nearestTangent };
}

function relax(
  dist: Float32Array,
  nearestTangent: Float32Array,
  width: number,
  height: number,
  index: number,
  nx: number,
  ny: number,
  step: number,
) {
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
    return;
  }
  const nIndex = ny * width + nx;
  const candidate = (dist[nIndex] ?? 0) + step;
  if (candidate < (dist[index] ?? 0)) {
    dist[index] = candidate;
    nearestTangent[index] = nearestTangent[nIndex] ?? 0;
  }
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) {
    d = Math.PI - d;
  }
  return d;
}

function softGate(surplus: number, margin: number): number {
  const span = Math.max(2 * margin, 1e-6);
  const t = surplus / span;
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
