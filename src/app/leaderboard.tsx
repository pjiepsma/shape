import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Chip, Dialog, PressableFeedback, Spinner, Surface } from 'heroui-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchAverageLeaderboard,
  fetchOverallLeaderboard,
  fetchTodayLeaderboard,
  huntResultPublicUrl,
  type HuntResultRow,
} from '@/lib/submitHuntResult';
import { getSupabase } from '@/lib/supabase';

const FRAME_PAD = 16;

type BoardScope = 'today' | 'best' | 'average';

function scopeSubtitle(scope: BoardScope): string {
  switch (scope) {
    case 'today':
      return 'Today’s finishes · ranked by match quality';
    case 'best':
      return 'Best single hunt per player · all time';
    case 'average':
      return 'Best average score per player · all time';
  }
}

function scopeEmptyMessage(scope: BoardScope): string {
  switch (scope) {
    case 'today':
      return 'No finishes yet today — be the first.';
    case 'best':
    case 'average':
      return 'No finishes yet — be the first.';
  }
}

async function fetchBoard(scope: BoardScope): Promise<HuntResultRow[]> {
  switch (scope) {
    case 'today':
      return fetchTodayLeaderboard(50);
    case 'best':
      return fetchOverallLeaderboard(50);
    case 'average':
      return fetchAverageLeaderboard(50);
  }
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [scope, setScope] = useState<BoardScope>('today');
  const [rows, setRows] = useState<HuntResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const previewSize = Math.min(windowWidth - FRAME_PAD * 4, windowWidth * 0.9);

  const loadBoard = useCallback(async (nextScope: BoardScope) => {
    if (!getSupabase()) {
      setErrorMessage('Supabase is not configured — add keys to .env');
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchBoard(nextScope);
      setRows(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load leaderboard');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!getSupabase()) {
        if (!cancelled) {
          setErrorMessage('Supabase is not configured — add keys to .env');
          setRows([]);
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchTodayLeaderboard(50);
        if (!cancelled) {
          setRows(data);
          setErrorMessage(null);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load leaderboard');
          setRows([]);
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelectScope = (nextScope: BoardScope) => {
    setScope(nextScope);
    setLoading(true);
    loadBoard(nextScope);
  };

  return (
    <View
      className="flex-1 bg-background px-6 gap-3"
      style={{
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, FRAME_PAD),
      }}
    >
      <Button variant="ghost" size="sm" className="self-start mt-3" onPress={() => router.back()}>
        <Button.Label>Back</Button.Label>
      </Button>
      <Text
        className="text-4xl text-accent leading-none"
        style={{ fontFamily: 'Anton-Regular' }}
      >
        Leaderboard
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          size="sm"
          variant={scope === 'today' ? 'primary' : 'secondary'}
          onPress={() => onSelectScope('today')}
        >
          Today
        </Chip>
        <Chip
          size="sm"
          variant={scope === 'best' ? 'primary' : 'secondary'}
          onPress={() => onSelectScope('best')}
        >
          Best
        </Chip>
        <Chip
          size="sm"
          variant={scope === 'average' ? 'primary' : 'secondary'}
          onPress={() => onSelectScope('average')}
        >
          Average
        </Chip>
      </View>
      <Text className="text-muted text-sm">{scopeSubtitle(scope)}</Text>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" color="default" />
        </View>
      ) : errorMessage ? (
        <Text className="text-danger font-medium text-sm">{errorMessage}</Text>
      ) : rows.length === 0 ? (
        <Text className="text-muted text-base mt-4">{scopeEmptyMessage(scope)}</Text>
      ) : (
        <FlatList
          className="flex-1"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 pb-4"
          renderItem={({ item, index }) => {
            const imageUrl = huntResultPublicUrl(item.result_image_path);
            const scoreLabel =
              scope === 'average'
                ? `${Math.round(item.end_score * 100)}% avg${
                    item.hunt_count !== undefined
                      ? ` · ${item.hunt_count} hunt${item.hunt_count === 1 ? '' : 's'}`
                      : ''
                  }`
                : `${Math.round(item.end_score * 100)}% match`;
            return (
              <Surface className="flex-row items-center gap-3 p-3">
                <Text className="text-foreground font-bold text-lg w-8">{index + 1}</Text>
                {imageUrl ? (
                  <PressableFeedback
                    accessibilityRole="button"
                    accessibilityLabel={`View ${item.display_name}'s result`}
                    onPress={() => setPreviewUri(imageUrl)}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={{ width: 56, height: 56 }}
                      className="border-2 border-border"
                      contentFit="cover"
                    />
                  </PressableFeedback>
                ) : (
                  <View className="w-14 h-14 bg-surface-secondary border-2 border-border" />
                )}
                <View className="flex-1 gap-0.5">
                  <Text className="text-foreground font-medium text-base" numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Text className="text-muted text-sm">{scoreLabel}</Text>
                </View>
              </Surface>
            );
          }}
        />
      )}

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onPress={() => {
          if (router.canDismiss()) {
            router.dismissTo('/');
          } else {
            router.replace('/');
          }
        }}
      >
        <Button.Label>Home</Button.Label>
      </Button>

      <Dialog
        isOpen={previewUri !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUri(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content className="p-3 gap-3 items-center">
            <Dialog.Close variant="ghost" className="self-end" />
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: previewSize, height: previewSize }}
                className="border-2 border-border"
                contentFit="contain"
              />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </View>
  );
}
