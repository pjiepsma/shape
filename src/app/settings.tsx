import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Input, Label, Surface, TextField } from 'heroui-native';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCachedDisplayName, loadProfile, saveUsername } from '@/lib/profile';
import { getSupabase } from '@/lib/supabase';

const FRAME_PAD = 16;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [displayName, setDisplayName] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const supabaseReady = getSupabase() !== null;
  const nameTrimmed = displayName.trim();
  const nameValid = nameTrimmed.length >= 1 && nameTrimmed.length <= 24;
  const cameraGranted = permission?.granted === true;
  const canAskAgain = permission?.canAskAgain !== false;

  const refreshProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const profile = await loadProfile();
      const name = profile?.displayName ?? (await getCachedDisplayName()) ?? '';
      setDisplayName(name);
    } catch {
      const cached = await getCachedDisplayName();
      setDisplayName(cached ?? '');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      getPermission();
    }, [refreshProfile, getPermission]),
  );

  const onSaveUsername = async () => {
    if (!nameValid || saving || !supabaseReady) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      await saveUsername(nameTrimmed);
      setSaveOk(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save username');
    } finally {
      setSaving(false);
    }
  };

  const onCameraAction = async () => {
    if (cameraGranted) {
      return;
    }
    if (canAskAgain) {
      await requestPermission();
      return;
    }
    await Linking.openSettings();
  };

  return (
    <View
      className="flex-1 bg-background px-6 gap-4"
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
        Settings
      </Text>

      <Surface className="gap-3 p-4">
        <Text className="text-foreground font-medium text-base">Username</Text>
        <Text className="text-muted text-sm">
          Shown on the leaderboard. Pick once on first submit, or change it here.
        </Text>
        <TextField
          isRequired
          isInvalid={Boolean(saveError) || (displayName.length > 0 && !nameValid)}
        >
          <Label>Username</Label>
          <Input
            placeholder="Your name on the board"
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              setSaveOk(false);
              setSaveError(null);
            }}
            maxLength={24}
            autoCapitalize="words"
            editable={!saving && !loadingProfile && supabaseReady}
          />
        </TextField>
        {saveError ? (
          <Text className="text-danger font-medium text-sm">{saveError}</Text>
        ) : saveOk ? (
          <Text className="text-success font-medium text-sm">Username saved</Text>
        ) : !supabaseReady ? (
          <Text className="text-muted text-sm">Add Supabase keys to .env to save.</Text>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          isDisabled={!nameValid || saving || loadingProfile || !supabaseReady}
          onPress={onSaveUsername}
        >
          <Button.Label>{saving ? 'Saving…' : 'Save username'}</Button.Label>
        </Button>
      </Surface>

      <Surface className="gap-3 p-4">
        <Text className="text-foreground font-medium text-base">Camera</Text>
        <Text className="text-muted text-sm">
          {cameraGranted
            ? 'Camera access is on — you can hunt.'
            : canAskAgain
              ? 'Camera access is off. Allow it to start a hunt.'
              : 'Camera access is blocked. Open system settings to turn it back on.'}
        </Text>
        {!cameraGranted ? (
          <Button size="lg" className="w-full" onPress={onCameraAction}>
            <Button.Label>{canAskAgain ? 'Allow camera' : 'Open system settings'}</Button.Label>
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onPress={() => Linking.openSettings()}
          >
            <Button.Label>System settings</Button.Label>
          </Button>
        )}
      </Surface>
    </View>
  );
}
