// Adapted from T3 Code (MIT). See THIRD_PARTY_NOTICES.md.

export type AnimalColor = readonly [red: number, green: number, blue: number];

export interface AnimalPose {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly span: number;
  readonly heading: number;
  readonly light: number;
}

export interface AnimalInk {
  color: AnimalColor;
  light: number;
  glyphs: string;
  dark: boolean;
}

export interface AnimalPen {
  readonly cellWidth: number;
  readonly cellHeight: number;
  shape(
    pose: AnimalPose,
    extent: number,
    sample: (x: number, y: number, ink: AnimalInk) => boolean,
  ): void;
  accent(
    pose: AnimalPose,
    x: number,
    y: number,
    glyph: string,
    color: AnimalColor,
    fill: AnimalColor,
  ): void;
}

type Texture = keyof typeof glyphsBySurface;
type Tone = AnimalColor | ((x: number, y: number) => AnimalColor);
type Point = readonly [x: number, y: number];

interface Layer {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly tone: Tone;
  readonly texture: Texture;
  coverage(x: number, y: number): number;
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const fract = (value: number) => value - Math.floor(value);
const mix = (from: number, to: number, fraction: number) => from + (to - from) * fraction;

export function animalNoise(x: number, y: number, seed: number): number {
  let sample = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  sample = Math.imul(sample ^ (sample >>> 13), 1274126177);
  return ((sample ^ (sample >>> 16)) >>> 0) / 4294967296;
}

function ell(
  x: number,
  y: number,
  rx: number,
  ry: number,
  tone: Tone,
  texture: Texture = "fur",
): Layer {
  return {
    left: x - rx,
    right: x + rx,
    top: y - ry,
    bottom: y + ry,
    tone,
    texture,
    coverage: (u, v) => ((u - x) / rx) ** 2 + ((v - y) / ry) ** 2,
  };
}

function taperedLine(
  x: number,
  y: number,
  endX: number,
  endY: number,
  startWidth: number,
  endWidth: number,
  tone: Tone,
  texture: Texture = "fur",
): Layer {
  const dx = endX - x;
  const dy = endY - y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const pad = Math.max(startWidth, endWidth);
  return {
    left: Math.min(x, endX) - pad,
    right: Math.max(x, endX) + pad,
    top: Math.min(y, endY) - pad,
    bottom: Math.max(y, endY) + pad,
    tone,
    texture,
    coverage(u, v) {
      const progress = clamp(((u - x) * dx + (v - y) * dy) / lengthSquared, 0, 1);
      const width = mix(startWidth, endWidth, progress);
      return ((u - x - dx * progress) ** 2 + (v - y - dy * progress) ** 2) / (width * width);
    },
  };
}

function polygon(vertices: readonly Point[], tone: Tone, texture: Texture = "fur"): Layer {
  const columns = vertices.map(([x]) => x);
  const rows = vertices.map(([, y]) => y);
  return {
    left: Math.min(...columns),
    right: Math.max(...columns),
    top: Math.min(...rows),
    bottom: Math.max(...rows),
    tone,
    texture,
    coverage(x, y) {
      let inside = false;
      for (let i = 0, previous = vertices.length - 1; i < vertices.length; previous = i++) {
        const [ax, ay] = vertices[previous]!;
        const [bx, by] = vertices[i]!;
        if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) {
          inside = !inside;
        }
      }
      return inside ? 0.45 : 2;
    },
  };
}

const glyphsBySurface = {
  fur: ".:;irsx%#",
  long: "'/;i//:",
  dark: "#%@",
};

function paintLayers(pen: AnimalPen, pose: AnimalPose, layers: readonly Layer[], extent: number) {
  const scale = pose.span / pen.cellWidth;
  pen.shape(pose, extent, (x, y, ink) => {
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index]!;
      if (x < layer.left || x > layer.right || y < layer.top || y > layer.bottom) continue;
      const edge = layer.coverage(x, y);
      if (edge > 1) continue;
      const texture = (Math.sin(x * 97 + y * 117) + Math.sin(x * 329 - y * 181)) * 0.035;
      const grain = (animalNoise(x * scale * 1.4, y * scale * 1.4, pose.id) - 0.5) * 0.16;
      ink.color = typeof layer.tone === "function" ? layer.tone(x, y) : layer.tone;
      ink.light = (0.86 + texture + grain - 0.16 * edge - y * 0.3) * pose.light;
      ink.glyphs = glyphsBySurface[layer.texture];
      ink.dark = layer.texture === "dark";
      return true;
    }
    return false;
  });
}

const foxTrot = { stride: 0.56, support: 0.53, frontReach: 0.295, track: 0.063 };
const foxCoat = {
  spine: [232, 143, 73],
  copper: [219, 114, 58],
  russet: [179, 83, 50],
  flank: [135, 67, 47],
  undercoat: [230, 169, 114],
  cream: [255, 230, 190],
  face: [248, 150, 74],
  ear: [242, 142, 76],
  earShade: [107, 62, 56],
  brush: [187, 91, 52],
  brushShade: [145, 67, 46],
  stocking: [96, 70, 67],
  ink: [33, 25, 30],
} as const;

function foxFur(x: number, y: number): AnimalColor {
  const strands = Math.sin(x * 96 - Math.abs(y) * 158) + 0.43 * Math.sin(x * 59 + y * 83);
  if (Math.abs(y) > 0.098 + strands * 0.008) return foxCoat.flank;
  if (Math.abs(y) > 0.072 + strands * 0.012) return foxCoat.russet;
  if (Math.abs(y) < 0.035 && strands > 0.2) return foxCoat.spine;
  return foxCoat.copper;
}

function foxTailFur(x: number, y: number): AnimalColor {
  const strands = Math.sin(x * 57 + y * 72);
  if (x < -0.605 + strands * 0.012) return strands > -0.43 ? foxCoat.cream : foxCoat.undercoat;
  if (x > -0.403 || strands < -0.57) return foxCoat.brushShade;
  return foxCoat.brush;
}

function sampleFoxFoot(cycle: number, side: number, hind: boolean) {
  const { stride, support, frontReach, track } = foxTrot;
  const phase = fract(cycle + (side > 0 !== hind ? 0.5 : 0));
  const swing = clamp((phase - support) / (1 - support), 0, 1);
  const lift = Math.sin(Math.PI * swing) ** 2;
  const touchdown = frontReach - (hind ? stride / 2 : 0);
  // Subtracting phase holds the paw in place during the supported part of the stride.
  const x = touchdown + stride * (swing * swing * (3 - 2 * swing) - phase);
  return { x, y: side * (track + lift * 0.015), lift };
}

function foxLegLayers(
  foot: ReturnType<typeof sampleFoxFoot>,
  side: number,
  hind: boolean,
  sway: number,
) {
  const jointX = hind ? -0.225 : 0.127;
  const jointY = side * (hind ? 0.049 : 0.055) + sway;
  const bendX = mix(jointX, foot.x, 0.44) + (hind ? 0.042 : -0.044) * (1 + foot.lift * 0.43);
  const bendY = mix(jointY, foot.y, 0.62) + side * 0.016 * foot.lift;
  const toes = hind ? 0.019 : 0.024;
  return [
    taperedLine(jointX, jointY, bendX, bendY, hind ? 0.04 : 0.033, 0.024, foxCoat.russet, "long"),
    taperedLine(bendX, bendY, foot.x, foot.y, 0.024, 0.015, foxCoat.stocking, "long"),
    ell(foot.x + 0.008, foot.y, toes, 0.017, foxCoat.stocking, "dark"),
  ];
}

function foxTailLayers(pose: AnimalPose, phase: number, hipShift: number) {
  const side = pose.id % 2 ? 1 : -1;
  const outline = [
    [-0.284, 0.0, 0.039],
    [-0.378, 0.021, 0.044],
    [-0.481, 0.067, 0.09],
    [-0.558, 0.11, 0.119],
    [-0.638, 0.129, 0.109],
    [-0.712, 0.129, 0.07],
    [-0.782, 0.097, 0.01],
  ] as const;
  const center = (index: number) => {
    const along = index / (outline.length - 1);
    return hipShift + side * outline[index]![1] + 0.052 * along * Math.sin(phase - along * 2.35);
  };
  return outline.slice(1).map(([endX, , endWidth], index) => {
    const [x, , startWidth] = outline[index]!;
    return taperedLine(x, center(index), endX, center(index + 1), startWidth, endWidth, foxTailFur);
  });
}

function drawFox(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const cycle = phase / tau;
  const shoulderShift = 0.015 * Math.sin(phase);
  const hipShift = -0.013 * Math.sin(phase - 0.21);
  const reach = 0.015 * Math.cos(phase * 2 - 0.35);
  const headShift = shoulderShift * 0.62;
  const layers = foxTailLayers(pose, phase, hipShift);
  for (const side of [-1, 1]) {
    layers.push(
      ...foxLegLayers(sampleFoxFoot(cycle, side, true), side, true, hipShift),
      ...foxLegLayers(sampleFoxFoot(cycle, side, false), side, false, shoulderShift),
    );
  }
  layers.push(
    ell(-0.219 - reach, hipShift, 0.111, 0.113, foxFur),
    taperedLine(-0.17 - reach, hipShift, 0.055 + reach, shoulderShift, 0.087, 0.096, foxFur),
    ell(0.043 + reach, shoulderShift, 0.114, 0.126, foxFur),
    taperedLine(0.109, shoulderShift, 0.22 + reach, headShift, 0.077, 0.047, foxCoat.russet),
  );

  const headLength = 0.9,
    headWidth = 0.86;
  const neck = 0.22;
  const head = (x: number, y: number): Point => [
    neck + reach + (x - neck) * headLength,
    headShift + y * headWidth,
  ];
  layers.push(
    polygon(
      [
        head(0.197, -0.076),
        head(0.25, -0.135),
        head(0.337, -0.142),
        head(0.42, -0.083),
        head(0.523, -0.019),
        head(0.523, 0.019),
        head(0.42, 0.083),
        head(0.337, 0.142),
        head(0.25, 0.135),
        head(0.197, 0.076),
      ],
      foxCoat.face,
    ),
  );
  for (const side of [-1, 1]) {
    const point = (x: number, y: number) => head(x, y * side);
    layers.push(
      polygon(
        [
          point(0.19, 0.081),
          point(0.182, 0.213),
          point(0.202, 0.241),
          point(0.23, 0.219),
          point(0.338, 0.129),
        ],
        foxCoat.ear,
      ),
      polygon([point(0.221, 0.112), point(0.22, 0.197), point(0.302, 0.133)], foxCoat.earShade),
      polygon(
        [
          point(0.273, 0.101),
          point(0.337, 0.138),
          point(0.423, 0.079),
          point(0.517, 0.023),
          point(0.438, 0.01),
          point(0.369, 0.034),
          point(0.316, 0.061),
        ],
        foxCoat.cream,
      ),
      ell(...point(0.387, 0.078), 0.028 * headLength, 0.025 * headWidth, foxCoat.ink, "dark"),
    );
  }
  layers.push(ell(...head(0.511, 0), 0.026 * headLength, 0.03 * headWidth, foxCoat.ink, "dark"));
  paintLayers(pen, pose, layers, 0.84);
  if (pose.span >= 18 * pen.cellWidth && pose.span >= 11 * pen.cellHeight) {
    for (const side of [-1, 1]) {
      pen.accent(pose, ...head(0.389, side * 0.077), ".", foxCoat.undercoat, foxCoat.ink);
    }
    pen.accent(pose, ...head(0.518, 0), ".", foxCoat.earShade, foxCoat.ink);
  }
}

export const foxArtwork = {
  speed: 112,
  scale: 1.43,
  strideLength: foxTrot.stride,
  draw: drawFox,
} as const;
