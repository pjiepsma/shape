import type { ShapeDefinition } from '../types';
import { elephantShape } from './elephant';
import { pawnShape } from './pawn';
import { teapotShape } from './teapot';

export const HUNT_SHAPE_IDS = ['pawn', 'teapot', 'elephant'] as const;

export type HuntShapeId = (typeof HUNT_SHAPE_IDS)[number];

export function shapeById(id: HuntShapeId): ShapeDefinition {
  switch (id) {
    case 'pawn':
      return pawnShape;
    case 'teapot':
      return teapotShape;
    case 'elephant':
      return elephantShape;
  }
}

export function pickRandomShapeId(exclude?: HuntShapeId): HuntShapeId {
  const pool =
    exclude === undefined
      ? HUNT_SHAPE_IDS
      : HUNT_SHAPE_IDS.filter((id) => id !== exclude);
  const index = Math.floor(Math.random() * pool.length);
  const id = pool[index];
  if (id === undefined) {
    return 'pawn';
  }
  return id;
}
