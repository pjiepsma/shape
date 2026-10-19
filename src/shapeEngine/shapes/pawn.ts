import { gameRules } from '@/config/gameRules';

import { fitAbsolutePathInUnitSquare } from '../fitPath';
import type { ShapeDefinition } from '../types';

/**
 * Side profile of a chess pawn in normalized 0..1 coordinates:
 * base, foot, stem, collar, round head — left/right symmetrical about x=0.5.
 * Fitted to `gameRules.shapeFill` of the unit square.
 */
const PAWN_PATH_RAW =
  'M 0.30 0.90 ' +
  'L 0.70 0.90 ' +
  'L 0.70 0.84 ' +
  'C 0.70 0.80 0.64 0.78 0.58 0.76 ' +
  'L 0.55 0.62 ' +
  'C 0.55 0.58 0.60 0.56 0.60 0.52 ' +
  'L 0.60 0.48 ' +
  'C 0.66 0.46 0.68 0.42 0.68 0.38 ' +
  'C 0.68 0.28 0.60 0.20 0.50 0.20 ' +
  'C 0.40 0.20 0.32 0.28 0.32 0.38 ' +
  'C 0.32 0.42 0.34 0.46 0.40 0.48 ' +
  'L 0.40 0.52 ' +
  'C 0.40 0.56 0.45 0.58 0.45 0.62 ' +
  'L 0.42 0.76 ' +
  'C 0.36 0.78 0.30 0.80 0.30 0.84 ' +
  'Z';

export const PAWN_PATH = fitAbsolutePathInUnitSquare(PAWN_PATH_RAW, gameRules.shapeFill);

export const pawnShape: ShapeDefinition = {
  name: 'Chess pawn',
  path: PAWN_PATH,
  gridSize: gameRules.gridSize,
};
