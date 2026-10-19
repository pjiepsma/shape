import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gameRules } from '@/config/gameRules';
import { getSupabase } from '@/lib/supabase';
import { buildShape, claimFraction, pawnShape, projectCellCount } from '@/shapeEngine';
import { isHuntComplete, useHuntStore } from '@/store/huntStore';
import { colors } from '@/theme/colors';

export default function HomeScreen() {
  const router = useRouter();
  const supabaseReady = getSupabase() !== null;
  const shape = useMemo(() => buildShape(pawnShape), []);
  const lockedCells = useHuntStore((state) => state.lockedCells);
  const photos = useHuntStore((state) => state.photos);
  const totalCells = projectCellCount(shape.definition.gridSize);
  const totalFraction = claimFraction(lockedCells.length, totalCells);
  const huntComplete = isHuntComplete(lockedCells.length, shape.definition.gridSize);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.brand}>Shape Hunt</Text>
        <Text style={styles.subtitle}>Rebuild today’s outline from real-world photos.</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            Grid {gameRules.gridSize}×{gameRules.gridSize}
          </Text>
          <Text style={styles.meta}>
            Fill {Math.round(gameRules.minClaimFraction * 100)}–
            {Math.round(gameRules.maxClaimFraction * 100)}%
          </Text>
        </View>
        <Text style={styles.progress}>
          Today’s pawn · {Math.round(totalFraction * 100)}% filled · {photos.length} photo
          {photos.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.status}>
          {huntComplete
            ? 'Outline complete — view your results'
            : supabaseReady
              ? 'Supabase connected'
              : 'Add Supabase keys to .env'}
        </Text>
        <Pressable
          style={styles.continueButton}
          onPress={() => router.push(huntComplete ? '/complete' : '/select')}
        >
          <Text style={styles.continueText}>
            {huntComplete ? 'View results' : photos.length > 0 ? 'Continue' : 'Start hunt'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    minHeight: 44,
  },
  brand: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 32,
    color: colors.accent,
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  meta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.text,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  progress: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: colors.text,
  },
  status: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  continueButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    color: colors.background,
  },
});
