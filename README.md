# Outsee

Daily mobile game: rebuild a shared outline from live camera photos. MVP built with Expo SDK 58, React Native, TypeScript, and Supabase.

Site: [outsee.app](https://outsee.app) (domain claimed; DNS / hosting not wired yet).

## Decision: local Android builds only

We **do not** use EAS cloud builds (free workers OOM on Skia; paid workers are out of scope). Development builds are made on **macOS with the Android SDK**.

## Prerequisites

- Node.js LTS
- macOS with:
  - Temurin / JDK **17** (default path used by the build script: `/Library/Java/JavaVirtualMachines/temurin-17.jdk`)
  - Android SDK (`ANDROID_HOME`, usually `~/Library/Android/sdk`)
- Supabase account (Free plan)
- Physical Android device (USB debugging)

SDK 58 needs a **development build** (not Expo Go). `expo-dev-client` + local APK.

## Project link (one-time)

### 1. Supabase project

1. Create a Free project named **Outsee**.
2. Project Settings → API → copy **Project URL** and **anon public** key.
3. Auth → Providers → enable **Anonymous Sign-Ins**.
4. Copy [`.env.example`](.env.example) to `.env` and fill:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Never commit `.env`.

### 2. Android device

Enable Developer options and USB debugging.

## Install and run

```bash
npm install
```

### Build the development APK (local)

```bash
npm run android:apk
```

Install:

`android/app/build/outputs/apk/debug/app-debug.apk`

Then:

```bash
npx expo start --dev-client
```

Open the app on the phone. You should see the dark **Outsee** home screen.

JS-only changes: restart Metro. Native module changes: run `npm run android:apk` again.

### Scripts

| Script                | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `npm start`           | Metro bundler (`expo start`)               |
| `npm run android:apk` | Local prebuild + debug APK (arm64-v8a)     |
| `npm run android`     | `expo run:android` (needs device/emulator) |
| `npm run lint`        | ESLint                                     |
| `npm run format`      | Prettier write                             |
| `npm run typecheck`   | `tsc --noEmit`                             |
| `npm test`            | Jest                                       |

## Free-plan limits (Oct 2026)

Re-check [Supabase pricing](https://supabase.com/pricing). Expo cloud build quotas are irrelevant — we build locally.

### Supabase Free

- **500 MB** database per project
- **1 GB** file storage
- **5 GB** egress
- **50,000** monthly active users
- **500,000** Edge Function invocations / month
- Projects **pause after ~1 week** of inactivity
- Limit of **2** active free projects

Photo storage is the most likely first cost driver. Uploads will later be downscaled to **1080 px** wide JPEG at quality **0.8** (see [`src/config/gameRules.ts`](src/config/gameRules.ts)).

## Tuning

Game rules and scoring placeholders live in one file: [`src/config/gameRules.ts`](src/config/gameRules.ts).

## Design tokens

| Token      | Value                 |
| ---------- | --------------------- |
| Background | `#14171A`             |
| Card       | `#1E2327`             |
| Accent     | `#D4FF3F`             |
| Text       | `#FFFFFF` / `#A9B1B8` |
| Font       | DM Sans               |

## Shape engine

Pure TypeScript module in [`src/shapeEngine/`](src/shapeEngine/):

- Sample SVG paths in normalized 0..1 coordinates
- Build 20×20 line cells (center, angle, path index)
- Claim % / overlap / 10–40% validation via [`gameRules`](src/config/gameRules.ts)
- Seed shape: chess pawn side profile

```bash
npm test
```

## Phase status

- **Phase 1 (Setup):** Expo app, env, Supabase client stub, local Android APK workflow, Home shell
- **Phase 2 (Shape engine):** path sampling, line cells, claim rules, pawn seed, Jest tests
- **Phase 3 (Camera):** live camera, Skia outline/grid, finger paint, lock + 40% rules
- Next: **Phase 4 — Scoring** (`scoreMatch` + fixture tuning screen)

### Camera (Phase 3)

Requires a **local development build** (native camera + Skia). From Home tap **Start hunt** / **Continue**. After adding native modules, rebuild with `npm run android:apk`.
