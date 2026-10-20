import '../../global.css';

import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider, type HeroUINativeConfig } from 'heroui-native';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Uniwind } from 'uniwind';

/** Must run before first paint — late setTheme leaves Reanimated with color "invalid". */
Uniwind.setTheme('dark');

SplashScreen.preventAutoHideAsync();

const heroUIConfig: HeroUINativeConfig = {
  // Reanimated crashes UIManager when Uniwind returns color "invalid" for hover mixes.
  animation: 'disable-all',
  toast: false,
  devInfo: {
    stylingPrinciples: false,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'JetBrainsMono-Regular': JetBrainsMono_400Regular,
    'JetBrainsMono-Medium': JetBrainsMono_500Medium,
    'JetBrainsMono-SemiBold': JetBrainsMono_600SemiBold,
    'JetBrainsMono-Bold': JetBrainsMono_700Bold,
    'Anton-Regular': Anton_400Regular,
  });

  useEffect(() => {
    const hideSplash = async () => {
      if (fontsLoaded || fontError) {
        await SplashScreen.hideAsync();
      }
    };
    hideSplash();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <HeroUINativeProvider config={heroUIConfig}>
        <View className="flex-1 bg-background">
          {/*
            Register hover tokens in className so Uniwind exposes them to
            useThemeColor / Button Reanimated styles (see Uniwind useCSSVariable docs).
          */}
          <View
            pointerEvents="none"
            className="absolute h-0 w-0 overflow-hidden bg-accent bg-accent-hover bg-accent-foreground bg-default bg-default-hover bg-surface bg-surface-hover bg-danger bg-danger-hover bg-success bg-success-hover bg-warning bg-warning-hover bg-muted bg-overlay bg-border bg-foreground"
          />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              freezeOnBlur: true,
            }}
          />
        </View>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
