import type { AppConfig } from './types'

export const TASKBAR_LAYOUT_VERSION = 1 as const

export type TaskbarElement = 'cover' | 'previous' | 'transport' | 'next' | 'like' | 'shuffle' | 'repeat'

export interface TaskbarLayoutV1 {
  version: typeof TASKBAR_LAYOUT_VERSION
  elements: TaskbarElement[]
}

export const TASKBAR_ELEMENTS: readonly TaskbarElement[] = [
  'cover', 'previous', 'transport', 'next', 'like', 'shuffle', 'repeat',
]

export const DEFAULT_TASKBAR_ELEMENTS: readonly TaskbarElement[] = [
  'cover', 'previous', 'transport', 'next',
]

export const TASKBAR_ELEMENT_LABELS = {
  ru: { cover: 'Обложка', previous: 'Предыдущий трек', next: 'Следующий трек', transport: 'Пуск и пауза', like: 'Нравится', shuffle: 'Перемешать', repeat: 'Повтор' },
  en: { cover: 'Artwork', previous: 'Previous track', next: 'Next track', transport: 'Play and pause', like: 'Like', shuffle: 'Shuffle', repeat: 'Repeat' },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeTaskbarLayout(value: unknown): TaskbarLayoutV1 {
  const root = isRecord(value) ? value : {}
  const hasElements = Array.isArray(root.elements)
  const source: readonly unknown[] = hasElements ? root.elements as unknown[] : DEFAULT_TASKBAR_ELEMENTS
  const seen = new Set<TaskbarElement>()
  const elements = source.filter((item): item is TaskbarElement => {
    if (typeof item !== 'string' || !TASKBAR_ELEMENTS.includes(item as TaskbarElement) || seen.has(item as TaskbarElement)) return false
    seen.add(item as TaskbarElement)
    return true
  })
  if (!seen.has('transport')) elements.push('transport')
  return { version: TASKBAR_LAYOUT_VERSION, elements }
}

export function getLegacyTaskbarLayout(config: AppConfig): TaskbarLayoutV1 {
  return normalizeTaskbarLayout({
    version: TASKBAR_LAYOUT_VERSION,
    elements: config.taskbar?.showLike === true
      ? [...DEFAULT_TASKBAR_ELEMENTS, 'like']
      : DEFAULT_TASKBAR_ELEMENTS,
  })
}

export function getTaskbarLayout(config: AppConfig): TaskbarLayoutV1 {
  const ui = config.plugins?.settings?.ui
  const raw = isRecord(ui) ? ui.taskbarLayout : undefined
  if (!isRecord(raw) || raw.version !== TASKBAR_LAYOUT_VERSION || !Array.isArray(raw.elements)) {
    return getLegacyTaskbarLayout(config)
  }
  return normalizeTaskbarLayout(raw)
}

export function withTaskbarLayout(config: AppConfig, layout: TaskbarLayoutV1): AppConfig {
  const ui = isRecord(config.plugins.settings.ui) ? config.plugins.settings.ui : {}
  const normalized = normalizeTaskbarLayout(layout)
  return {
    ...config,
    taskbar: { ...config.taskbar, showLike: normalized.elements.includes('like') },
    plugins: {
      ...config.plugins,
      settings: {
        ...config.plugins.settings,
        ui: { ...ui, taskbarLayout: normalized },
      },
    },
  }
}
