# Path-tracing offline results

## Method (in `src/shapeEngine/scoreMatch.ts`)

1. **Oriented Chamfer Matching** — distance transform of Sobel edges + orientation term  
   \(d = (1-\lambda)d_{dist} + \lambda d_{orient}\), similarity \(= 1 - d\) (partial keep 85%)
2. **Ordered-contour continuity** — soft weight from long coherent “good” runs
3. **NOCD-lite accidentalness** — same tangents, loci scrambled in a square pad; score crushed unless template clearly beats scramble

## Fixture gate

```bash
npx jest src/shapeEngine/chamferSphere.fixture.test.ts src/shapeEngine/shapeEngine.test.ts
```

**Last run: 16/16 passed** (sphere ≥0.90, blank ≤0.05, clutter ≤0.25, horizontal-edge sanity).

## Papers

- Olson & Huttenlocher TIP 1997 — oriented edges  
- Liu et al. CVPR 2010 — chamfer for hand-drawn templates  
- Latecki NOCD / BMVC Chamfer regularization — accidentalness vs clutter  
- Thayananthan CVPR 2003 — continuity in clutter  

## Not verified here

Real device lamp / TV / empty photos (no captures in this run).
