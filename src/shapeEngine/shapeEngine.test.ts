import { gameRules } from '@/config/gameRules';

import {
  buildShape,
  cellsInRect,
  claimFraction,
  hasOverlap,
  pawnShape,
  projectCellCount,
  samplePath,
  scoreMatch,
  validateClaim,
} from './index';
import type { GrayImage } from './types';

describe('samplePath', () => {
  it('samples a unit diagonal with increasing distance', () => {
    const samples = samplePath('M 0 0 L 1 1', 0.05);
    expect(samples.length).toBeGreaterThan(5);
    expect(samples[0]?.x).toBeCloseTo(0, 5);
    expect(samples[samples.length - 1]?.y).toBeCloseTo(1, 5);
    expect(samples[samples.length - 1]?.distance).toBeGreaterThan(1.4);
  });
});

describe('buildShape (pawn)', () => {
  const shape = buildShape(pawnShape);

  it('produces a non-empty list of line cells on a 20×20 grid', () => {
    expect(shape.definition.gridSize).toBe(20);
    expect(shape.lineCellCount).toBeGreaterThan(20);
    expect(shape.lineCells).toHaveLength(shape.lineCellCount);
  });

  it('assigns center, angle, and pathIndex for every line cell', () => {
    for (const cell of shape.lineCells) {
      expect(cell.index).toBe(cell.y * shape.definition.gridSize + cell.x);
      expect(cell.center.x).toBeCloseTo((cell.x + 0.5) / 20, 5);
      expect(cell.center.y).toBeCloseTo((cell.y + 0.5) / 20, 5);
      expect(Number.isFinite(cell.angle)).toBe(true);
      expect(cell.pathIndex).toBeGreaterThanOrEqual(0);
      expect(cell.pathIndex).toBeLessThan(shape.lineCellCount);
    }
  });

  it('keeps pathIndex unique and ordered by first visit', () => {
    const indexes = shape.lineCells.map((cell) => cell.pathIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });
});

describe('claim rules (project grid)', () => {
  const shape = buildShape(pawnShape);
  const gridSize = shape.definition.gridSize;
  const totalCells = projectCellCount(gridSize);
  const lineCellIndexes = new Set(shape.lineCells.map((cell) => cell.index));

  const rectClaim = (fraction: number) => {
    const target = Math.round(totalCells * fraction);
    const height = Math.max(1, Math.round(target / gridSize));
    return cellsInRect({ minX: 0, maxX: gridSize - 1, minY: gridSize - height, maxY: gridSize - 1 }, gridSize);
  };

  it('computes percentages relative to the project grid', () => {
    const claimed = rectClaim(0.25);
    const fraction = claimFraction(claimed.length, totalCells);
    expect(fraction).toBeCloseTo(0.25, 1);
    expect(claimed.length).toBeGreaterThan(shape.lineCellCount * 0.1);
  });

  it('accepts a claim between 10% and 40% that intersects the outline', () => {
    const claimed = rectClaim(0.25);
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed: new Set(),
      lineCellIndexes,
      gridSize,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fraction).toBeGreaterThanOrEqual(gameRules.minClaimFraction);
      expect(result.fraction).toBeLessThanOrEqual(gameRules.maxClaimFraction);
    }
  });

  it('rejects claims above 40%', () => {
    const claimed = rectClaim(0.45);
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed: new Set(),
      lineCellIndexes,
      gridSize,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too_many');
    }
  });

  it('rejects claims below 10%', () => {
    const anchor = shape.lineCells[0];
    expect(anchor).toBeDefined();
    if (!anchor) {
      return;
    }
    const claimed = cellsInRect(
      { minX: anchor.x, maxX: anchor.x, minY: anchor.y, maxY: anchor.y },
      gridSize,
    );
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed: new Set(),
      lineCellIndexes,
      gridSize,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too_few');
    }
  });

  it('rejects overlapping cells that were already claimed', () => {
    const claimed = rectClaim(0.2);
    const alreadyClaimed = new Set(claimed.slice(0, 5));
    expect(hasOverlap(claimed, alreadyClaimed)).toBe(true);
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed,
      lineCellIndexes,
      gridSize,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('overlap');
    }
  });

  it('rejects a region with no outline line cells', () => {
    const claimed = cellsInRect({ minX: 0, maxX: 2, minY: 0, maxY: 2 }, gridSize);
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed: new Set(),
      lineCellIndexes,
      gridSize,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_line');
    }
  });

  it('requires at least three photos at the 40% cap to cover the project', () => {
    expect(1 / gameRules.maxClaimFraction).toBeGreaterThanOrEqual(2.5);
    const maxPerPhoto = Math.floor(totalCells * gameRules.maxClaimFraction);
    expect(maxPerPhoto * 2).toBeLessThan(totalCells);
    expect(maxPerPhoto * 3).toBeGreaterThanOrEqual(totalCells);
  });
});

describe('scoreMatch', () => {
  const makeHorizontalTemplate = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const t = (i + 0.5) / count;
      return { x: t, y: 0.5, angle: 0 };
    });

  const drawHorizontalEdge = (width: number, height: number, y: number): GrayImage => {
    const pixels = new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) {
      const value = row < y ? 30 : 220;
      for (let col = 0; col < width; col += 1) {
        pixels[row * width + col] = value;
      }
    }
    return { width, height, pixels };
  };

  it('scores a matching horizontal edge higher than noise', () => {
    const width = 64;
    const height = 64;
    const matching = drawHorizontalEdge(width, height, Math.floor(height / 2));
    const noisePixels = new Uint8Array(width * height);
    for (let i = 0; i < noisePixels.length; i += 1) {
      noisePixels[i] = (i * 17) % 256;
    }
    const noise: GrayImage = { width, height, pixels: noisePixels };
    const templatePoints = makeHorizontalTemplate(24);

    const match = scoreMatch({ image: matching, templatePoints });
    const miss = scoreMatch({ image: noise, templatePoints });

    expect(match.score).toBeGreaterThan(miss.score);
    expect(match.score).toBeGreaterThan(0.2);
  });
});
