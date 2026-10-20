import type { ConfigContext, ExpoConfig } from 'expo/config';

type ExecSyncFn = (command: string, options: { encoding: 'utf8' }) => string;

/** LAN IP baked at Metro/config eval so a physical device can POST debug ingest. */
function resolveDebugIngestHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_DEBUG_INGEST_HOST?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  // Avoid static `node:` imports — app tsconfig has no @types/node.
  // Metro evaluates this on the Mac when the bundler starts.
  let execSync: ExecSyncFn;
  try {
    execSync = (
      require('child_process') as { execSync: ExecSyncFn }
    ).execSync;
  } catch {
    return '';
  }

  try {
    const ip = execSync('ipconfig getifaddr en0', { encoding: 'utf8' }).trim();
    if (ip.length > 0) {
      return ip;
    }
  } catch {
    // en0 down or non-macOS
  }

  try {
    const os = require('os') as {
      networkInterfaces: () => Record<
        string,
        Array<{ family: string | number; internal: boolean; address: string }> | undefined
      >;
    };
    for (const list of Object.values(os.networkInterfaces())) {
      for (const net of list ?? []) {
        if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // sandbox / restricted env
  }

  return '';
}

const debugIngestHost = resolveDebugIngestHost();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Outsee',
  slug: 'outsee',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'outsee',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.outsee.app',
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: 'com.outsee.app',
    adaptiveIcon: {
      backgroundColor: '#E4EBE4',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-font',
    [
      'expo-build-properties',
      {
        android: {
          buildArchs: ['arm64-v8a'],
          usesCleartextTraffic: true,
        },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Outsee needs the camera so you can photograph real-world edges that match today’s outline.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#E4EBE4',
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    websiteUrl: 'https://outsee.app',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    /** Physical-device → Mac Cursor ingest (`:7482`). Empty if LAN IP unknown. */
    debugIngestHost,
    eas: {
      projectId: '27ba2e20-8b7c-4719-900f-ebe825d024e9',
    },
  },
});

