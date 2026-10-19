import { buildShape, pawnShape, scoreMatch, templatePointsInRect } from './index';
import type { GrayImage, GridRect } from './types';

/**
 * Contour fixtures: SVG guide must sit on a real outer silhouette.
 * Sphere ≥ 0.90, blank ≤ 0.05, clutter ≤ 0.25 and not passed.
 */
describe('Outer-contour fixtures (pawn head guide)', () => {
  const shape = buildShape(pawnShape);
  const gridSize = shape.definition.gridSize;

  /** Inclusive claim covering the round head (top of the fitted pawn). */
  const headRect: GridRect = { minX: 5, minY: 2, maxX: 14, maxY: 9 };

  const headSamples = templatePointsInRect(shape.samples, headRect, gridSize);
  /** Spherical crown of the head (exclude collar / stem in the claim). */
  const crownSamples = headSamples.filter((point) => point.y < 0.35);
  const circle = fitCircleKasa(crownSamples);
  const templatePoints = crownSamples.filter((point) => {
    const r = Math.hypot(point.x - circle.cx, point.y - circle.cy);
    return Math.abs(r - circle.r) <= circle.r * 0.12;
  });

  it('has dense outline samples on the spherical head', () => {
    expect(templatePoints.length).toBeGreaterThan(20);
  });

  it('scores a synthetic sphere ≥ 0.90 against the pawn head', () => {
    const image = renderSphere(circle, 192);
    const result = scoreMatch({ image, templatePoints });
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.passed).toBe(true);
  });

  it('scores a blank frame ≤ 0.05 against the pawn head', () => {
    const image = blankImage(192);
    const result = scoreMatch({ image, templatePoints });
    expect(result.score).toBeLessThanOrEqual(0.05);
    expect(result.passed).toBe(false);
  });

  it('rejects dense clutter with no silhouette on the guide (≤ 0.25, not passed)', () => {
    const image = clutterImage(192);
    const result = scoreMatch({ image, templatePoints });
    expect(result.score).toBeLessThanOrEqual(0.25);
    expect(result.passed).toBe(false);
  });
});

function blankImage(size: number): GrayImage {
  return { width: size, height: size, pixels: new Uint8Array(size * size).fill(128) };
}

/** Filled disk with a sharp outer rim (real object silhouettes are similar). */
function renderSphere(
  circle: { cx: number; cy: number; r: number },
  size: number,
): GrayImage {
  const pixels = new Uint8Array(size * size);
  const cx = circle.cx * size;
  const cy = circle.cy * size;
  const r = circle.r * size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      pixels[y * size + x] = d <= r ? 40 : 220;
    }
  }

  return { width: size, height: size, pixels };
}

/** Busy room-like edges: grid + diagonal seams, no circle on the pawn head. */
function clutterImage(size: number): GrayImage {
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 110 + ((x * 13 + y * 7) % 40);
      if (x % 18 < 2 || y % 16 < 2) {
        v = 220;
      }
      if ((x + y) % 23 < 2) {
        v = 30;
      }
      if (x > size * 0.55 && x < size * 0.58) {
        v = 200;
      }
      if (y > size * 0.4 && y < size * 0.43) {
        v = 25;
      }
      pixels[y * size + x] = v;
    }
  }
  return { width: size, height: size, pixels };
}

/** Algebraic least-squares circle fit (Kåsa). */
function fitCircleKasa(points: readonly { x: number; y: number }[]): {
  cx: number;
  cy: number;
  r: number;
} {
  if (points.length === 0) {
    return { cx: 0.5, cy: 0.5, r: 0.2 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  let sumX3 = 0;
  let sumY3 = 0;
  let sumX2Y = 0;
  let sumXY2 = 0;
  const n = points.length;

  for (const point of points) {
    const x = point.x;
    const y = point.y;
    const x2 = x * x;
    const y2 = y * y;
    sumX += x;
    sumY += y;
    sumX2 += x2;
    sumY2 += y2;
    sumXY += x * y;
    sumX3 += x2 * x;
    sumY3 += y2 * y;
    sumX2Y += x2 * y;
    sumXY2 += x * y2;
  }

  const C = n * sumX2 - sumX * sumX;
  const D = n * sumXY - sumX * sumY;
  const E = n * sumX3 + n * sumXY2 - (sumX2 + sumY2) * sumX;
  const G = n * sumY2 - sumY * sumY;
  const H = n * sumX2Y + n * sumY3 - (sumX2 + sumY2) * sumY;
  const denom = C * G - D * D;
  if (Math.abs(denom) < 1e-12) {
    return { cx: sumX / n, cy: sumY / n, r: 0.2 };
  }

  const cx = (E * G - D * H) / (2 * denom);
  const cy = (C * H - D * E) / (2 * denom);
  let rSum = 0;
  for (const point of points) {
    rSum += Math.hypot(point.x - cx, point.y - cy);
  }
  return { cx, cy, r: rSum / n };
}
