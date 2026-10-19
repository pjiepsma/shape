import type { PathSample, Point } from './types';

type Command =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' };

const DEFAULT_SPACING = 0.002;

/**
 * Densely sample an SVG path `d` (absolute/relative M/L/H/V/C/S/Q/T/Z) in 0..1 space.
 */
export function samplePath(pathD: string, spacing: number = DEFAULT_SPACING): PathSample[] {
  const commands = parsePath(pathD);
  const points = flattenCommands(commands, spacing);
  if (points.length === 0) {
    return [];
  }

  const samples: PathSample[] = [];
  let distance = 0;

  for (let i = 0; i < points.length; i += 1) {
    const prev = points[i === 0 ? 0 : i - 1];
    const next = points[i === points.length - 1 ? i : i + 1];
    const curr = points[i];
    if (i > 0) {
      distance += hypot(curr.x - prev.x, curr.y - prev.y);
    }
    samples.push({
      x: curr.x,
      y: curr.y,
      angle: Math.atan2(next.y - prev.y, next.x - prev.x),
      pathIndex: i,
      distance,
    });
  }

  return samples;
}

function hypot(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

function flattenCommands(commands: Command[], spacing: number): Point[] {
  const out: Point[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const pushSegment = (from: Point, to: Point) => {
    const len = hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      out.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  };

  const pushCubic = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    const len = approxCubicLength(p0, p1, p2, p3);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s += 1) {
      out.push(cubicPoint(p0, p1, p2, p3, s / steps));
    }
  };

  const pushQuad = (p0: Point, p1: Point, p2: Point) => {
    const len = approxQuadLength(p0, p1, p2);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s += 1) {
      out.push(quadPoint(p0, p1, p2, s / steps));
    }
  };

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      cx = cmd.x;
      cy = cmd.y;
      startX = cx;
      startY = cy;
      out.push({ x: cx, y: cy });
      continue;
    }

    if (cmd.type === 'L') {
      pushSegment({ x: cx, y: cy }, { x: cmd.x, y: cmd.y });
      cx = cmd.x;
      cy = cmd.y;
      continue;
    }

    if (cmd.type === 'C') {
      const p0 = { x: cx, y: cy };
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x2, y: cmd.y2 };
      const p3 = { x: cmd.x, y: cmd.y };
      pushCubic(p0, p1, p2, p3);
      cx = cmd.x;
      cy = cmd.y;
      continue;
    }

    if (cmd.type === 'Q') {
      const p0 = { x: cx, y: cy };
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x, y: cmd.y };
      pushQuad(p0, p1, p2);
      cx = cmd.x;
      cy = cmd.y;
      continue;
    }

    if (cmd.type === 'Z') {
      if (cx !== startX || cy !== startY) {
        pushSegment({ x: cx, y: cy }, { x: startX, y: startY });
      }
      cx = startX;
      cy = startY;
    }
  }

  return out;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function approxCubicLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 8; i += 1) {
    const p = cubicPoint(p0, p1, p2, p3, i / 8);
    len += hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function approxQuadLength(p0: Point, p1: Point, p2: Point): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 8; i += 1) {
    const p = quadPoint(p0, p1, p2, i / 8);
    len += hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function parsePath(d: string): Command[] {
  const tokens = tokenize(d);
  const commands: Command[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCmd = '';
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;

  const readNumber = (): number => {
    const value = Number(tokens[i]);
    i += 1;
    return value;
  };

  while (i < tokens.length) {
    let type = tokens[i];
    if (isCommand(type)) {
      i += 1;
      lastCmd = type;
    } else {
      type = lastCmd;
      if (!type) {
        throw new Error(`Unexpected path token: ${tokens[i]}`);
      }
    }

    const relative = type === type.toLowerCase();
    const cmd = type.toUpperCase();

    if (cmd === 'M') {
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      commands.push({ type: 'M', x, y });
      cx = x;
      cy = y;
      startX = x;
      startY = y;
      lastCubic = null;
      lastQuad = null;
      lastCmd = relative ? 'l' : 'L';
      continue;
    }

    if (cmd === 'L') {
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      commands.push({ type: 'L', x, y });
      cx = x;
      cy = y;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    if (cmd === 'H') {
      const x = readNumber() + (relative ? cx : 0);
      commands.push({ type: 'L', x, y: cy });
      cx = x;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    if (cmd === 'V') {
      const y = readNumber() + (relative ? cy : 0);
      commands.push({ type: 'L', x: cx, y });
      cy = y;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    if (cmd === 'C') {
      const x1 = readNumber() + (relative ? cx : 0);
      const y1 = readNumber() + (relative ? cy : 0);
      const x2 = readNumber() + (relative ? cx : 0);
      const y2 = readNumber() + (relative ? cy : 0);
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      commands.push({ type: 'C', x1, y1, x2, y2, x, y });
      lastCubic = { x: x2, y: y2 };
      lastQuad = null;
      cx = x;
      cy = y;
      continue;
    }

    if (cmd === 'S') {
      const x2 = readNumber() + (relative ? cx : 0);
      const y2 = readNumber() + (relative ? cy : 0);
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      const x1 = lastCubic ? 2 * cx - lastCubic.x : cx;
      const y1 = lastCubic ? 2 * cy - lastCubic.y : cy;
      commands.push({ type: 'C', x1, y1, x2, y2, x, y });
      lastCubic = { x: x2, y: y2 };
      lastQuad = null;
      cx = x;
      cy = y;
      continue;
    }

    if (cmd === 'Q') {
      const x1 = readNumber() + (relative ? cx : 0);
      const y1 = readNumber() + (relative ? cy : 0);
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      commands.push({ type: 'Q', x1, y1, x, y });
      lastQuad = { x: x1, y: y1 };
      lastCubic = null;
      cx = x;
      cy = y;
      continue;
    }

    if (cmd === 'T') {
      const x = readNumber() + (relative ? cx : 0);
      const y = readNumber() + (relative ? cy : 0);
      const reflectedX: number = lastQuad === null ? cx : 2 * cx - lastQuad.x;
      const reflectedY: number = lastQuad === null ? cy : 2 * cy - lastQuad.y;
      commands.push({ type: 'Q', x1: reflectedX, y1: reflectedY, x, y });
      lastQuad = { x: reflectedX, y: reflectedY };
      lastCubic = null;
      cx = x;
      cy = y;
      continue;
    }

    if (cmd === 'Z') {
      commands.push({ type: 'Z' });
      cx = startX;
      cy = startY;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    throw new Error(`Unsupported SVG path command: ${type}`);
  }

  return commands;
}

function isCommand(token: string): boolean {
  return /^[MmLlHhVvCcSsQqTtZz]$/.test(token);
}

function tokenize(d: string): string[] {
  const normalized = d
    .replace(/,/g, ' ')
    .replace(/([MmLlHhVvCcSsQqTtZz])/g, ' $1 ')
    .replace(/-/g, ' -')
    .trim();
  return normalized.split(/\s+/).filter(Boolean);
}
