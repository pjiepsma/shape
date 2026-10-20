import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Chip, Surface } from 'heroui-native';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShapeCameraOverlay } from '@/camera/ShapeCameraOverlay';
import { computeOverlayLayout, type OverlayLayout } from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { getSupabase } from '@/lib/supabase';
import { buildShape, claimFraction, pawnShape, projectCellCount, type LineCell } from '@/shapeEngine';
import { isHuntComplete, useHuntStore } from '@/store/huntStore';

const NO_GUIDE_CELLS: LineCell[] = [];
const FRAME_PAD = 16;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, , getPermission] = useCameraPermissions();
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const supabaseReady = getSupabase() !== null;
  const shape = useMemo(() => buildShape(pawnShape), []);
  const lockedCells = useHuntStore((state) => state.lockedCells);
  const photos = useHuntStore((state) => state.photos);
  const totalCells = projectCellCount(shape.definition.gridSize);
  const totalFraction = claimFraction(lockedCells.length, totalCells);
  const huntComplete = isHuntComplete(lockedCells.length, shape.definition.gridSize);
  const filledPct = Math.round(totalFraction * 100);
  const cameraGranted = permission?.granted === true;
  const huntBlocked = !huntComplete && !cameraGranted;

  useFocusEffect(
    useCallback(() => {
      getPermission();
    }, [getPermission]),
  );

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, FRAME_PAD),
      }}
    >
      <View className="gap-3 mt-3">
        <Text
          className="text-5xl text-accent leading-none"
          style={{ fontFamily: 'Anton-Regular' }}
        >
          Outsee
        </Text>
        <Text className="text-muted text-base">
          Rebuild today’s outline from real-world photos.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Chip size="sm" variant="secondary">
            Grid {gameRules.gridSize}×{gameRules.gridSize}
          </Chip>
          <Chip size="sm" variant="secondary">
            Fill {Math.round(gameRules.minClaimFraction * 100)}–
            {Math.round(gameRules.maxClaimFraction * 100)}%
          </Chip>
        </View>
        <Text className="text-foreground font-medium text-base">
          Today’s pawn · {filledPct}% filled · {photos.length} photo
          {photos.length === 1 ? '' : 's'}
        </Text>
        <Text className="text-muted text-sm">
          {huntComplete
            ? 'Outline complete — view your results'
            : huntBlocked
              ? 'Camera access needed to hunt — open Settings'
              : supabaseReady
                ? 'Ready to hunt'
                : 'Add Supabase keys to .env'}
        </Text>
      </View>

      <Surface className="flex-1 overflow-hidden p-0 mt-4 mb-4 min-h-[180px]">
        <View
          className="flex-1 bg-background"
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
          {layout ? (
            <ShapeCameraOverlay
              mode="project"
              shape={shape}
              layout={layout}
              photos={photos}
              draftRect={null}
              guideLineCells={NO_GUIDE_CELLS}
            />
          ) : null}
        </View>
      </Surface>

      <View className="gap-3">
        <Button
          className="w-full"
          size="lg"
          isDisabled={huntBlocked}
          onPress={() => router.push(huntComplete ? '/complete' : '/select')}
        >
          <Button.Label>
            {huntComplete ? 'View results' : photos.length > 0 ? 'Continue' : 'Start hunt'}
          </Button.Label>
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          size="lg"
          onPress={() => router.push('/settings')}
        >
          <Button.Label>Settings</Button.Label>
        </Button>
        {supabaseReady ? (
          <Button
            className="w-full"
            variant="secondary"
            size="lg"
            onPress={() => router.push('/leaderboard')}
          >
            <Button.Label>Leaderboard</Button.Label>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
