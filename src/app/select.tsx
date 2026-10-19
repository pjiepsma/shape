import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { colors } from '@/theme/colors';

const NO_GUIDE_CELLS: LineCell[] = [];

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
      <View style={[styles.root, styles.completeRoot, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Nothing left to claim</Text>
        <Text style={styles.hint}>
          The project grid is full — today’s outline is complete ({photos.length} photo
          {photos.length === 1 ? '' : 's'}).
        </Text>
        <Pressable
          style={styles.continueButton}
          onPress={() => {
            if (router.canDismiss()) {
              router.dismissTo('/complete');
            } else {
              router.replace('/complete');
            }
          }}
        >
          <Text style={styles.continueText}>View results</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.stage}
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

      <View style={[styles.hud, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.chipButton} onPress={() => router.back()}>
            <Text style={styles.chipText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Select region</Text>
          <Text style={styles.counter}>
            {Math.round(fraction * 100)}% / max {maxPct}%
          </Text>
          <Text style={styles.hint}>Drag a rectangle over the project grid.</Text>
        </View>

        {dragHint || statusMessage ? (
          <Text style={styles.status}>{dragHint ?? statusMessage}</Text>
        ) : null}

        <View style={styles.controls}>
          <Pressable style={styles.modeButton} onPress={clearDraft}>
            <Text style={styles.modeButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            style={[styles.continueButton, !canContinue && styles.continueDisabled]}
            disabled={!canContinue}
            onPress={() => router.push('/camera')}
          >
            <Text style={styles.continueText}>Take photo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  completeRoot: {
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  stage: {
    flex: 1,
    backgroundColor: '#0a0c0e',
  },
  hud: {
    backgroundColor: colors.card,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  topBar: {
    gap: 6,
  },
  chipButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.accent,
    fontSize: 16,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    color: colors.text,
    fontSize: 20,
  },
  counter: {
    fontFamily: 'DMSans_700Bold',
    color: colors.text,
    fontSize: 18,
  },
  hint: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 14,
  },
  status: {
    fontFamily: 'DMSans_500Medium',
    color: colors.photo.coral,
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
  },
  modeButton: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modeButtonText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.text,
    fontSize: 14,
  },
  continueButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.4,
  },
  continueText: {
    fontFamily: 'DMSans_700Bold',
    color: colors.background,
    fontSize: 16,
  },
});
