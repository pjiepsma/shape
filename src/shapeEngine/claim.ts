import { gameRules } from '@/config/gameRules';

import { projectCellCount } from './gridRect';
import type { ClaimValidation } from './types';

export function claimFraction(claimedCount: number, totalCells: number): number {
  if (totalCells <= 0) {
    return 0;
  }
  return claimedCount / totalCells;
}

export function hasOverlap(
  claimedIndexes: readonly number[],
  alreadyClaimed: ReadonlySet<number>,
): boolean {
  return claimedIndexes.some((index) => alreadyClaimed.has(index));
}

export function validateClaim(args: {
  claimedIndexes: readonly number[];
  alreadyClaimed: ReadonlySet<number>;
  lineCellIndexes: ReadonlySet<number>;
  gridSize: number;
  minFraction?: number;
  maxFraction?: number;
}): ClaimValidation {
  const minFraction = args.minFraction ?? gameRules.minClaimFraction;
  const maxFraction = args.maxFraction ?? gameRules.maxClaimFraction;
  const totalCells = projectCellCount(args.gridSize);
  const unique = [...new Set(args.claimedIndexes)];
  const fraction = claimFraction(unique.length, totalCells);

  if (unique.length === 0) {
    return { ok: false, fraction, reason: 'empty' };
  }

  if (unique.some((index) => index < 0 || index >= totalCells || !Number.isInteger(index))) {
    return { ok: false, fraction, reason: 'unknown_cell' };
  }

  if (hasOverlap(unique, args.alreadyClaimed)) {
    return { ok: false, fraction, reason: 'overlap' };
  }

  if (!unique.some((index) => args.lineCellIndexes.has(index))) {
    return { ok: false, fraction, reason: 'no_line' };
  }

  if (fraction < minFraction) {
    return { ok: false, fraction, reason: 'too_few' };
  }

  if (fraction > maxFraction) {
    return { ok: false, fraction, reason: 'too_many' };
  }

  return { ok: true, fraction };
}
