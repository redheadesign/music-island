/** Brand default — Music Island orange. */
export const DEFAULT_ACCENT = '#F76100'

const PRESET_ACCENTS = [
  '#F76100',
  '#b98916',
  '#548dec',
  '#28a39d',
  '#56a36b',
  '#9d7ae5',
  '#d8648d',
] as const

export const ACCENT_PRESETS: readonly string[] = PRESET_ACCENTS

export function normalizeHexColor(input: string, fallback = DEFAULT_ACCENT): string {
  const raw = input.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-f]{6})$/i.exec(raw)
  if (full) return `#${full[1]}`.toLowerCase()
  return fallback.toLowerCase()
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex)
  const match = /^#([0-9a-f]{6})$/i.exec(normalized)
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function mixToward(channel: number, target: number, amount: number): number {
  return clampByte(channel + (target - channel) * amount)
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Derive soft / strong / glow tokens from a primary accent. */
export function buildAccentTokens(hex: string) {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_ACCENT)!
  const soft = {
    r: mixToward(rgb.r, 255, 0.35),
    g: mixToward(rgb.g, 255, 0.35),
    b: mixToward(rgb.b, 255, 0.35),
  }
  const strong = {
    r: mixToward(rgb.r, 0, 0.18),
    g: mixToward(rgb.g, 0, 0.18),
    b: mixToward(rgb.b, 0, 0.18),
  }
  return {
    accent: normalizeHexColor(hex),
    accentSoft: toHex(soft),
    accentStrong: toHex(strong),
    accentRgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    accentSoftRgb: `${soft.r}, ${soft.g}, ${soft.b}`,
    accentGlow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.34)`,
    accentMuted: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`,
    accentInk: relativeLuminance(normalizeHexColor(hex)) > .179 ? '#000000' : '#ffffff',
  }
}

export function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex)!
  const linear = (value: number) => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
  return .2126 * linear(rgb.r) + .7152 * linear(rgb.g) + .0722 * linear(rgb.b)
}

export function applyAccentTheme(hex: string, target: HTMLElement = document.documentElement) {
  const tokens = buildAccentTokens(hex)
  target.style.setProperty('--accent', tokens.accent)
  target.style.setProperty('--accent-soft', tokens.accentSoft)
  target.style.setProperty('--accent-strong', tokens.accentStrong)
  target.style.setProperty('--accent-rgb', tokens.accentRgb)
  target.style.setProperty('--accent-soft-rgb', tokens.accentSoftRgb)
  target.style.setProperty('--accent-glow', tokens.accentGlow)
  target.style.setProperty('--accent-muted', tokens.accentMuted)
  target.style.setProperty('--accent-ink', tokens.accentInk)
  return tokens
}
