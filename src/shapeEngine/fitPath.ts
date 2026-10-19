/**
 * Uniformly scale an absolute SVG path so its bounding box fills `fill` of the
 * unit square (0..1), centered. Relative commands are not supported.
 */
export function fitAbsolutePathInUnitSquare(pathD: string, fill: number): string {
  const tokens = pathD
    .replace(/,/g, ' ')
    .replace(/([MLCQZ])/gi, ' $1 ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  type Pair = { xi: number; yi: number; x: number; y: number };
  const pairs: Pair[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (!cmd) {
      break;
    }
    const upper = cmd.toUpperCase();
    i += 1;
    if (upper === 'Z') {
      continue;
    }
    const arity = upper === 'C' ? 6 : upper === 'Q' ? 4 : 2;
    for (let k = 0; k < arity; k += 2) {
      const x = Number(tokens[i]);
      const y = Number(tokens[i + 1]);
      pairs.push({ xi: i, yi: i + 1, x, y });
      i += 2;
    }
  }

  if (pairs.length === 0) {
    return pathD;
  }

  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const scale = fill / Math.max(width, height);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const mapped = [...tokens];
  for (const pair of pairs) {
    mapped[pair.xi] = formatCoord((pair.x - midX) * scale + 0.5);
    mapped[pair.yi] = formatCoord((pair.y - midY) * scale + 0.5);
  }

  return mapped.join(' ');
}

function formatCoord(value: number): string {
  return (Math.round(value * 10000) / 10000).toString();
}
