import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraFitOverlay } from '@/camera/CameraFitOverlay';
import { computeFitOverlayLayout } from '@/camera/overlayLayout';
import { buildShape, lineCellsInRect, pawnShape } from '@/shapeEngine';
import { isHuntComplete, useHuntStore } from '@/store/huntStore';
import { colors } from '@/theme/colors';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null);

  const shape = useMemo(() => buildShape(pawnShape), []);
  const lineCellIndexes = useMemo(
    () => new Set(shape.lineCells.map((cell) => cell.index)),
    [shape.lineCells],
  );

  const pendingShot = useHuntStore((state) => state.pendingShot);
  const draftRect = useHuntStore((state) => state.draftRect);
  const statusMessage = useHuntStore((state) => state.statusMessage);
  const setPendingShot = useHuntStore((state) => state.setPendingShot);
  const keepPhoto = useHuntStore((state) => state.keepPhoto);

  const guideLineCells = useMemo(() => {
    if (!draftRect) {
      return [];
    }
    const indexes = new Set(lineCellsInRect(draftRect, shape.lineCells));
    return shape.lineCells.filter((cell) => indexes.has(cell.index));
  }, [draftRect, shape.lineCells]);

  const layout = useMemo(() => {
    if (!viewSize || !draftRect || viewSize.width <= 0 || viewSize.height <= 0) {
      return null;
    }
    return computeFitOverlayLayout(
      viewSize.width,
      viewSize.height,
      draftRect,
      shape.definition.gridSize,
    );
  }, [draftRect, shape.definition.gridSize, viewSize]);

  if (!pendingShot) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.title}>No shot to review</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/select')}>
          <Text style={styles.primaryButtonText}>Back to select</Text>
        </Pressable>
      </View>
    );
  }

  const scorePct = Math.round(pendingShot.score.score * 100);
  const nullPct = Math.round(pendingShot.score.nullPercentileScore * 100);

  const onKeep = async () => {
    const gridSize = shape.definition.gridSize;
    const ok = await keepPhoto({
      lineCellIndexes,
      gridSize,
    });
    if (!ok) {
      return;
    }
    const lockedCount = useHuntStore.getState().lockedCells.length;
    if (isHuntComplete(lockedCount, gridSize)) {
      router.dismissTo('/complete');
      return;
    }
    router.dismissTo('/');
  };

  const onRetake = () => {
    setPendingShot(null);
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Text style={styles.title}>Line overlap</Text>
      <Text style={styles.score}>{scorePct}%</Text>
      <Text style={styles.meta}>
        {pendingShot.score.passed
          ? `Passed null baseline (${nullPct}%)`
          : `Below null baseline (${nullPct}%)`}
      </Text>
      <Text style={styles.hint}>Lime line = what was scored against the photo.</Text>

      <View
        style={styles.preview}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) {
            return;
          }
          setViewSize((prev) =>
            prev && prev.width === width && prev.height === height ? prev : { width, height },
          );
        }}
      >
        <Image source={{ uri: pendingShot.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {layout && draftRect ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CameraFitOverlay
              shape={shape}
              layout={layout}
              window={layout.window}
              draftRect={draftRect}
              guideLineCells={guideLineCells}
            />
          </View>
        ) : null}
      </View>

      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Retake</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onKeep}>
          <Text style={styles.primaryButtonText}>Keep</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    gap: 12,
  },
  centered: {
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'DMSans_500Medium',
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 12,
  },
  score: {
    fontFamily: 'DMSans_700Bold',
    color: colors.accent,
    fontSize: 48,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    color: colors.text,
    fontSize: 15,
  },
  hint: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 13,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.card,
    minHeight: 200,
  },
  status: {
    fontFamily: 'DMSans_500Medium',
    color: colors.photo.coral,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'DMSans_700Bold',
    color: colors.background,
    fontSize: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'DMSans_700Bold',
    color: colors.text,
    fontSize: 16,
  },
});
