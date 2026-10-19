import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alignCaptureToPreviewAspect } from '@/camera/alignCaptureToPreviewAspect';
import { CameraFitOverlay } from '@/camera/CameraFitOverlay';
import { postScoreDebugCapture } from '@/camera/debugCaptureLog';
import { loadGrayImage } from '@/camera/loadGrayImage';
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
import { useHuntStore } from '@/store/huntStore';
import { colors } from '@/theme/colors';

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isFocused, setIsFocused] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  const shape = useMemo(() => buildShape(pawnShape), []);
  const draftRect = useHuntStore((state) => state.draftRect);
  const setPendingShot = useHuntStore((state) => state.setPendingShot);

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

  const layout = useMemo(() => {
    if (!viewSize || !draftRect || viewSize.width <= 0 || viewSize.height <= 0) {
      return null;
    }
    return computeFitOverlayLayout(
      viewSize.width,
      viewSize.height,
      draftRect,
      shape.definition.gridSize,
    );
  }, [draftRect, shape.definition.gridSize, viewSize]);

  const onShutter = async () => {
    if (capturing || !draftRect) {
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
    setCapturing(true);
    setErrorMessage(null);
    try {
      if (!cameraRef.current) {
        setErrorMessage('Camera not ready');
        return;
      }
      const photo = await cameraRef.current.takePictureAsync({
        quality: gameRules.storage.jpegQuality,
        skipProcessing: false,
      });
      const rawUri = photo?.uri;
      if (!rawUri) {
        setErrorMessage('Could not capture photo');
        return;
      }

      const viewWindow = layout.window;
      if (!viewSize) {
        setErrorMessage('Camera layout missing — retake after the outline appears.');
        throw new Error('Shutter blocked: viewSize missing for claim crop');
      }

      // Sensor is landscape; preview is portrait. Expo sometimes forgets to bake
      // the 90° — only then we rotate so the file matches the viewfinder.
      const aligned = await alignCaptureToPreviewAspect({
        uri: rawUri,
        photoWidth: photo.width,
        photoHeight: photo.height,
        viewWidth: viewSize.width,
        viewHeight: viewSize.height,
      });
      const uri = aligned.uri;

      const gray = await loadGrayImage(uri, gameRules.scoring.downscaleWidth);
      const score = scoreMatch({
        image: gray,
        templatePoints,
        viewWindow,
        viewSize,
      });

      // #region agent log
      const scoreProbe = {
        score: score.score,
        passed: score.passed,
        rawSimilarity: score.debug.rawSimilarity,
        accidentalSimilarity: score.debug.accidentalSimilarity,
        surplus: score.debug.rawSimilarity - score.debug.accidentalSimilarity,
        rawHits: score.debug.rawHits,
        rawHitRate: score.debug.rawHitRate,
        shiftX: score.debug.shiftX,
        shiftY: score.debug.shiftY,
        nullPercentileScore: score.nullPercentileScore,
        diagnosis: score.debug.diagnosis,
        photoNative: { w: photo.width, h: photo.height },
        photoAligned: { w: gray.width, h: gray.height, rotatedDegrees: aligned.rotatedDegrees },
        gray: { w: gray.width, h: gray.height },
      };
      fetch('http://127.0.0.1:7482/ingest/607d09ba-1f8f-4fdb-91b5-28274c52e0a7', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '4b16c8',
        },
        body: JSON.stringify({
          sessionId: '4b16c8',
          runId: 'post-fix',
          hypothesisId: 'I-hires-ocm',
          location: 'camera.tsx:onShutter',
          message: 'score with 256px edge map, no free %',
          data: scoreProbe,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      console.log(`SCORE_PROBE_JSON=${JSON.stringify(scoreProbe)}`);
      // #endregion

      const captureLog = buildScoreMatchCaptureLog({
        draftRect,
        guideLineCellCount: guideLineCells.length,
        score,
      });
      console.log(`SCORE_MATCH_DEBUG_JSON=${JSON.stringify(captureLog)}`);
      setPendingShot({ uri, score, viewSize, viewWindow });
      router.push('/result');
      // #region agent log
      await postScoreDebugCapture({
        runId: 'capture-hires',
        hypothesisId: 'I-hires-ocm',
        message: 'scoreMatch 256px edge map',
        gray,
        photoUri: uri,
        data: {
          ...captureLog,
          ...scoreProbe,
          templatePointCount: templatePoints.length,
          hypD_viewWindow: viewWindow,
          hypD_viewSize: viewSize,
          nextFix: captureLog.nextFix,
        },
      });
      // #endregion
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scoring failed';
      setErrorMessage(message);
    } finally {
      setCapturing(false);
    }
  };

  if (!draftRect) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permissionTitle}>Select a region first</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/select')}>
          <Text style={styles.primaryButtonText}>Go to select</Text>
        </Pressable>
      </View>
    );
  }

  if (permission && !permission.granted) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permissionTitle}>Camera access</Text>
        <Text style={styles.permissionBody}>
          Shape Hunt needs the camera so you can photograph real-world edges that match today’s
          outline. Photos are taken live — nothing is chosen from your camera roll.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) {
            return;
          }
          setViewSize((prev) =>
            prev && prev.width === width && prev.height === height ? prev : { width, height },
          );
        }}
      >
        {permission?.granted && isFocused ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="picture"
          />
        ) : null}

        {layout ? (
          <View style={styles.overlay} pointerEvents="none" collapsable={false}>
            <CameraFitOverlay
              shape={shape}
              layout={layout}
              window={layout.window}
              draftRect={draftRect}
              guideLineCells={guideLineCells}
            />
          </View>
        ) : (
          <View style={styles.overlay} pointerEvents="none" collapsable={false}>
            <Text style={styles.status}>Waiting for camera layout…</Text>
          </View>
        )}
      </View>

      <View style={[styles.hud, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.chipButton} onPress={() => router.back()}>
            <Text style={styles.chipText}>Back</Text>
          </Pressable>
          <Text style={styles.counter}>Align the outline, then shoot</Text>
          <Text style={styles.counterMuted}>{guideLineCells.length} line cells in selection</Text>
        </View>

        {errorMessage ? <Text style={styles.status}>{errorMessage}</Text> : null}

        <View style={styles.controls}>
          <View style={styles.spacer} />
          <Pressable
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            onPress={onShutter}
            disabled={capturing}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.spacer} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  stage: {
    flex: 1,
    backgroundColor: '#000',
  },
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
  hud: {
    backgroundColor: colors.card,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  topBar: {
    gap: 6,
  },
  chipButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.accent,
    fontSize: 16,
  },
  counter: {
    fontFamily: 'DMSans_700Bold',
    color: colors.text,
    fontSize: 18,
  },
  counterMuted: {
    fontFamily: 'DMSans_400Regular',
    color: colors.textMuted,
    fontSize: 14,
  },
  status: {
    fontFamily: 'DMSans_500Medium',
    color: colors.photo.coral,
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 88,
  },
  spacer: {
    width: 88,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
  },
  permissionTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    color: colors.text,
  },
  permissionBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontFamily: 'DMSans_700Bold',
    color: colors.background,
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.textMuted,
    fontSize: 16,
  },
});
