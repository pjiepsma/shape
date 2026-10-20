import {
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Rect,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { BuiltShape, GridRect, LineCell } from '@/shapeEngine';
import type { HuntPhoto } from '@/store/huntStore';
import { colors } from '@/theme/colors';

import { toScreen, type FitWindow, type OverlayLayout } from './overlayLayout';

export type { FitWindow };

type BaseProps = {
  shape: BuiltShape;
  layout: OverlayLayout;
  photos: readonly HuntPhoto[];
  draftRect: GridRect | null;
  guideLineCells: readonly LineCell[];
};

/**
 * Two real UIs only — cannot express “camera with no outline”.
 * - project: select / complete (full grid + dashed white outline)
 * - fit: camera / result (zoomed claim + solid accent outline, always)
 */
export type ShapeCameraOverlayProps =
  | (BaseProps & { mode: 'project'; showClaimFills?: boolean })
  | (BaseProps & { mode: 'fit'; window: FitWindow });

type StaticLayerProps = {
  shape: BuiltShape;
  layout: OverlayLayout;
  photos: readonly HuntPhoto[];
  guideLineCells: readonly LineCell[];
  mode: 'project' | 'fit';
  window: FitWindow | undefined;
  showClaimFills: boolean;
};

/** Screen-space stroke — never go through Group scale (Android drops sub-px strokes). */
const FIT_OUTLINE_STROKE_PX = 5;
const FIT_OUTLINE_HALO_PX = 8;
const PROJECT_OUTLINE_STROKE_PX = 3.5;
const PROJECT_GRID_STROKE_PX = 1.25;

export function ShapeCameraOverlay(props: ShapeCameraOverlayProps) {
  const { shape, layout, photos, draftRect, guideLineCells } = props;
  const gridSize = shape.definition.gridSize;
  const fitWindow = props.mode === 'fit' ? props.window : undefined;
  const showClaimFills = props.mode === 'project' ? (props.showClaimFills ?? true) : false;

  if (props.mode === 'fit' && shape.samples.length === 0) {
    throw new Error('Camera overlay: shape has zero outline samples — cannot draw guide.');
  }

  const draftScreen = draftRect
    ? {
        topLeft: toScreen(
          Math.min(draftRect.minX, draftRect.maxX) / gridSize,
          Math.min(draftRect.minY, draftRect.maxY) / gridSize,
          layout,
          fitWindow,
        ),
        width:
          (Math.abs(draftRect.maxX - draftRect.minX) + 1) *
          (fitWindow ? layout.size / (fitWindow.size * gridSize) : layout.size / gridSize),
        height:
          (Math.abs(draftRect.maxY - draftRect.minY) + 1) *
          (fitWindow ? layout.size / (fitWindow.size * gridSize) : layout.size / gridSize),
      }
    : null;

  const clipRect = fitWindow
    ? {
        x: layout.offsetX,
        y: layout.offsetY,
        width: layout.size,
        height: layout.size,
      }
    : undefined;

  const canvasStyle =
    layout.width > 0 && layout.height > 0
      ? {
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: layout.width,
          height: layout.height,
        }
      : StyleSheet.absoluteFill;

  return (
    <Canvas style={canvasStyle} pointerEvents="none">
      <Group clip={clipRect}>
        <StaticOverlayLayer
          shape={shape}
          layout={layout}
          photos={photos}
          guideLineCells={guideLineCells}
          mode={props.mode}
          window={fitWindow}
          showClaimFills={showClaimFills}
        />

        {draftScreen ? (
          <Rect
            x={draftScreen.topLeft.x}
            y={draftScreen.topLeft.y}
            width={draftScreen.width}
            height={draftScreen.height}
            color={colors.accent}
            opacity={0.18}
          />
        ) : null}
      </Group>
    </Canvas>
  );
}

const StaticOverlayLayer = memo(function StaticOverlayLayer({
  shape,
  layout,
  photos,
  guideLineCells,
  mode,
  window: fitWindow,
  showClaimFills,
}: StaticLayerProps) {
  const gridSize = shape.definition.gridSize;
  const cellSizeNorm = 1 / gridSize;

  /**
   * Fit/camera: polyline in SCREEN pixels from path samples.
   * Avoids MakeFromSVGString + Group scale (strokeWidth ~0.008 → invisible on device).
   */
  const fitOutlinePath = useMemo(() => {
    if (mode !== 'fit' || !fitWindow) {
      return null;
    }
    const samples = shape.samples;
    if (samples.length === 0) {
      throw new Error('Camera overlay: empty samples while drawing fit outline');
    }
    const builder = Skia.PathBuilder.Make();
    const first = samples[0];
    if (!first) {
      throw new Error('Camera overlay: missing first outline sample');
    }
    const start = toScreen(first.x, first.y, layout, fitWindow);
    builder.moveTo(start.x, start.y);
    for (let i = 1; i < samples.length; i += 1) {
      const sample = samples[i];
      if (!sample) {
        continue;
      }
      const point = toScreen(sample.x, sample.y, layout, fitWindow);
      builder.lineTo(point.x, point.y);
    }
    builder.close();
    return builder.detach();
  }, [fitWindow, layout, mode, shape.samples]);

  const projectOutlinePath = useMemo(() => {
    if (mode !== 'project') {
      return null;
    }
    const path = Skia.Path.MakeFromSVGString(shape.definition.path);
    if (!path) {
      throw new Error('Select overlay: outline SVG failed to parse');
    }
    return path;
  }, [mode, shape.definition.path]);

  const gridPath = useMemo(() => {
    if (mode !== 'project') {
      return null;
    }
    const builder = Skia.PathBuilder.Make();
    for (let i = 0; i <= gridSize; i += 1) {
      const n = i / gridSize;
      const a = toScreen(n, 0, layout, fitWindow);
      const b = toScreen(n, 1, layout, fitWindow);
      const c = toScreen(0, n, layout, fitWindow);
      const d = toScreen(1, n, layout, fitWindow);
      builder.moveTo(a.x, a.y);
      builder.lineTo(b.x, b.y);
      builder.moveTo(c.x, c.y);
      builder.lineTo(d.x, d.y);
    }
    return builder.detach();
  }, [fitWindow, gridSize, layout, mode]);

  const claimPaths = useMemo(() => {
    if (!showClaimFills) {
      return [];
    }
    const cellSize = fitWindow
      ? layout.size / (fitWindow.size * gridSize)
      : layout.size / gridSize;
    const paths: { id: string; color: string; path: SkPath }[] = [];

    for (const photo of photos) {
      const builder = Skia.PathBuilder.Make();
      for (const index of photo.claimedCells) {
        const x = index % gridSize;
        const y = Math.floor(index / gridSize);
        const topLeft = toScreen(x / gridSize, y / gridSize, layout, fitWindow);
        builder.addRect(Skia.XYWHRect(topLeft.x, topLeft.y, cellSize, cellSize));
      }
      paths.push({ id: photo.id, color: photo.color, path: builder.detach() });
    }

    return paths;
  }, [fitWindow, gridSize, layout, photos, showClaimFills]);

  const projectStrokeWidth = PROJECT_OUTLINE_STROKE_PX / Math.max(layout.size, 1);

  return (
    <>
      {gridPath ? (
        <Path
          path={gridPath}
          style="stroke"
          strokeWidth={PROJECT_GRID_STROKE_PX}
          color={colors.grid}
        />
      ) : null}

      {claimPaths.map((claim) => (
        <Path key={claim.id} path={claim.path} color={claim.color} opacity={0.55} />
      ))}

      {guideLineCells.map((cell) => {
        const topLeft = toScreen(cell.x / gridSize, cell.y / gridSize, layout, fitWindow);
        const size = fitWindow
          ? layout.size / (fitWindow.size * gridSize)
          : layout.size * cellSizeNorm;
        return (
          <Rect
            key={`guide-${cell.index}`}
            x={topLeft.x}
            y={topLeft.y}
            width={size}
            height={size}
            color={colors.accent}
            opacity={0.45}
          />
        );
      })}

      {fitOutlinePath ? (
        <>
          <Path
            path={fitOutlinePath}
            style="stroke"
            strokeWidth={FIT_OUTLINE_HALO_PX}
            color={colors.outlineHalo}
            strokeJoin="round"
            strokeCap="round"
          />
          <Path
            path={fitOutlinePath}
            style="stroke"
            strokeWidth={FIT_OUTLINE_STROKE_PX}
            color={colors.outline}
            strokeJoin="round"
            strokeCap="round"
          />
        </>
      ) : null}

      {projectOutlinePath ? (
        <Group
          transform={[
            { translateX: layout.offsetX },
            { translateY: layout.offsetY },
            { scale: layout.size },
          ]}
        >
          <Path
            path={projectOutlinePath}
            style="stroke"
            strokeWidth={projectStrokeWidth * 1.6}
            color={colors.outlineHalo}
            strokeJoin="round"
            strokeCap="round"
          >
            <DashPathEffect
              intervals={[10 / Math.max(layout.size, 1), 8 / Math.max(layout.size, 1)]}
            />
          </Path>
          <Path
            path={projectOutlinePath}
            style="stroke"
            strokeWidth={projectStrokeWidth}
            color={colors.outline}
            strokeJoin="round"
            strokeCap="round"
          >
            <DashPathEffect
              intervals={[10 / Math.max(layout.size, 1), 8 / Math.max(layout.size, 1)]}
            />
          </Path>
        </Group>
      ) : null}
    </>
  );
});
