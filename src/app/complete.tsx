import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Chip, Input, Label, Surface, TextField } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShapeCameraOverlay } from '@/camera/ShapeCameraOverlay';
import {
  computeOverlayLayout,
  gridRectToScreen,
  type OverlayLayout,
} from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { getCachedDisplayName, loadProfile } from '@/lib/profile';
import { getSupabase } from '@/lib/supabase';
import { submitHuntResult } from '@/lib/submitHuntResult';
import { buildShape, pawnShape, type LineCell } from '@/shapeEngine';
import { huntEndScore, isHuntComplete, useHuntStore } from '@/store/huntStore';

const NO_GUIDE_CELLS: LineCell[] = [];
const FRAME_PAD = 16;

export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const shape = useMemo(() => buildShape(pawnShape), []);
  const gridSize = shape.definition.gridSize;
  const photos = useHuntStore((state) => state.photos);
  const lockedCells = useHuntStore((state) => state.lockedCells);
  const resetHunt = useHuntStore((state) => state.resetHunt);

  const complete = isHuntComplete(lockedCells.length, gridSize);
  const endScore = huntEndScore(photos);
  const endScorePct = Math.round(endScore * 100);
  const passedCount = photos.filter((photo) => photo.scorePassed).length;
  const nameTrimmed = displayName.trim();
  const nameValid = nameTrimmed.length >= 1 && nameTrimmed.length <= 24;
  const supabaseReady = getSupabase() !== null;
  const canSubmit =
    supabaseReady && !submitting && !profileLoading && (usernameLocked || nameValid);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const profile = await loadProfile();
        const cached = profile?.displayName ?? (await getCachedDisplayName());
        if (cancelled) {
          return;
        }
        if (cached) {
          setDisplayName(cached);
          setUsernameLocked(true);
        }
      } catch {
        if (!cancelled) {
          const cached = await getCachedDisplayName();
          if (cached) {
            setDisplayName(cached);
            setUsernameLocked(true);
          }
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const onSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitHuntResult({
        displayName: usernameLocked ? undefined : nameTrimmed,
        endScore,
        photos,
      });
      router.push('/leaderboard');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!complete || photos.length === 0) {
    return (
      <View
        className="flex-1 bg-background justify-center px-6 gap-4"
        style={{ paddingTop: insets.top }}
      >
        <Text
          className="text-5xl text-foreground leading-none"
          style={{ fontFamily: 'Anton-Regular' }}
        >
          Outsee
        </Text>
        <Text className="text-muted font-medium text-base">
          No finished hunt to show.
        </Text>
        <Button onPress={() => router.replace('/')}>
          <Button.Label>Home</Button.Label>
        </Button>
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

      <Surface className="flex-1 overflow-hidden p-0 min-h-[180px]">
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

      {usernameLocked ? (
        <View className="gap-1">
          <Text className="text-muted text-sm">Username</Text>
          <Text className="text-foreground font-medium text-base">{displayName}</Text>
          <Text className="text-muted text-xs">Change it in Settings</Text>
        </View>
      ) : (
        <TextField
          isRequired
          isInvalid={Boolean(submitError) || (displayName.length > 0 && !nameValid)}
        >
          <Label>Username</Label>
          <Input
            placeholder="Pick a name for the board"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={24}
            autoCapitalize="words"
            editable={!submitting && !profileLoading}
          />
        </TextField>
      )}

      {submitError ? (
        <Text className="text-danger font-medium text-sm">{submitError}</Text>
      ) : !supabaseReady ? (
        <Text className="text-muted text-sm">Add Supabase keys to .env to submit.</Text>
      ) : null}

      <Button size="lg" className="w-full" isDisabled={!canSubmit} onPress={onSubmit}>
        <Button.Label>{submitting ? 'Submitting…' : 'Submit to leaderboard'}</Button.Label>
      </Button>
      <Button variant="secondary" size="lg" className="w-full" onPress={onRestart} isDisabled={submitting}>
        <Button.Label>Restart hunt</Button.Label>
      </Button>
    </View>
  );
}
