// Adapted from T3 Code (MIT). See THIRD_PARTY_NOTICES.md.
import {
  animalArtworks,
  animalNoise,
  type AnimalColor,
  type AnimalInk,
  type AnimalPen,
  type AnimalPose,
} from "./animalArtwork";
import type { InterfaceScene } from "../../lib/interfaceTheme";

interface AnimalSceneFrame {
  readonly sceneId: InterfaceScene;
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly appearance: "dark" | "light";
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const wakeColors: Record<InterfaceScene, string> = { fox: "#fa8744", manta: "#69e8d4" };

function wrap(value: number, size: number) {
  return value - size * Math.floor(value / size);
}

const palette = new Map<number, string>();

function cellColor([red, green, blue]: AnimalColor, light: number) {
  const shade = clamp(Math.round(light * 12), 2, 17);
  const key = ((red * 256 + green) * 256 + blue) * 18 + shade;
  const existing = palette.get(key);
  if (existing !== undefined) return existing;
  const scale = shade / 12;
  const color = `rgb(${Math.min(255, Math.round(red * scale))}, ${Math.min(255, Math.round(green * scale))}, ${Math.min(255, Math.round(blue * scale))})`;
  palette.set(key, color);
  return color;
}

function createAnimalPen(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  appearance: AnimalSceneFrame["appearance"],
): AnimalPen {
  const cellWidth = clamp(Math.round(width / 148), 3, 6);
  const cellHeight = Math.round(cellWidth * 1.43);
  const lightMode = appearance === "light";
  const columns = Math.ceil(width / cellWidth);
  const rows = Math.ceil(height / cellHeight);
  const ink: AnimalInk = { color: [0, 0, 0], light: 1, glyphs: ".", dark: false };
  context.font = `${cellHeight - 1}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  function paintCell(
    column: number,
    row: number,
    color: AnimalColor,
    light: number,
    glyph: string,
    dark: boolean,
    foreground?: AnimalColor,
  ) {
    const x = column * cellWidth;
    const y = row * cellHeight;
    context.fillStyle = cellColor(color, light * (lightMode && !dark ? 0.8 : 1));
    context.globalAlpha = dark ? 0.92 : lightMode ? 0.71 : 0.79;
    context.fillRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
    context.fillStyle = foreground
      ? cellColor(foreground, 1)
      : dark || lightMode
        ? "#fff7ed"
        : "#0c101a";
    context.globalAlpha = dark ? 0.5 : 0.88;
    context.fillText(glyph, x + cellWidth / 2, y + cellHeight / 2 + 0.25);
  }

  return {
    cellWidth,
    cellHeight,
    shape(pose, extent, sample) {
      const radius = pose.span * extent;
      const left = Math.max(0, Math.floor((pose.x - radius) / cellWidth));
      const right = Math.min(columns, Math.ceil((pose.x + radius) / cellWidth));
      const top = Math.max(0, Math.floor((pose.y - radius) / cellHeight));
      const bottom = Math.min(rows, Math.ceil((pose.y + radius) / cellHeight));
      const cosine = Math.cos(pose.heading) / pose.span;
      const sine = Math.sin(pose.heading) / pose.span;
      for (let row = top; row < bottom; row++) {
        const dy = (row + 0.5) * cellHeight - pose.y;
        for (let column = left; column < right; column++) {
          const dx = (column + 0.5) * cellWidth - pose.x;
          const x = dx * cosine + dy * sine;
          const y = dy * cosine - dx * sine;
          if (!sample(x, y, ink)) continue;
          const grain = animalNoise(Math.round(x * 48), Math.round(y * 48), pose.id);
          const glyph = ink.glyphs.charAt(Math.floor(grain * ink.glyphs.length));
          paintCell(column, row, ink.color, ink.light, glyph, ink.dark);
        }
      }
    },
    accent(pose, x, y, glyph, color, fill) {
      const cosine = Math.cos(pose.heading) * pose.span;
      const sine = Math.sin(pose.heading) * pose.span;
      const column = Math.floor((pose.x + x * cosine - y * sine) / cellWidth);
      const row = Math.floor((pose.y + x * sine + y * cosine) / cellHeight);
      paintCell(column, row, fill, 1, glyph, true, color);
    },
  };
}

export function paintAnimalScene(context: CanvasRenderingContext2D, frame: AnimalSceneFrame) {
  const { sceneId, width, height, time, appearance } = frame;
  if (width <= 0 || height <= 0) return;
  context.clearRect(0, 0, width, height);
  context.save();
  const pen = createAnimalPen(context, width, height, appearance);
  const artwork = animalArtworks[sceneId];
  const swatch = wakeColors[sceneId];
  const foxes = sceneId === "fox";
  const columns = foxes ? clamp(Math.round(width / 210), 2, 3) : width < 940 ? 2 : 3;
  const count = foxes ? columns * 2 : clamp(Math.round(width / 260), 1, 4);
  const rows = Math.ceil(count / columns);
  const baseSpan = clamp(Math.min(width, height) * (foxes ? 0.31 : 0.39) * artwork.scale, 45, 156);
  const margin = baseSpan * 0.95;
  const flightWidth = width + 2 * margin;
  const flightHeight = height + 2 * margin;
  for (let id = 0; id < count; id++) {
    const span = baseSpan * (0.72 + 0.37 * animalNoise(id, 78, 12));
    const column = id % columns;
    const row = Math.floor(id / columns);
    const startX = (width * (column + 0.2 + 0.6 * animalNoise(id, 6, 26))) / Math.min(count, columns);
    const laneNoise = animalNoise(id, 3, 60);
    const startY = (height * (row + (foxes ? 0.32 + 0.33 * laneNoise : 0.18 + 0.64 * laneNoise))) / rows;
    const course = foxes ? -0.19 + 0.26 * animalNoise(id, 45, 12) : -0.57 + 0.35 * animalNoise(id, 45, 12);
    const distance = time * artwork.speed * (0.36 + 0.16 * animalNoise(id, 3, 78));
    const sway = 0.16 * Math.sin(time * 0.7 + id * 2.2);
    const x = wrap(margin + startX + Math.cos(course) * distance, flightWidth) - margin;
    // In a shallow frame foxes trot along two lanes instead of leaving over the top together.
    const y = foxes
      ? startY + Math.min(18, height / 12) * Math.sin(time * 0.8 + id * 2.2)
      : wrap(margin + startY + Math.sin(course) * distance + sway * span * 0.25, flightHeight) - margin;
    if (x < -span || x > width + span || y < -span || y > height + span) continue;
    const heading = course + sway;
    const pose: AnimalPose = { id, x, y, span, heading, light: 1.06 };
    const phase =
      (artwork.strideLength
        ? (tau * distance) / (span * artwork.strideLength)
        : time * (artwork.cadence ?? 5) * (0.8 + animalNoise(id, 87, 4) * 0.26)) +
      tau * animalNoise(id, 11, 59);

    context.fillStyle = swatch;
    for (let index = 0; index < 5; index++) {
      const distance = span * (0.53 + index * 0.052);
      const drift = Math.sin(phase * 0.43 - index + id) * pen.cellHeight;
      const wakeX = x - Math.cos(heading) * distance;
      const wakeY = y - Math.sin(heading) * distance + drift;
      context.globalAlpha = (appearance === "dark" ? 0.46 : 0.65) * (1 - index * 0.17);
      context.fillText(
        index % 3 === 0 ? ":" : ".",
        (Math.floor(wakeX / pen.cellWidth) + 0.5) * pen.cellWidth,
        (Math.floor(wakeY / pen.cellHeight) + 0.5) * pen.cellHeight,
      );
    }

    artwork.draw(pen, pose, phase);
  }
  context.restore();
}
