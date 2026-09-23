import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor } from 'storybook/test'
import { useState } from 'react'
import { IslandLayoutEditor } from '../../features/settings/IslandLayoutEditor'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { useWorkshopConfig } from '../useWorkshopConfig'

function zone(root: HTMLElement, name: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-layout-target="${name}"]`)!
}

function element(root: HTMLElement, name: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-layout-element="${name}"]`)!
}

function elements(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(':scope [data-layout-element]'))
    .map((node) => node.dataset.layoutElement!)
}

function mockSyntheticPointerCapture(node: HTMLElement): () => void {
  const setDescriptor = Object.getOwnPropertyDescriptor(node, 'setPointerCapture')
  const releaseDescriptor = Object.getOwnPropertyDescriptor(node, 'releasePointerCapture')
  Object.defineProperties(node, {
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  })
  return () => {
    if (setDescriptor) Object.defineProperty(node, 'setPointerCapture', setDescriptor)
    else Reflect.deleteProperty(node, 'setPointerCapture')
    if (releaseDescriptor) Object.defineProperty(node, 'releasePointerCapture', releaseDescriptor)
    else Reflect.deleteProperty(node, 'releasePointerCapture')
  }
}

async function pointerDrag(source: HTMLElement, target: HTMLElement, pointerId: number, x?: number): Promise<void> {
  target.scrollIntoView({ block: 'center', behavior: 'instant' })
  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const restore = mockSyntheticPointerCapture(source)
  const targetX = x ?? targetRect.left + targetRect.width / 2
  const targetY = targetRect.top + targetRect.height / 2
  try {
    await fireEvent.pointerDown(source, { button: 0, isPrimary: true, pointerId, clientX: sourceRect.left + sourceRect.width / 2, clientY: sourceRect.top + sourceRect.height / 2 })
    await fireEvent.pointerMove(source, { pointerId, clientX: targetX, clientY: targetY })
    await fireEvent.pointerUp(source, { pointerId, clientX: targetX, clientY: targetY })
  } finally {
    restore()
  }
}

function EditorPreview({ locale, accent, light = false }: { locale: Locale; accent: string; light?: boolean }) {
  const [config, setConfig] = useWorkshopConfig(locale, accent)
  const [changeCount, setChangeCount] = useState(0)
  const editorConfig: AppConfig = {
    ...config,
    plugins: { ...config.plugins, settings: { ...config.plugins.settings, usage: { codexEnabled: true, claudeEnabled: false } } },
  }
  const commit = (next: AppConfig) => { setChangeCount((value) => value + 1); setConfig(next) }
  return <div className="settings-window-root" data-color-scheme={light ? 'light' : 'dark'} data-config-width={config.layout.width} data-config-scale={config.layout.scale} data-change-count={changeCount} style={{ containerType: 'inline-size' }}>
    <IslandLayoutEditor config={editorConfig} onChange={commit} />
  </div>
}

const meta = {
  title: 'Organisms/IslandLayoutEditor',
  component: IslandLayoutEditor,
  args: { config: getDefaultConfig(), onChange: () => undefined },
  parameters: {
    workshop: { width: 720, height: 820, note: 'Production editor with an in-memory config. Dragging never connects providers.' },
    controls: { disable: true },
  },
  render: (_args, context) => <EditorPreview locale={context.globals.locale} accent={context.globals.accent} light={context.parameters.settingsColorScheme === 'light'} />,
} satisfies Meta<typeof IslandLayoutEditor>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  name: 'Редактор островка',
  play: async ({ canvasElement }) => {
    const player = zone(canvasElement, 'player')
    const actions = zone(canvasElement, 'actions')
    await expect(element(actions, 'settings')).toHaveAttribute('data-protected', 'true')
    await expect(element(player, 'previous')).toBeInTheDocument()
    await expect(element(player, 'next')).toBeInTheDocument()
    await expect(element(canvasElement, 'progress')).toBeInTheDocument()
    await expect(element(zone(canvasElement, 'catalog'), 'shuffle')).toBeInTheDocument()
    await expect(element(zone(canvasElement, 'catalog'), 'repeat')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[aria-label="Сбросить настройки островка"]')).toHaveLength(1)
  },
}

export const CancelledDrag: Story = {
  name: 'Отмена перетаскивания',
  play: async ({ canvasElement }) => {
    const codex = element(zone(canvasElement, 'left'), 'codex')
    codex.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Escape}')
    await expect(element(zone(canvasElement, 'left'), 'codex')).toBeInTheDocument()
    await expect(zone(canvasElement, 'right').querySelector('[data-layout-element="codex"]')).toBeNull()
  },
}

export const PointerGrabGeometry: Story = {
  name: 'Точка захвата · масштабы и отмена',
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>('.island-preview__frame')!
    const source = element(zone(canvasElement, 'player'), 'previous')
    const original = frame.style.transform
    const restore = mockSyntheticPointerCapture(source)
    try {
      for (const scale of [.65, 1, 1.25, 1.5, 2]) {
        frame.style.transform = `scale(${scale})`
        source.scrollIntoView({ block: 'center', behavior: 'instant' })
        const bounds = source.getBoundingClientRect()
        const visual = source.querySelector('svg')!.getBoundingClientRect()
        const x = bounds.left + bounds.width * .27, y = bounds.top + bounds.height * .41
        await fireEvent.pointerDown(source, { button: 0, isPrimary: true, pointerId: 81, clientX: x, clientY: y })
        await fireEvent.pointerMove(source, { pointerId: 81, clientX: x + 13, clientY: y + 9 })
        await waitFor(() => {
          const ghost = document.querySelector<HTMLElement>('.island-layout-drag-ghost')!
          expect(ghost.parentElement).toBe(document.body)
          const actual = ghost.getBoundingClientRect()
          expect(actual.left).toBeCloseTo(bounds.left + 13, 1)
          expect(actual.top).toBeCloseTo(bounds.top + 9, 1)
          expect(actual.width).toBeCloseTo(bounds.width, 1)
          expect(actual.height).toBeCloseTo(bounds.height, 1)
          const ink = ghost.querySelector('svg')!.getBoundingClientRect()
          expect(ink.left).toBeCloseTo(visual.left + 13, 1)
          expect(ink.top).toBeCloseTo(visual.top + 9, 1)
          expect(ink.width).toBeCloseTo(visual.width, 1)
          expect(ink.height).toBeCloseTo(visual.height, 1)
        })
        await userEvent.keyboard('{Escape}')
        await expect(document.querySelector('.island-layout-drag-ghost')).not.toBeInTheDocument()
      }
      await expect(canvasElement.querySelector('[data-change-count]')).toHaveAttribute('data-change-count', '0')
    } finally {
      frame.style.transform = original
      restore()
    }
  },
}

export const KeyboardControls: Story = {
  name: 'Управление с клавиатуры',
  play: async ({ canvasElement }) => {
    const artwork = element(zone(canvasElement, 'player'), 'artwork')
    artwork.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowLeft}{Enter}')
    await expect(element(zone(canvasElement, 'catalog'), 'artwork')).toBeInTheDocument()
    const catalogArtwork = element(zone(canvasElement, 'catalog'), 'artwork')
    catalogArtwork.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}{Enter}')
    await expect(element(zone(canvasElement, 'player'), 'artwork')).toBeInTheDocument()
  },
}

export const ProviderNativeFallback: Story = {
  name: 'Провайдер между зонами',
  play: async ({ canvasElement }) => {
    const source = element(zone(canvasElement, 'left'), 'codex')
    const target = zone(canvasElement, 'right')
    await pointerDrag(source, target, 49)
    await expect(element(target, 'codex')).toBeInTheDocument()
    await expect(zone(canvasElement, 'left').querySelector('[data-layout-element="codex"]')).toBeNull()
  },
}

// Keep the export name so existing workshop links retain their stable story ID.
export const ReactionSwapAndCatalog: Story = {
  name: 'Реакции: вместе и каталог',
  play: async ({ canvasElement }) => {
    const left = zone(canvasElement, 'reactionLeft')
    const right = zone(canvasElement, 'reactionRight')
    await pointerDrag(element(right, 'like'), left, 51, left.getBoundingClientRect().right - 1)
    await expect(elements(left)).toEqual(['dislike', 'like'])
    await expect(elements(right)).toEqual([])
    await pointerDrag(element(left, 'like'), zone(canvasElement, 'catalog'), 52)
    await expect(left.querySelector('[data-layout-element="like"]')).toBeNull()
    await expect(elements(left)).toEqual(['dislike'])
    await expect(element(zone(canvasElement, 'catalog'), 'like')).toBeInTheDocument()
  },
}

export const ResizePointerGestures: Story = {
  name: 'Размер: жест, отмена и сохранение',
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.settings-window-root')!
    const body = canvasElement.querySelector<HTMLElement>('.island-preview__body')!
    const right = canvasElement.querySelector<HTMLElement>('.island-preview__resize-edge--right')!
    const left = canvasElement.querySelector<HTMLElement>('.island-preview__resize-edge--left')!
    const corner = canvasElement.querySelector<HTMLElement>('.island-preview__resize-corner')!
    const bounds = body.getBoundingClientRect()
    const initialWidth = Number(root.dataset.configWidth)
    const initialScale = Number(root.dataset.configScale)

    let restore = mockSyntheticPointerCapture(right)
    fireEvent.pointerDown(right, { button: 0, pointerId: 71, clientX: bounds.right, clientY: bounds.top + bounds.height / 2 })
    fireEvent.pointerMove(right, { pointerId: 71, clientX: bounds.right + bounds.width / 4, clientY: bounds.top + bounds.height / 2 })
    await expect(Number(right.getAttribute('aria-valuenow'))).toBeGreaterThan(initialWidth)
    await expect(root.dataset.configWidth).toBe(String(initialWidth))
    await expect(root.dataset.changeCount).toBe('0')
    fireEvent.keyDown(right, { key: 'Escape' })
    await expect(right).toHaveAttribute('aria-valuenow', String(initialWidth))
    await expect(root.dataset.changeCount).toBe('0')

    fireEvent.pointerDown(right, { button: 0, pointerId: 74, clientX: bounds.right, clientY: bounds.top + bounds.height / 2 })
    fireEvent.pointerMove(right, { pointerId: 74, clientX: bounds.right + bounds.width / 5, clientY: bounds.top + bounds.height / 2 })
    fireEvent.pointerCancel(right, { pointerId: 74 })
    await expect(right).toHaveAttribute('aria-valuenow', String(initialWidth))
    await expect(root.dataset.changeCount).toBe('0')
    restore()

    restore = mockSyntheticPointerCapture(left)
    fireEvent.pointerDown(left, { button: 0, pointerId: 72, clientX: bounds.left, clientY: bounds.top + bounds.height / 2 })
    fireEvent.pointerMove(left, { pointerId: 72, clientX: bounds.left + bounds.width / 5, clientY: bounds.top + bounds.height / 2 })
    const narrowed = Number(left.getAttribute('aria-valuenow'))
    await expect(narrowed).toBeLessThan(initialWidth)
    await expect(root.dataset.configWidth).toBe(String(initialWidth))
    fireEvent.pointerUp(left, { pointerId: 72, clientX: bounds.left + bounds.width / 5, clientY: bounds.top + bounds.height / 2 })
    await expect(root.dataset.configWidth).toBe(String(narrowed))
    await expect(root.dataset.changeCount).toBe('1')
    restore()

    restore = mockSyntheticPointerCapture(corner)
    fireEvent.pointerDown(corner, { button: 0, pointerId: 73, clientX: bounds.right, clientY: bounds.bottom })
    fireEvent.pointerMove(corner, { pointerId: 73, clientX: bounds.right + 40, clientY: bounds.bottom + 20 })
    const enlarged = Number(corner.getAttribute('aria-valuenow'))
    await expect(enlarged).toBeGreaterThan(initialScale)
    await expect(root.dataset.configScale).toBe(String(initialScale))
    fireEvent.pointerUp(corner, { pointerId: 73, clientX: bounds.right + 40, clientY: bounds.bottom + 20 })
    await expect(root.dataset.configScale).toBe(String(enlarged))
    await expect(root.dataset.changeCount).toBe('2')
    restore()
  },
}

export const ResizeKeyboardControls: Story = {
  name: 'Размер: клавиатура и границы',
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.settings-window-root')!
    const width = canvasElement.querySelector<HTMLElement>('.island-preview__resize-edge--right')!
    const scale = canvasElement.querySelector<HTMLElement>('.island-preview__resize-corner')!
    const initialWidth = Number(width.getAttribute('aria-valuenow'))

    width.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(root.dataset.configWidth).toBe(String(initialWidth + 1))
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await expect(root.dataset.configWidth).toBe(String(initialWidth + 6))
    await userEvent.keyboard('{Home}')
    await expect(width).toHaveAttribute('aria-valuenow', '80')
    await userEvent.keyboard('{End}')
    await expect(width).toHaveAttribute('aria-valuenow', '125')

    scale.focus()
    await userEvent.keyboard('{Home}')
    await expect(scale).toHaveAttribute('aria-valuenow', '70')
    await userEvent.keyboard('{End}')
    await expect(scale).toHaveAttribute('aria-valuenow', '120')
    fireEvent.doubleClick(scale)
    await expect(scale).toHaveAttribute('aria-valuenow', '100')
    await expect(root.dataset.configScale).toBe('100')
  },
}

export const IndependentNavigationOrder: Story = {
  name: 'Независимые кнопки и порядок',
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector<HTMLButtonElement>('.island-layout-editor__reset')!)
    const player = zone(canvasElement, 'player')
    await expect(elements(player)).toEqual(['previous', 'artwork', 'next'])
    await expect(element(canvasElement, 'progress')).toBeInTheDocument()
    const previous = element(player, 'previous').getBoundingClientRect()
    await pointerDrag(element(player, 'next'), player, 61, previous.left + 1)
    await expect(elements(player)).toEqual(['next', 'previous', 'artwork'])
    await pointerDrag(element(player, 'previous'), zone(canvasElement, 'catalog'), 62)
    await expect(player.querySelector('[data-layout-element="previous"]')).toBeNull()
    await expect(element(player, 'next')).toBeInTheDocument()
    await pointerDrag(element(player, 'artwork'), zone(canvasElement, 'catalog'), 63)
    await expect(element(player, 'transport')).toHaveAttribute('data-protected', 'true')
  },
}

export const Narrow: Story = { name: 'Узкая ширина', parameters: { workshop: { width: 360, height: 1000 } } }
export const Light: Story = { name: 'Светлое оформление', parameters: { settingsColorScheme: 'light' } }
export const English: Story = { name: 'English', globals: { locale: 'en' } }
