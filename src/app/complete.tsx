import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShapeCameraOverlay } from '@/camera/ShapeCameraOverlay';
import {
  computeOverlayLayout,
  gridRectToScreen,
  type OverlayLayout,
} from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { buildShape, pawnShape, type LineCell } from '@/shapeEngine';
import {
  huntEndScore,
  isHuntComplete,
  useHuntStore,
} from '@/store/huntStore';
import { colors } from '@/theme/colors';

const NO_GUIDE_CELLS: LineCell[] = [];

export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState<OverlayLayout | null>(null);

  const shape = useMemo(() => buildShape(pawnShape), []);
  const gridSize = shape.definition.gridSize;
  const photos = useHuntStore((state) => state.photos);
  const lockedCells = useHuntStore((state) => state.lockedCells);
  const resetHunt = useHuntStore((state) => state.resetHunt);

  const complete = isHuntComplete(lockedCells.length, gridSize);
  const endScorePct = Math.round(huntEndScore(photos) * 100);
  const passedCount = photos.filter((photo) => photo.scorePassed).length;

  const photoTiles = useMemo(() => {
    if (!layout) {
      return [];
    }
    return photos.map((photo) => ({
      photo,
      frame: gridRectToScreen(photo.rect, layout, gridSize),
    }));
  }, [gridSize, layout, photos]);

  const onRestart = () => {
    resetHunt();
    if (router.canDismiss()) {
      router.dismissTo('/');
    } else {
      router.replace('/');
    }
  };

  if (!complete || photos.length === 0) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.eyebrow}>Hunt complete</Text>
        <Text style={styles.empty}>No finished hunt to show.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.primaryButtonText}>Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Text style={styles.eyebrow}>Hunt complete</Text>
      <Text style={styles.score}>{endScorePct}%</Text>
      <Text style={styles.meta}>
        Match quality · {photos.length} photo{photos.length === 1 ? '' : 's'} · {passedCount}{' '}
        passed
      </Text>

      <View
        style={styles.preview}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) {
            return;
          }
          setLayout((prev) =>
            prev && prev.width === width && prev.height === height
              ? prev
              : computeOverlayLayout(width, height, gameRules.selectEdgeInsetPx),
          );
        }}
      >
        {photoTiles.map(({ photo, frame }) =>
          photo.uri ? (
            <Image
              key={photo.id}
              source={{ uri: photo.uri }}
              style={[
                styles.photoTile,
                {
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                },
              ]}
              contentFit="fill"
            />
          ) : (
            <View
              key={photo.id}
              style={[
                styles.photoTile,
                {
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                  backgroundColor: photo.color,
                },
              ]}
            />
          ),
        )}

        {layout ? (
          <ShapeCameraOverlay
            mode="project"
            shape={shape}
            layout={layout}
            photos={photos}
            draftRect={null}
            guideLineCells={NO_GUIDE_CELLS}
            showClaimFills={false}
          />
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbs}
      >
        {photos.map((photo) => (
          <View key={photo.id} style={styles.thumbWrap}>
            {photo.uri ? (
              <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: photo.color }]} />
            )}
            <Text style={styles.thumbScore}>{Math.round(photo.score * 100)}%</Text>
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.primaryButton} onPress={onRestart}>
        <Text style={styles.primaryButtonText}>Restart hunt</Text>
      </Pressable>
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
  eyebrow: {
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
  empty: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: 8,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.card,
    minHeight: 220,
  },
  photoTile: {
    position: 'absolute',
  },
  thumbs: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  thumbWrap: {
    width: 72,
    gap: 4,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  thumbScore: {
    fontFamily: 'DMSans_500Medium',
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  primaryButton: {
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
});
