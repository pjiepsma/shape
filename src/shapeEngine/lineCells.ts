import type { BuiltShape, LineCell, PathSample, ShapeDefinition } from './types';
import { samplePath } from './samplePath';

export function buildShape(definition: ShapeDefinition): BuiltShape {
  const samples = samplePath(definition.path);
  const lineCells = computeLineCells(samples, definition.gridSize);
  return {
    definition,
    samples,
    lineCells,
    lineCellCount: lineCells.length,
  };
}

/**
 * Map path samples onto grid cells the outline passes through.
 * Each cell gets center, mean tangent angle, and first-visit path index.
 */
export function computeLineCells(samples: PathSample[], gridSize: number): LineCell[] {
  type Acc = {
    x: number;
    y: number;
    index: number;
    pathIndex: number;
    sinSum: number;
    cosSum: number;
  };

  const firstVisit: Acc[] = [];
  const byIndex = new Map<number, Acc>();

  for (const sample of samples) {
    const x = cellCoord(sample.x, gridSize);
    const y = cellCoord(sample.y, gridSize);
    const index = y * gridSize + x;
    const existing = byIndex.get(index);
    if (existing) {
      existing.sinSum += Math.sin(sample.angle);
      existing.cosSum += Math.cos(sample.angle);
      continue;
    }
    const acc: Acc = {
      x,
      y,
      index,
      pathIndex: firstVisit.length,
      sinSum: Math.sin(sample.angle),
      cosSum: Math.cos(sample.angle),
    };
    byIndex.set(index, acc);
    firstVisit.push(acc);
  }

  return firstVisit.map((acc) => ({
    index: acc.index,
    x: acc.x,
    y: acc.y,
    center: {
      x: (acc.x + 0.5) / gridSize,
      y: (acc.y + 0.5) / gridSize,
    },
    angle: Math.atan2(acc.sinSum, acc.cosSum),
    pathIndex: acc.pathIndex,
  }));
}

function cellCoord(value: number, gridSize: number): number {
  if (value >= 1) {
    return gridSize - 1;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.min(gridSize - 1, Math.floor(value * gridSize));
}
