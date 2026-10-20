import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Spinner, Surface } from 'heroui-native';
import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchTodayLeaderboard,
  huntResultPublicUrl,
  type HuntResultRow,
} from '@/lib/submitHuntResult';
import { getSupabase } from '@/lib/supabase';

const FRAME_PAD = 16;

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<HuntResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!getSupabase()) {
        if (!cancelled) {
          setErrorMessage('Supabase is not configured — add keys to .env');
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchTodayLeaderboard(50);
        if (!cancelled) {
          setRows(data);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load leaderboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Text className="text-muted text-sm">Today’s finishes · ranked by match quality</Text>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" color="default" />
        </View>
      ) : errorMessage ? (
        <Text className="text-danger font-medium text-sm">{errorMessage}</Text>
      ) : rows.length === 0 ? (
        <Text className="text-muted text-base mt-4">No finishes yet today — be the first.</Text>
      ) : (
        <FlatList
          className="flex-1"
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 pb-4"
          renderItem={({ item, index }) => {
            const imageUrl = huntResultPublicUrl(item.result_image_path);
            return (
              <Surface className="flex-row items-center gap-3 p-3">
                <Text className="text-foreground font-bold text-lg w-8">{index + 1}</Text>
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: 56, height: 56 }}
                    className="border-2 border-border"
                    contentFit="cover"
                  />
                ) : (
                  <View className="w-14 h-14 bg-surface-secondary border-2 border-border" />
                )}
                <View className="flex-1 gap-0.5">
                  <Text className="text-foreground font-medium text-base" numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Text className="text-muted text-sm">
                    {Math.round(item.end_score * 100)}% match
                  </Text>
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
    </View>
  );
}
