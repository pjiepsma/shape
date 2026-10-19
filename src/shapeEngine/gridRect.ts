import type { GridRect } from './types';

export function projectCellCount(gridSize: number): number {
  return gridSize * gridSize;
}

export function cellsInRect(rect: GridRect, gridSize: number): number[] {
  const cells: number[] = [];
  const minX = clampCell(Math.min(rect.minX, rect.maxX), gridSize);
  const maxX = clampCell(Math.max(rect.minX, rect.maxX), gridSize);
  const minY = clampCell(Math.min(rect.minY, rect.maxY), gridSize);
  const maxY = clampCell(Math.max(rect.minY, rect.maxY), gridSize);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push(y * gridSize + x);
    }
  }
  return cells;
}

export function normalizeRect(rect: GridRect, gridSize: number): GridRect {
  return {
    minX: clampCell(Math.min(rect.minX, rect.maxX), gridSize),
    maxX: clampCell(Math.max(rect.minX, rect.maxX), gridSize),
    minY: clampCell(Math.min(rect.minY, rect.maxY), gridSize),
    maxY: clampCell(Math.max(rect.minY, rect.maxY), gridSize),
  };
}

export function rectContainsCell(rect: GridRect, cellX: number, cellY: number): boolean {
  const minX = Math.min(rect.minX, rect.maxX);
  const maxX = Math.max(rect.minX, rect.maxX);
  const minY = Math.min(rect.minY, rect.maxY);
  const maxY = Math.max(rect.minY, rect.maxY);
  return cellX >= minX && cellX <= maxX && cellY >= minY && cellY <= maxY;
}

export function lineCellsInRect(
  rect: GridRect,
  lineCells: readonly { index: number; x: number; y: number }[],
): number[] {
  return lineCells.filter((cell) => rectContainsCell(rect, cell.x, cell.y)).map((cell) => cell.index);
}

function clampCell(value: number, gridSize: number): number {
  return Math.max(0, Math.min(gridSize - 1, Math.floor(value)));
}
