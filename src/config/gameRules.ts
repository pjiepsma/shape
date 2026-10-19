/**
 * Single tuning file for Shape Hunt game rules and scoring knobs.
 * Claim percentages are relative to the project grid (gridSize²).
 * Scoring: Oriented Chamfer Matching + accidentalness (NOCD-lite).
 */
export const gameRules = {
  gridSize: 20,

  /**
   * Outline bbox fills this fraction of the unit square (path + line cells).
   * ~0.9 keeps the shape close to the grid edge.
   */
  shapeFill: 0.9,

  /**
   * Select-screen inset from the stage edges (px). Keeps the grid clear of the
   * system back / edge gesture.
   */
  selectEdgeInsetPx: 36,

  /** Minimum fraction of project cells a photo may fill. */
  minClaimFraction: 0.1,

  /** Maximum fraction of project cells a photo may fill. */
  maxClaimFraction: 0.4,

  scoring: {
    /**
     * Target width of the grayscale edge map (px). Higher = finer distance
     * measuring along the outline (not the claim grid). 256 ≈ +33% samples
     * spatially vs 192.
     */
    downscaleWidth: 256,

    /**
     * Minimum Sobel magnitude to mark a scene edge pixel.
     * 0.08 dropped soft AF frames to 0 hits; 0.05 keeps soft-but-real edges.
     */
    edgeMagnitudeFloor: 0.05,

    /**
     * Chamfer distance clip τ (px on downscaled image).
     * Scaled with downscaleWidth (was 14 @ 192 ≈ same physical slack @ 256).
     */
    chamferTauPx: 18,

    /**
     * Orientation share of oriented distance (rest is edge distance).
     * Thick real edges (sunglasses) have noisy tangents; 0.45 made perfect
     * distance matches stall at ~91%. Distance-led λ keeps silhouette fidelity.
     */
    orientLambda: 0.22,

    /**
     * Use the best this fraction of template probes (partial Hausdorff spirit).
     * Drops the worst outliers / occlusion.
     */
    partialKeepFraction: 0.85,

    /** Outline shift search radius for shaky hands (px on downscaled image). */
    shiftSearchPx: 18,

    /** Step size for the shift search grid. */
    shiftSearchStep: 2,

    /**
     * NOCD-lite: if a simple normalizer curve scores this close to the template
     * at the same pose, treat the match as accidental clutter.
     */
    normalizerMargin: 0.12,

    /** Number of scrambled null-baseline probes. */
    nullBaselineCopies: 16,

    /** Real score must beat this percentile of the null probes. */
    nullBaselinePercentile: 0.9,

    /** Absolute floor to pass — silhouette must clearly follow the guide. */
    minPassScore: 0.5,

    /** Unused — scores are measured OCM only, no free percentage boost. */
    scoreLeniency: 0,

    /**
     * Kept for debug payload compatibility with older capture logs.
     * Not used by OCM (continuity is implicit in DT+partial).
     */
    minCoherentRun: 12,
    normalSearchPx: 5,
    orientToleranceRad: 0.45,
  },

  storage: {
    /** Uploaded photos are downscaled to this width before JPEG encode. */
    uploadMaxWidth: 1080,
    jpegQuality: 0.8,
  },
} as const;
