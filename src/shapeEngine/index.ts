export { claimFraction, hasOverlap, validateClaim } from './claim';
export {
  cellsInRect,
  lineCellsInRect,
  normalizeRect,
  projectCellCount,
  rectContainsCell,
} from './gridRect';
export { buildShape, computeLineCells } from './lineCells';
export { samplePath } from './samplePath';
export { buildScoreMatchCaptureLog, scoreMatch, templatePointsInRect } from './scoreMatch';
export type { ScoreViewSize, ScoreViewWindow, TemplatePoint } from './scoreMatch';
export {
  HUNT_SHAPE_IDS,
  pickRandomShapeId,
  shapeById,
  type HuntShapeId,
} from './shapes/catalog';
export { elephantShape, ELEPHANT_PATH } from './shapes/elephant';
export { pawnShape, PAWN_PATH } from './shapes/pawn';
export { teapotShape, TEAPOT_PATH } from './shapes/teapot';
export type {
  BuiltShape,
  ClaimValidation,
  GrayImage,
  GridRect,
  LineCell,
  PathSample,
  Point,
  ScoreMatchDebug,
  ScoreMatchResult,
  ShapeDefinition,
} from './types';
