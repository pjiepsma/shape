import { useRouter } from 'expo-router';
import { Button, Surface } from 'heroui-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShapeCameraOverlay } from '@/camera/ShapeCameraOverlay';
import { computeOverlayLayout, hitTestGridCell, type OverlayLayout } from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { buildShape, pawnShape, type LineCell } from '@/shapeEngine';
import {
  draftClaimFraction,
  draftStatusMessage,
  isDraftClaimValid,
  isHuntComplete,
  useHuntStore,
} from '@/store/huntStore';

const NO_GUIDE_CELLS: LineCell[] = [];
const FRAME_PAD = 16;

export default function SelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState<OverlayLayout | null>(null);

  const shape = useMemo(() => buildShape(pawnShape), []);
  const gridSize = shape.definition.gridSize;
  const lineCellIndexes = useMemo(
    () => new Set(shape.lineCells.map((cell) => cell.index)),
    [shape.lineCells],
  );

  const draftRect = useHuntStore((state) => state.draftRect);
  const dragOrigin = useHuntStore((state) => state.dragOrigin);
  const photos = useHuntStore((state) => state.photos);
  const lockedCells = useHuntStore((state) => state.lockedCells);
  const statusMessage = useHuntStore((state) => state.statusMessage);
  const setDraftRect = useHuntStore((state) => state.setDraftRect);
  const setDragOrigin = useHuntStore((state) => state.setDragOrigin);
  const setStatusMessage = useHuntStore((state) => state.setStatusMessage);
  const clearDraft = useHuntStore((state) => state.clearDraft);

  const huntComplete = isHuntComplete(lockedCells.length, gridSize);

  const fraction = draftClaimFraction(draftRect, gridSize);
  const maxPct = Math.round(gameRules.maxClaimFraction * 100);
  const dragHint =
    dragOrigin && fraction > gameRules.maxClaimFraction
      ? `Max ${maxPct}% per photo`
      : null;
  const canContinue =
    !dragOrigin &&
    isDraftClaimValid({
      draftRect,
      lockedCells,
      lineCellIndexes,
      gridSize,
    });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          if (!layout) {
            return;
          }
          const hit = hitTestGridCell(event.x, event.y, layout, gridSize);
          if (!hit) {
            return;
          }
          const origin = { x: hit.x, y: hit.y };
          setDragOrigin(origin);
          setStatusMessage(null);
          setDraftRect({
            rect: { minX: origin.x, minY: origin.y, maxX: hit.x, maxY: hit.y },
            gridSize,
          });
        })
        .onUpdate((event) => {
          if (!layout) {
            return;
          }
          const origin = useHuntStore.getState().dragOrigin;
          if (!origin) {
            return;
          }
          const hit = hitTestGridCell(event.x, event.y, layout, gridSize);
          if (!hit) {
            return;
          }
          setDraftRect({
            rect: { minX: origin.x, minY: origin.y, maxX: hit.x, maxY: hit.y },
            gridSize,
          });
        })
        .onEnd(() => {
          setDragOrigin(null);
          const rect = useHuntStore.getState().draftRect;
          if (!rect) {
            return;
          }
          setStatusMessage(
            draftStatusMessage({
              draftRect: rect,
              lockedCells: useHuntStore.getState().lockedCells,
              lineCellIndexes,
              gridSize,
            }),
          );
        }),
    [gridSize, layout, lineCellIndexes, setDraftRect, setDragOrigin, setStatusMessage],
  );

  if (huntComplete) {
    return (
      <View
        className="flex-1 bg-background justify-center px-6 gap-4"
        style={{ paddingTop: insets.top }}
      >
        <Text
          className="text-3xl text-foreground leading-none"
          style={{ fontFamily: 'Anton-Regular' }}
        >
          Nothing left to claim
        </Text>
        <Text className="text-muted text-base">
          The project grid is full — today’s outline is complete ({photos.length} photo
          {photos.length === 1 ? '' : 's'}).
        </Text>
        <Button
          size="lg"
          onPress={() => {
            if (router.canDismiss()) {
              router.dismissTo('/complete');
            } else {
              router.replace('/complete');
            }
          }}
        >
          <Button.Label>View results</Button.Label>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View
        className="flex-1"
        style={{
          paddingTop: FRAME_PAD,
          paddingLeft: FRAME_PAD,
          paddingRight: FRAME_PAD,
          paddingBottom: FRAME_PAD,
        }}
      >
        <View
          className="flex-1 bg-black overflow-hidden self-stretch"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setLayout(computeOverlayLayout(width, height, gameRules.selectEdgeInsetPx));
          }}
        >
          {layout ? (
            <GestureDetector gesture={pan}>
              <View style={StyleSheet.absoluteFill}>
                <ShapeCameraOverlay
                  mode="project"
                  shape={shape}
                  layout={layout}
                  photos={photos}
                  draftRect={draftRect}
                  guideLineCells={NO_GUIDE_CELLS}
                />
              </View>
            </GestureDetector>
          ) : null}
        </View>
      </View>

      <Surface
        className="gap-3 px-4 pt-3 rounded-none"
        style={{ paddingBottom: Math.max(insets.bottom, FRAME_PAD) }}
      >
        <View className="gap-1.5">
          <Button variant="ghost" size="sm" className="self-start" onPress={() => router.back()}>
            <Button.Label>Back</Button.Label>
          </Button>
          <Text
            className="text-xl text-foreground leading-none"
            style={{ fontFamily: 'Anton-Regular' }}
          >
            Select region
          </Text>
          <Text className="text-foreground font-bold text-lg">
            {Math.round(fraction * 100)}% / max {maxPct}%
          </Text>
          <Text className="text-muted text-sm">Drag a rectangle over the project grid.</Text>
          <View className="min-h-5 justify-center">
            {dragHint || statusMessage ? (
              <Text className="text-danger font-medium text-sm">{dragHint ?? statusMessage}</Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-3 min-h-14">
          <Button variant="secondary" onPress={clearDraft}>
            <Button.Label>Clear</Button.Label>
          </Button>
          <Button
            className="flex-1"
            isDisabled={!canContinue}
            onPress={() => router.push('/camera')}
          >
            <Button.Label>Take photo</Button.Label>
          </Button>
        </View>
      </Surface>
    </View>
  );
}
