import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Spinner, Surface } from 'heroui-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraFitOverlay } from '@/camera/CameraFitOverlay';
import { postScoreDebugCapture } from '@/camera/debugCaptureLog';
import { loadGrayImage } from '@/camera/loadGrayImage';
import { normalizeCaptureUri } from '@/camera/normalizeCaptureUri';
import { computeFitOverlayLayout } from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import {
  buildScoreMatchCaptureLog,
  buildShape,
  lineCellsInRect,
  pawnShape,
  scoreMatch,
  templatePointsInRect,
} from '@/shapeEngine';
import { isHuntComplete, useHuntStore } from '@/store/huntStore';

type LifecycleEvent = {
  t: number;
  event: string;
  mountId: number;
};

/** Proof-only ring buffer — do not use to change capture behavior. */
const lifecycleLog: LifecycleEvent[] = [];
let mountCounter = 0;

function pushLifecycle(event: string, mountId: number) {
  lifecycleLog.push({ t: Date.now(), event, mountId });
  if (lifecycleLog.length > 40) {
    lifecycleLog.shift();
  }
  // #region agent log
  fetch('http://127.0.0.1:7482/ingest/607d09ba-1f8f-4fdb-91b5-28274c52e0a7', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '4b16c8',
    },
    body: JSON.stringify({
      sessionId: '4b16c8',
      runId: 'proof',
      hypothesisId: 'PROOF-lifecycle',
      location: 'camera.tsx:lifecycle',
      message: event,
      data: { mountId, recent: lifecycleLog.slice(-8) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isFocused, setIsFocused] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const mountIdRef = useRef(0);
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const captureBusyRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);

  // Keep CameraView mounted while captureBusy so takePictureAsync survives blur.
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      pushLifecycle('focus', mountIdRef.current);
      return () => {
        setIsFocused(false);
        if (!captureBusyRef.current) {
          setCameraReady(false);
        }
        pushLifecycle('blur', mountIdRef.current);
      };
    }, []),
  );

  const shape = useMemo(() => buildShape(pawnShape), []);
  const lineCellIndexes = useMemo(
    () => new Set(shape.lineCells.map((cell) => cell.index)),
    [shape.lineCells],
  );

  const draftRect = useHuntStore((state) => state.draftRect);
  const pendingShot = useHuntStore((state) => state.pendingShot);
  const statusMessage = useHuntStore((state) => state.statusMessage);
  const setPendingShot = useHuntStore((state) => state.setPendingShot);
  const setStatusMessage = useHuntStore((state) => state.setStatusMessage);
  const keepPhoto = useHuntStore((state) => state.keepPhoto);

  const reviewing = pendingShot !== null;
  const reviewCapturing = reviewing && pendingShot.uri === null;
  const reviewScoring = reviewing && pendingShot.uri !== null && pendingShot.score === null;
  const reviewBusy = reviewCapturing || reviewScoring;
  const scorePct = pendingShot?.score ? Math.round(pendingShot.score.score * 100) : null;

  const guideLineCells = useMemo(() => {
    if (!draftRect) {
      return [];
    }
    const indexes = new Set(lineCellsInRect(draftRect, shape.lineCells));
    return shape.lineCells.filter((cell) => indexes.has(cell.index));
  }, [draftRect, shape.lineCells]);

  const templatePoints = useMemo(() => {
    if (!draftRect) {
      return [];
    }
    return templatePointsInRect(shape.samples, draftRect, shape.definition.gridSize);
  }, [draftRect, shape.definition.gridSize, shape.samples]);

  /** Freeze geometry while reviewing so HUD resize does not move the aura/line. */
  const overlayViewSize = reviewing && pendingShot ? pendingShot.viewSize : viewSize;

  const layout = useMemo(() => {
    if (!overlayViewSize || !draftRect || overlayViewSize.width <= 0 || overlayViewSize.height <= 0) {
      return null;
    }
    return computeFitOverlayLayout(
      overlayViewSize.width,
      overlayViewSize.height,
      draftRect,
      shape.definition.gridSize,
    );
  }, [draftRect, overlayViewSize, shape.definition.gridSize]);

  const onShutter = async () => {
    if (capturing || reviewing || !draftRect) {
      return;
    }
    if (!cameraReady) {
      setErrorMessage('Camera not ready — wait a moment.');
      return;
    }
    if (guideLineCells.length === 0) {
      setErrorMessage('Outline missing from selection — go back and re-select the region.');
      throw new Error('Camera shutter blocked: guideLineCells empty with draftRect set');
    }
    if (templatePoints.length === 0) {
      setErrorMessage('Outline samples missing — go back and re-select the region.');
      throw new Error('Camera shutter blocked: templatePoints empty with draftRect set');
    }
    if (!layout) {
      setErrorMessage('Camera layout not ready — wait a moment and try again.');
      throw new Error('Camera shutter blocked: overlay layout null');
    }
    if (!viewSize) {
      setErrorMessage('Camera layout missing — retake after the outline appears.');
      return;
    }
    if (!cameraRef.current) {
      setErrorMessage('Camera not ready');
      return;
    }

    const viewWindow = layout.window;
    const captureId = `cap-${Date.now()}`;
    const shutterStartedAt = Date.now();

    setCapturing(true);
    setErrorMessage(null);
    captureBusyRef.current = true;
    setCaptureBusy(true);

    setPendingShot({
      captureId,
      uri: null,
      score: null,
      viewSize,
      viewWindow,
    });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: gameRules.storage.jpegQuality,
        skipProcessing: true,
        shutterSound: true,
      });
      const rawUri = photo?.uri;
      if (!rawUri) {
        throw new Error('Could not capture photo');
      }

      const stillPending = useHuntStore.getState().pendingShot;
      if (!stillPending || stillPending.captureId !== captureId) {
        return;
      }

      // Snappy freeze: show raw frame, then swap to EXIF-baked URI before score.
      setPendingShot({
        captureId,
        uri: rawUri,
        score: null,
        viewSize,
        viewWindow,
      });

      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCapturing(false);
      setCameraReady(false);

      const normalized = await normalizeCaptureUri(rawUri);
      const uri = normalized.uri;

      const afterNormalize = useHuntStore.getState().pendingShot;
      if (!afterNormalize || afterNormalize.captureId !== captureId) {
        return;
      }
      setPendingShot({
        captureId,
        uri,
        score: null,
        viewSize,
        viewWindow,
      });

      const gray = await loadGrayImage(uri, gameRules.scoring.downscaleWidth);
      const score = scoreMatch({
        image: gray,
        templatePoints,
        viewWindow,
        viewSize,
      });

      const shutterMs = Date.now() - shutterStartedAt;
      const pending = useHuntStore.getState().pendingShot;
      if (!pending || pending.captureId !== captureId) {
        return;
      }

      setPendingShot({
        captureId,
        uri,
        score,
        viewSize,
        viewWindow,
      });

      // #region agent log
      const proof = {
        mountId: mountIdRef.current,
        cameraReady,
        isFocused,
        lifecycleRecent: lifecycleLog.slice(-12),
        skipProcessing: true,
        alwaysNormalize: true,
        shutterMs,
        photoNativePre: { w: photo.width, h: photo.height },
        photoNativePost: { w: normalized.width, h: normalized.height },
        skiaSource: { w: gray.sourceWidth, h: gray.sourceHeight },
        gray: { w: gray.width, h: gray.height },
        viewSize,
        dimsAgree:
          normalized.width === gray.sourceWidth && normalized.height === gray.sourceHeight,
        aspectClass: {
          photoPortraitPre: photo.height >= photo.width,
          photoPortraitPost: normalized.height >= normalized.width,
          skiaPortrait: gray.sourceHeight >= gray.sourceWidth,
          viewPortrait: viewSize.height >= viewSize.width,
        },
        scoreNormal: {
          score: score.score,
          rawHits: score.debug.rawHits,
          rawHitRate: score.debug.rawHitRate,
          shiftX: score.debug.shiftX,
          shiftY: score.debug.shiftY,
        },
      };
      fetch('http://127.0.0.1:7482/ingest/607d09ba-1f8f-4fdb-91b5-28274c52e0a7', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '4b16c8',
        },
        body: JSON.stringify({
          sessionId: '4b16c8',
          runId: 'proof',
          hypothesisId: 'PROOF-shutter',
          location: 'camera.tsx:onShutter',
          message: 'capture proof bundle (in-place review)',
          data: proof,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      console.log(`CAPTURE_PROOF_JSON=${JSON.stringify(proof)}`);
      console.log(`SHUTTER_MS=${shutterMs}`);
      // #endregion

      const captureLog = buildScoreMatchCaptureLog({
        draftRect,
        guideLineCellCount: guideLineCells.length,
        score,
      });
      console.log(`SCORE_MATCH_DEBUG_JSON=${JSON.stringify(captureLog)}`);

      const runDebug = async () => {
        await postScoreDebugCapture({
          runId: 'proof-capture',
          hypothesisId: 'PROOF-shutter',
          message: 'proof capture with gray',
          gray,
          photoUri: uri,
          data: {
            ...captureLog,
            ...proof,
            templatePointCount: templatePoints.length,
            nextFix: captureLog.nextFix,
          },
        });
      };
      runDebug().catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scoring failed';
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCapturing(false);
      setCameraReady(false);
      const pending = useHuntStore.getState().pendingShot;
      if (pending?.captureId === captureId) {
        setStatusMessage(message);
        return;
      }
      setErrorMessage(message);
    }
  };

  const onRetake = () => {
    setPendingShot(null);
    setErrorMessage(null);
    setCameraReady(false);
  };

  const onKeep = async () => {
    if (reviewBusy || keeping || !pendingShot) {
      return;
    }
    setKeeping(true);
    try {
      const gridSize = shape.definition.gridSize;
      const ok = await keepPhoto({
        lineCellIndexes,
        gridSize,
      });
      if (!ok) {
        return;
      }
      const lockedCount = useHuntStore.getState().lockedCells.length;
      if (isHuntComplete(lockedCount, gridSize)) {
        if (router.canDismiss()) {
          router.dismissTo('/complete');
        } else {
          router.replace('/complete');
        }
        return;
      }
      if (router.canDismiss()) {
        router.dismissTo('/');
      } else {
        router.replace('/');
      }
    } finally {
      setKeeping(false);
    }
  };

  if (!draftRect) {
    return (
      <View
        className="flex-1 bg-background justify-center px-6 gap-4"
        style={{ paddingTop: insets.top }}
      >
        <Text
          className="text-3xl text-foreground leading-none"
          style={{ fontFamily: 'Anton-Regular' }}
        >
          Select a region first
        </Text>
        <Button size="lg" onPress={() => router.replace('/select')}>
          <Button.Label>Go to select</Button.Label>
        </Button>
      </View>
    );
  }

  if (permission && !permission.granted) {
    return (
      <View
        className="flex-1 bg-background justify-center px-6 gap-4"
        style={{ paddingTop: insets.top }}
      >
        <Text
          className="text-3xl text-foreground leading-none"
          style={{ fontFamily: 'Anton-Regular' }}
        >
          Camera access
        </Text>
        <Text className="text-muted text-base leading-6">
          Outsee needs the camera so you can photograph real-world edges that match today’s
          outline. Photos are taken live — nothing is chosen from your camera roll.
        </Text>
        <Button size="lg" onPress={requestPermission}>
          <Button.Label>Allow camera</Button.Label>
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          <Button.Label>Back</Button.Label>
        </Button>
      </View>
    );
  }

  const showLiveCamera =
    permission?.granted &&
    (isFocused || captureBusy) &&
    (!reviewing || reviewCapturing || captureBusy);

  const reviewHeadline = reviewCapturing
    ? 'Capturing…'
    : reviewScoring
      ? 'Scoring…'
      : `${scorePct}% line overlap`;

  const reviewMuted = reviewCapturing
    ? 'Locking the frame'
    : reviewScoring
      ? 'Computing overlap'
      : 'Tap Keep to lock this claim';

  const FRAME_PAD = 16;
  const ACTIONS_MIN_H = 88;
  const dockPadBottom = Math.max(insets.bottom, FRAME_PAD);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View
        className="flex-1"
        style={{
          paddingTop: FRAME_PAD,
          paddingLeft: FRAME_PAD,
          paddingRight: FRAME_PAD,
          paddingBottom: FRAME_PAD,
        }}
      >
        <View
          className="bg-black overflow-hidden flex-1 self-stretch"
          onLayout={(event) => {
            if (reviewing) {
              return;
            }
            const { width, height } = event.nativeEvent.layout;
            if (width <= 0 || height <= 0) {
              return;
            }
            setViewSize((prev) =>
              prev && prev.width === width && prev.height === height ? prev : { width, height },
            );
          }}
        >
          {showLiveCamera ? (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              mode="picture"
              onCameraReady={() => {
                mountCounter += 1;
                mountIdRef.current = mountCounter;
                setCameraReady(true);
                pushLifecycle('cameraReady', mountIdRef.current);
              }}
            />
          ) : null}

          {pendingShot?.uri ? (
            <Image source={{ uri: pendingShot.uri }} style={styles.camera} contentFit="cover" />
          ) : null}

          {layout ? (
            <View style={styles.overlay} pointerEvents="none" collapsable={false}>
              <CameraFitOverlay
                shape={shape}
                layout={layout}
                window={pendingShot?.viewWindow ?? layout.window}
                draftRect={draftRect}
                guideLineCells={guideLineCells}
              />
            </View>
          ) : !reviewing ? (
            <View style={styles.overlay} pointerEvents="none" collapsable={false}>
              <Text className="text-danger font-medium text-sm m-4">Waiting for camera layout…</Text>
            </View>
          ) : null}

          {reviewBusy ? (
            <View style={styles.scoringScrim} pointerEvents="none">
              <Spinner size="lg" color="default" />
            </View>
          ) : null}
        </View>
      </View>

      <Surface
        className="gap-3 px-4 pt-3 rounded-none"
        style={{ paddingBottom: dockPadBottom }}
      >
        <View className="gap-1.5">
          <View className="min-h-9 justify-center">
            {reviewing ? null : (
              <Button variant="ghost" size="sm" className="self-start" onPress={() => router.back()}>
                <Button.Label>Back</Button.Label>
              </Button>
            )}
          </View>
          <View className="flex-row items-center gap-2.5 min-h-[26px]">
            {reviewing && reviewBusy ? <Spinner size="sm" color="default" /> : null}
            <Text
              className="text-xl text-foreground leading-none"
              style={{ fontFamily: 'Anton-Regular' }}
            >
              {reviewing ? reviewHeadline : 'Align the outline, then shoot'}
            </Text>
          </View>
          <Text className="text-muted text-sm">
            {reviewing ? reviewMuted : 'Match the lime outline in the world.'}
          </Text>
          <View className="min-h-5 justify-center">
            {(reviewing ? statusMessage : errorMessage) ? (
              <Text className="text-danger font-medium text-sm">
                {reviewing ? statusMessage : errorMessage}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          className="flex-row items-center justify-center gap-3"
          style={{ minHeight: ACTIONS_MIN_H }}
        >
          {reviewing ? (
            <>
              <Button className="flex-1" variant="outline" onPress={onRetake}>
                <Button.Label>Retake</Button.Label>
              </Button>
              <Button className="flex-1" isDisabled={reviewBusy || keeping} onPress={onKeep}>
                <Button.Label>Keep</Button.Label>
              </Button>
            </>
          ) : (
            <Pressable
              className={`size-[76px] rounded-full border-[3px] border-foreground items-center justify-center ${
                capturing || !cameraReady ? 'opacity-50' : ''
              }`}
              onPress={onShutter}
              disabled={capturing || !cameraReady}
              accessibilityLabel="Shutter"
            >
              <View className="size-[58px] rounded-full bg-accent" />
            </Pressable>
          )}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
    elevation: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  scoringScrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 11,
    elevation: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
