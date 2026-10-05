/** Palette from Screens/Release3/Dictation; shared by every Paper Warp surface. */
export const PAPER_WARP_PRESET = {
  colors: ['#231c2c', '#ad867e', '#ebc8a6', '#c4adf0'],
  proportion: 0.24,
  softness: 1,
  distortion: 0.21,
  swirl: 0.57,
  swirlIterations: 10,
  shape: 'edge' as const,
  shapeScale: 0.75,
  scale: 2,
  rotation: 0,
}

export const WARP_SPEED = {
  resting: 0.225,
  // Half the previous increase from resting to 2.1.
  running: 0.225 + (2.1 - 0.225) / 2,
}
