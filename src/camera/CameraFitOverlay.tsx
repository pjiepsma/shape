import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BuiltShape, GridRect, LineCell, PathSample } from '@/shapeEngine';
import { colors } from '@/theme/colors';

import { toScreen, type FitWindow, type OverlayLayout } from './overlayLayout';

type Props = {
  shape: BuiltShape;
  layout: OverlayLayout;
  window: FitWindow;
  draftRect: GridRect | null;
  guideLineCells: readonly LineCell[];
};

const STROKE_PX = 4;
/** Subsample dense path samples so we stay under a few hundred Views. */
const MAX_SEGMENTS = 120;

/**
 * Camera / result outline drawn with normal RN Views.
 * Skia Canvas sits under Android CameraView's surface — this does not.
 */
export function CameraFitOverlay({
  shape,
  layout,
  window: fitWindow,
  draftRect,
  guideLineCells,
}: Props) {
  if (shape.samples.length === 0) {
    throw new Error('CameraFitOverlay: shape has zero outline samples');
  }

  const segments = useMemo(
    () => buildScreenSegments(shape.samples, layout, fitWindow),
    [fitWindow, layout, shape.samples],
  );

  const draftScreen = useMemo(() => {
    if (!draftRect) {
      return null;
    }
    const gridSize = shape.definition.gridSize;
    const topLeft = toScreen(
      Math.min(draftRect.minX, draftRect.maxX) / gridSize,
      Math.min(draftRect.minY, draftRect.maxY) / gridSize,
      layout,
      fitWindow,
    );
    const cell = layout.size / (fitWindow.size * gridSize);
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: (Math.abs(draftRect.maxX - draftRect.minX) + 1) * cell,
      height: (Math.abs(draftRect.maxY - draftRect.minY) + 1) * cell,
    };
  }, [draftRect, fitWindow, layout, shape.definition.gridSize]);

  const gridSize = shape.definition.gridSize;
  const cellSize = layout.size / (fitWindow.size * gridSize);

  return (
    <View
      style={[styles.root, { width: layout.width, height: layout.height }]}
      pointerEvents="none"
      collapsable={false}
    >
      {draftScreen ? (
        <View
          style={[
            styles.draft,
            {
              left: draftScreen.left,
              top: draftScreen.top,
              width: draftScreen.width,
              height: draftScreen.height,
            },
          ]}
        />
      ) : null}

      {guideLineCells.map((cell) => {
        const topLeft = toScreen(cell.x / gridSize, cell.y / gridSize, layout, fitWindow);
        return (
          <View
            key={`guide-${cell.index}`}
            style={[
              styles.guideCell,
              {
                left: topLeft.x,
                top: topLeft.y,
                width: cellSize,
                height: cellSize,
              },
            ]}
          />
        );
      })}

      {segments.map((seg, index) => (
        <View
          key={`seg-${index}`}
          style={[
            styles.segment,
            {
              left: seg.left,
              top: seg.top,
              width: seg.length,
              height: STROKE_PX,
              transform: [{ rotate: `${seg.angleRad}rad` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

type Segment = {
  left: number;
  top: number;
  length: number;
  angleRad: number;
};

function buildScreenSegments(
  samples: readonly PathSample[],
  layout: OverlayLayout,
  fitWindow: FitWindow,
): Segment[] {
  if (samples.length < 2) {
    return [];
  }
  const step = Math.max(1, Math.floor(samples.length / MAX_SEGMENTS));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const sample = samples[i];
    if (!sample) {
      continue;
    }
    points.push(toScreen(sample.x, sample.y, layout, fitWindow));
  }
  const last = samples[samples.length - 1];
  if (last) {
    const end = toScreen(last.x, last.y, layout, fitWindow);
    const prev = points[points.length - 1];
    if (!prev || prev.x !== end.x || prev.y !== end.y) {
      points.push(end);
    }
  }
  // Close the silhouette.
  if (points.length >= 2) {
    const first = points[0];
    const end = points[points.length - 1];
    if (first && end && (first.x !== end.x || first.y !== end.y)) {
      points.push(first);
    }
  }

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) {
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) {
      continue;
    }
    const angleRad = Math.atan2(dy, dx);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    // RN rotates around view center — anchor the segment on its midpoint.
    segments.push({
      left: midX - length / 2,
      top: midY - STROKE_PX / 2,
      length,
      angleRad,
    });
  }
  return segments;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 20,
    elevation: 20,
  },
  draft: {
    position: 'absolute',
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  guideCell: {
    position: 'absolute',
    backgroundColor: colors.accent,
    opacity: 0.35,
  },
  segment: {
    position: 'absolute',
    backgroundColor: colors.accent,
  },
});
