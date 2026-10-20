/** Skia / RN style tokens — keep in sync with daylight outdoor theme in global.css */
export const colors = {
  background: '#E4EBE4',
  card: '#F3F6F2',
  accent: '#6B7F3A',
  text: '#1C2A22',
  textMuted: '#5C6B62',
  /** Grid / outline contrast on light stages and camera. */
  grid: 'rgba(28, 42, 34, 0.28)',
  outline: '#6B7F3A',
  outlineHalo: 'rgba(28, 42, 34, 0.55)',
  photo: {
    coral: '#D4845C',
    sky: '#6A9BB8',
    lime: '#6B7F3A',
    violet: '#8B7AA8',
    gold: '#C4A05A',
  },
} as const;
