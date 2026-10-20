import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, Chip } from 'heroui-native';
import { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gameRules } from '@/config/gameRules';
import { getSupabase } from '@/lib/supabase';
import { buildShape, claimFraction, pawnShape, projectCellCount } from '@/shapeEngine';
import { isHuntComplete, useHuntStore } from '@/store/huntStore';

export default function HomeScreen() {
  const router = useRouter();
  const [permission, , getPermission] = useCameraPermissions();
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
    <SafeAreaView className="flex-1 bg-background px-6 justify-center">
      <Card className="gap-4 p-6">
        <Card.Body className="gap-3">
          <Text
            className="text-5xl text-accent leading-none"
            style={{ fontFamily: 'Anton-Regular' }}
          >
            Outsee
          </Text>
          <Card.Description>Rebuild today’s outline from real-world photos.</Card.Description>
          <View className="flex-row flex-wrap gap-2 mt-1">
            <Chip size="sm" variant="secondary">
              Grid {gameRules.gridSize}×{gameRules.gridSize}
            </Chip>
            <Chip size="sm" variant="secondary">
              Fill {Math.round(gameRules.minClaimFraction * 100)}–
              {Math.round(gameRules.maxClaimFraction * 100)}%
            </Chip>
          </View>
          <Text className="text-foreground font-medium text-base mt-1">
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
        </Card.Body>
        <Card.Footer className="gap-3">
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
        </Card.Footer>
      </Card>
    </SafeAreaView>
  );
}
