import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Chip, Surface } from 'heroui-native';
import { EmptyState } from 'heroui-native-pro/empty-state';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShapeCameraOverlay } from '@/camera/ShapeCameraOverlay';
import {
  computeOverlayLayout,
  gridRectToScreen,
  type OverlayLayout,
} from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { buildShape, pawnShape, type LineCell } from '@/shapeEngine';
import { huntEndScore, isHuntComplete, useHuntStore } from '@/store/huntStore';

const NO_GUIDE_CELLS: LineCell[] = [];
const FRAME_PAD = 16;

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
      <View
        className="flex-1 bg-background justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>Outsee</EmptyState.Title>
            <EmptyState.Description>No finished hunt to show.</EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button onPress={() => router.replace('/')}>
              <Button.Label>Home</Button.Label>
            </Button>
          </EmptyState.Content>
        </EmptyState>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background px-6 gap-3"
      style={{
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, FRAME_PAD),
      }}
    >
      <Text className="text-muted font-medium text-base mt-3">Hunt complete</Text>
      <Text
        className="text-5xl text-accent leading-none"
        style={{ fontFamily: 'Anton-Regular' }}
      >
        {endScorePct}%
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Chip size="sm" variant="secondary">
          Match quality
        </Chip>
        <Chip size="sm" variant="secondary">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </Chip>
        <Chip size="sm" variant="soft" color="success">
          {passedCount} passed
        </Chip>
      </View>

      <Surface className="flex-1 overflow-hidden p-0 min-h-[220px]">
        <View
          className="flex-1"
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
                style={{
                  position: 'absolute',
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                }}
                contentFit="fill"
              />
            ) : (
              <View
                key={photo.id}
                style={{
                  position: 'absolute',
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                  backgroundColor: photo.color,
                }}
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
      </Surface>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}
      >
        {photos.map((photo) => (
          <View key={photo.id} className="w-[72px] gap-1">
            {photo.uri ? (
              <Image
                source={{ uri: photo.uri }}
                className="border-2 border-border"
                style={{ width: 72, height: 72 }}
                contentFit="cover"
              />
            ) : (
              <View
                className="w-[72px] h-[72px] border-2 border-border"
                style={{ backgroundColor: photo.color }}
              />
            )}
            <Text className="text-muted font-medium text-xs text-center">
              {Math.round(photo.score * 100)}%
            </Text>
          </View>
        ))}
      </ScrollView>

      <Button size="lg" className="w-full" onPress={onRestart}>
        <Button.Label>Restart hunt</Button.Label>
      </Button>
    </View>
  );
}
