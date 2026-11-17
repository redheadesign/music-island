type Rgb = readonly [red: number, green: number, blue: number]

export interface ArtworkPalette {
  primary: Rgb
  secondary: Rgb
}

interface ColorBucket {
  red: number
  green: number
  blue: number
  count: number
  score: number
}

function average(bucket: ColorBucket): Rgb {
  return [
    Math.round(bucket.red / bucket.count),
    Math.round(bucket.green / bucket.count),
    Math.round(bucket.blue / bucket.count),
  ]
}

/** Select cover colors at their original intensity. Surfaces decide how to tint them. */
export function selectArtworkPalette(data: Uint8ClampedArray): ArtworkPalette | null {
  const buckets = new Map<number, ColorBucket>()

  for (let index = 0; index + 3 < data.length; index += 4) {
    if (data[index + 3] < 180) continue
    const [red, green, blue] = [data[index], data[index + 1], data[index + 2]]
    const brightest = Math.max(red, green, blue)
    const chroma = brightest - Math.min(red, green, blue)
    if (brightest < 32 || chroma < 18 || (red + green + blue) / 3 > 240) continue

    const key = (red >> 5) * 64 + (green >> 5) * 8 + (blue >> 5)
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0, score: 0 }
    bucket.red += red
    bucket.green += green
    bucket.blue += blue
    bucket.count += 1
    bucket.score += 32 + chroma / 4
    buckets.set(key, bucket)
  }

  const ranked = [...buckets.values()].sort((left, right) => right.score - left.score)
  const dominant = ranked[0]
  if (!dominant) return null

  const primary = average(dominant)
  for (const candidate of ranked.slice(1)) {
    if (candidate.score < dominant.score / 4) break
    const secondary = average(candidate)
    const distance = Math.hypot(secondary[0] - primary[0], secondary[1] - primary[1], secondary[2] - primary[2])
    if (distance >= 48) return { primary, secondary }
  }
  return { primary, secondary: primary }
}

export async function readArtworkPalette(dataUrl: string): Promise<ArtworkPalette | null> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = dataUrl
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return selectArtworkPalette(context.getImageData(0, 0, canvas.width, canvas.height).data)
}

export function artworkCssColors(palette: ArtworkPalette | null, glass: boolean) {
  if (!palette) return { primary: '26, 30, 40', secondary: '10, 12, 18' }
  if (glass) return { primary: palette.primary.join(', '), secondary: palette.secondary.join(', ') }

  // Classic uses the cover as a dark background rather than a foreground accent.
  const classicTone = (strength: number) => palette.primary.map(channel => Math.round(channel * strength)).join(', ')
  return { primary: classicTone(0.72), secondary: classicTone(0.32) }
}
