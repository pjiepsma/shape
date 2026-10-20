import { create } from 'zustand';

import { cropClaimSnippet } from '@/camera/cropClaimSnippet';
import { gameRules } from '@/config/gameRules';
import {
  cellsInRect,
  claimFraction,
  normalizeRect,
  projectCellCount,
  validateClaim,
  type GridRect,
  type ScoreMatchResult,
} from '@/shapeEngine';
import { colors } from '@/theme/colors';

export const PHOTO_COLORS = [
  colors.photo.coral,
  colors.photo.sky,
  colors.photo.lime,
  colors.photo.violet,
  colors.photo.gold,
] as const;

export type HuntPhoto = {
  id: string;
  claimedCells: number[];
  rect: GridRect;
  color: string;
  uri: string | null;
  score: number;
  scorePassed: boolean;
};

type PendingShot = {
  /** Stable id for this shutter — ignore late scores after Retake. */
  captureId: string;
  /** Null until takePictureAsync returns (result shows Capturing…). */
  uri: string | null;
  /** Null while scoring is still running after an instant jump to result. */
  score: ScoreMatchResult | null;
  /** Preview size when the shot was taken — required to crop the claim snippet. */
  viewSize: { width: number; height: number };
  /** Fit window when the shot was taken — required to crop the claim snippet. */
  viewWindow: { x: number; y: number; size: number };
};

type HuntState = {
  lockedCells: number[];
  draftRect: GridRect | null;
  dragOrigin: { x: number; y: number } | null;
  photos: HuntPhoto[];
  pendingShot: PendingShot | null;
  statusMessage: string | null;
  clearStatus: () => void;
  setStatusMessage: (message: string | null) => void;
  setDragOrigin: (origin: { x: number; y: number } | null) => void;
  setDraftRect: (args: { rect: GridRect | null; gridSize: number }) => void;
  clearDraft: () => void;
  setPendingShot: (shot: PendingShot | null) => void;
  keepPhoto: (args: {
    lineCellIndexes: ReadonlySet<number>;
    gridSize: number;
  }) => Promise<boolean>;
  resetHunt: () => void;
};

function rectEquals(a: GridRect, b: GridRect): boolean {
  return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;
}

export const useHuntStore = create<HuntState>((set, get) => ({
  lockedCells: [],
  draftRect: null,
  dragOrigin: null,
  photos: [],
  pendingShot: null,
  statusMessage: null,

  clearStatus: () => set({ statusMessage: null }),

  setStatusMessage: (message) => set({ statusMessage: message }),

  setDragOrigin: (origin) => set({ dragOrigin: origin }),

  setDraftRect: ({ rect, gridSize }) => {
    if (rect === null) {
      const { draftRect } = get();
      if (draftRect === null) {
        return;
      }
      set({ draftRect: null });
      return;
    }

    const normalized = normalizeRect(rect, gridSize);
    const { draftRect } = get();
    if (draftRect && rectEquals(draftRect, normalized)) {
      return;
    }
    set({ draftRect: normalized });
  },

  clearDraft: () =>
    set({ draftRect: null, dragOrigin: null, pendingShot: null, statusMessage: null }),

  setPendingShot: (shot) => set({ pendingShot: shot, statusMessage: null }),

  keepPhoto: async ({ lineCellIndexes, gridSize }) => {
    const { draftRect, lockedCells, photos, pendingShot } = get();
    if (!draftRect || !pendingShot) {
      set({ statusMessage: 'No photo to keep' });
      return false;
    }
    if (!pendingShot.uri || !pendingShot.score) {
      set({ statusMessage: 'Still capturing — wait a moment' });
      return false;
    }

    const claimed = cellsInRect(draftRect, gridSize);
    const result = validateClaim({
      claimedIndexes: claimed,
      alreadyClaimed: new Set(lockedCells),
      lineCellIndexes,
      gridSize,
    });

    if (!result.ok) {
      const message =
        result.reason === 'too_few'
          ? `Need at least ${Math.round(gameRules.minClaimFraction * 100)}%`
          : result.reason === 'too_many'
            ? `Max ${Math.round(gameRules.maxClaimFraction * 100)}% per photo`
            : result.reason === 'overlap'
              ? 'Overlaps a locked region'
              : result.reason === 'no_line'
                ? 'Selection must cover part of the outline'
                : 'Invalid claim';
      set({ statusMessage: message });
      return false;
    }

    let snippetUri: string;
    try {
      snippetUri = await cropClaimSnippet({
        uri: pendingShot.uri,
        viewSize: pendingShot.viewSize,
        viewWindow: pendingShot.viewWindow,
        claimRect: draftRect,
        gridSize,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not crop claim snippet';
      set({ statusMessage: message });
      return false;
    }

    const color = PHOTO_COLORS[photos.length % PHOTO_COLORS.length];
    const photo: HuntPhoto = {
      id: `photo-${photos.length + 1}-${Date.now()}`,
      claimedCells: claimed,
      rect: draftRect,
      color: color ?? colors.photo.coral,
      uri: snippetUri,
      score: pendingShot.score.score,
      scorePassed: pendingShot.score.passed,
    };

    set({
      photos: [...photos, photo],
      lockedCells: [...lockedCells, ...claimed],
      draftRect: null,
      pendingShot: null,
      statusMessage: null,
    });
    return true;
  },

  resetHunt: () =>
    set({
      lockedCells: [],
      draftRect: null,
      dragOrigin: null,
      photos: [],
      pendingShot: null,
      statusMessage: null,
    }),
}));

export function draftAreaFraction(rect: GridRect, gridSize: number): number {
  const width = Math.abs(rect.maxX - rect.minX) + 1;
  const height = Math.abs(rect.maxY - rect.minY) + 1;
  return claimFraction(width * height, projectCellCount(gridSize));
}

export function draftClaimFraction(draftRect: GridRect | null, gridSize: number): number {
  if (!draftRect) {
    return 0;
  }
  return draftAreaFraction(draftRect, gridSize);
}

export function draftStatusMessage(args: {
  draftRect: GridRect;
  lockedCells: readonly number[];
  lineCellIndexes: ReadonlySet<number>;
  gridSize: number;
}): string | null {
  const claimed = cellsInRect(args.draftRect, args.gridSize);
  const result = validateClaim({
    claimedIndexes: claimed,
    alreadyClaimed: new Set(args.lockedCells),
    lineCellIndexes: args.lineCellIndexes,
    gridSize: args.gridSize,
  });

  if (result.ok) {
    return null;
  }

  if (result.reason === 'too_many') {
    return `Max ${Math.round(gameRules.maxClaimFraction * 100)}% per photo`;
  }
  if (result.reason === 'overlap') {
    return 'Overlaps a locked region';
  }
  if (result.reason === 'no_line') {
    return 'Selection must cover part of the outline';
  }
  return null;
}

export function isDraftClaimValid(args: {
  draftRect: GridRect | null;
  lockedCells: readonly number[];
  lineCellIndexes: ReadonlySet<number>;
  gridSize: number;
}): boolean {
  if (!args.draftRect) {
    return false;
  }
  const claimed = cellsInRect(args.draftRect, args.gridSize);
  return validateClaim({
    claimedIndexes: claimed,
    alreadyClaimed: new Set(args.lockedCells),
    lineCellIndexes: args.lineCellIndexes,
    gridSize: args.gridSize,
  }).ok;
}

export function isHuntComplete(lockedCellCount: number, gridSize: number): boolean {
  const totalCells = projectCellCount(gridSize);
  const minClaimCells = Math.ceil(gameRules.minClaimFraction * totalCells);
  return totalCells - lockedCellCount < minClaimCells;
}

/**
 * Area-weighted average match quality across kept photos (0..1).
 * Larger claims weigh more — reflects how well the finished piece matches.
 */
export function huntEndScore(photos: readonly HuntPhoto[]): number {
  let weighted = 0;
  let area = 0;
  for (const photo of photos) {
    const width = Math.abs(photo.rect.maxX - photo.rect.minX) + 1;
    const height = Math.abs(photo.rect.maxY - photo.rect.minY) + 1;
    const cells = width * height;
    weighted += photo.score * cells;
    area += cells;
  }
  if (area <= 0) {
    return 0;
  }
  return weighted / area;
}
