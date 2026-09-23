import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor } from 'storybook/test'
import { TaskbarLayoutEditor } from '../../features/settings/TaskbarLayoutEditor'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { withTaskbarLayout, type TaskbarElement } from '../../shared/lib/taskbarLayout'
import { useWorkshopConfig } from '../useWorkshopConfig'

function target(root: HTMLElement, name: 'controls' | 'catalog'): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-taskbar-target="${name}"]`)!
}

function element(root: HTMLElement, name: string, area: 'controls' | 'catalog' = 'controls'): HTMLElement {
  return target(root, area).querySelector<HTMLElement>(`[data-taskbar-element="${name}"]`)!
}

function order(root: HTMLElement): string[] {
  return Array.from(target(root, 'controls').querySelectorAll<HTMLElement>('[data-taskbar-element]'))
    .map((node) => node.dataset.taskbarElement!)
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

async function pointerDrag(source: HTMLElement, destination: HTMLElement | null, pointerId: number, x?: number): Promise<void> {
  const sourceRect = source.getBoundingClientRect()
  const destinationRect = destination?.getBoundingClientRect()
  const restore = mockSyntheticPointerCapture(source)
  const targetX = x ?? (destinationRect ? destinationRect.left + destinationRect.width / 2 : -20)
  const targetY = destinationRect ? destinationRect.top + destinationRect.height / 2 : -20
  try {
    fireEvent.pointerDown(source, { button: 0, pointerId, clientX: sourceRect.left + sourceRect.width / 2, clientY: sourceRect.top + sourceRect.height / 2 })
    fireEvent.pointerMove(source, { pointerId, clientX: targetX, clientY: targetY })
    fireEvent.pointerUp(source, { pointerId, clientX: targetX, clientY: targetY })
  } finally { restore() }
}

function EditorPreview({ locale, accent, light = false, elements, scale }: { locale: Locale; accent: string; light?: boolean; elements?: TaskbarElement[]; scale?: number }) {
  const [config, setConfig] = useWorkshopConfig(locale, accent)
  const commit = (next: AppConfig) => setConfig(next)
  const sized = scale == null ? config : { ...config, taskbar: { ...config.taskbar, scale } }
  const previewConfig = elements ? withTaskbarLayout(sized, { version: 1, elements }) : sized
  return <div className="settings-window-root" data-color-scheme={light ? 'light' : 'dark'} style={{ containerType: 'inline-size' }}>
    <TaskbarLayoutEditor config={previewConfig} onChange={commit} />
  </div>
}

const meta = {
  title: 'Organisms/TaskbarLayoutEditor',
  component: TaskbarLayoutEditor,
  args: { config: getDefaultConfig(), onChange: () => undefined },
  parameters: {
    workshop: { width: 720, height: 560, note: 'Production mini-player editor with in-memory configuration.' },
    controls: { disable: true },
  },
  render: (_args, context) => <EditorPreview locale={context.globals.locale} accent={context.globals.accent} light={context.parameters.settingsColorScheme === 'light'}
    elements={context.parameters.taskbarElements as TaskbarElement[] | undefined} scale={context.parameters.taskbarScale as number | undefined} />,
} satisfies Meta<typeof TaskbarLayoutEditor>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  name: 'Редактор мини-плеера',
  play: async ({ canvasElement }) => {
    await expect(order(canvasElement)).toEqual(['cover', 'previous', 'transport', 'next'])
    await expect(element(canvasElement, 'shuffle', 'catalog')).toBeInTheDocument()
    await expect(element(canvasElement, 'repeat', 'catalog')).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[aria-label="Сбросить состав мини-плеера"]')).toHaveLength(1)
  },
}

export const PointerGrabGeometry: Story = {
  name: 'Точка захвата · масштаб, прокрутка, Escape',
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>('.taskbar-preview__bar')!
    const source = element(canvasElement, 'previous')
    const restore = mockSyntheticPointerCapture(source)
    try {
      for (const scale of [.75, 1, 1.25, 1.5, 2]) {
        frame.style.transform = `scale(${scale})`
        source.scrollIntoView({ block: 'center', behavior: 'instant' })
        const bounds = source.getBoundingClientRect(), ink = source.querySelector('svg')!.getBoundingClientRect()
        const x = bounds.left + bounds.width * .27, y = bounds.top + bounds.height * .4
        await fireEvent.pointerDown(source, { button: 0, isPrimary: true, pointerId: 91, clientX: x, clientY: y })
        await fireEvent.pointerMove(source, { pointerId: 91, clientX: x + 17, clientY: y + 12 })
        await waitFor(() => {
          const ghost = document.querySelector<HTMLElement>('.island-layout-drag-ghost')!
          expect(ghost.parentElement).toBe(document.body)
          const b = ghost.getBoundingClientRect(), g = ghost.querySelector('svg')!.getBoundingClientRect()
          expect(b.left).toBeCloseTo(bounds.left + 17, 1)
          expect(b.top).toBeCloseTo(bounds.top + 12, 1)
          expect(b.width).toBeCloseTo(bounds.width, 1)
          expect(g.left).toBeCloseTo(ink.left + 17, 1)
          expect(g.top).toBeCloseTo(ink.top + 12, 1)
          expect(g.width).toBeCloseTo(ink.width, 1)
        })
        await userEvent.keyboard('{Escape}')
        await expect(document.querySelector('.island-layout-drag-ghost')).toBeNull()
      }
      await expect(order(canvasElement)).toEqual(['cover', 'previous', 'transport', 'next'])
    } finally { frame.style.transform = ''; restore() }
  },
}

export const PointerComposition: Story = {
  name: 'Порядок, добавление и удаление',
  play: async ({ canvasElement }) => {
    const controls = target(canvasElement, 'controls')
    const catalog = target(canvasElement, 'catalog')
    await pointerDrag(element(canvasElement, 'cover'), controls, 81, controls.getBoundingClientRect().right - 1)
    await expect(order(canvasElement)).toEqual(['previous', 'transport', 'next', 'cover'])
    await pointerDrag(element(canvasElement, 'shuffle', 'catalog'), controls, 82, controls.getBoundingClientRect().right - 1)
    await pointerDrag(element(canvasElement, 'repeat', 'catalog'), controls, 83, controls.getBoundingClientRect().right - 1)
    await expect(order(canvasElement)).toEqual(['previous', 'transport', 'next', 'cover', 'shuffle', 'repeat'])
    await pointerDrag(element(canvasElement, 'previous'), catalog, 84)
    await expect(order(canvasElement)).toEqual(['transport', 'next', 'cover', 'shuffle', 'repeat'])
    await expect(element(canvasElement, 'previous', 'catalog')).toBeInTheDocument()

    await pointerDrag(element(canvasElement, 'transport'), catalog, 85)
    await expect(order(canvasElement)).toEqual(['transport', 'next', 'cover', 'shuffle', 'repeat'])
    await pointerDrag(element(canvasElement, 'transport'), controls, 86, controls.getBoundingClientRect().right - 1)
    await expect(order(canvasElement)).toEqual(['next', 'cover', 'shuffle', 'repeat', 'transport'])
  },
}

export const CancelAndKeyboard: Story = {
  name: 'Отмена и клавиатура',
  play: async ({ canvasElement }) => {
    await pointerDrag(element(canvasElement, 'cover'), null, 91)
    await expect(order(canvasElement)).toEqual(['cover', 'previous', 'transport', 'next'])

    let cover = element(canvasElement, 'cover')
    cover.focus()
    await userEvent.keyboard(' ')
    await expect(cover).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    await expect(cover).toHaveAttribute('aria-pressed', 'false')
    await expect(order(canvasElement)).toEqual(['cover', 'previous', 'transport', 'next'])

    cover = element(canvasElement, 'cover')
    cover.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}{Enter}')
    await expect(order(canvasElement)).toEqual(['previous', 'cover', 'transport', 'next'])

    const previous = element(canvasElement, 'previous')
    previous.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(order(canvasElement)).toEqual(['cover', 'transport', 'next'])
    await expect(element(canvasElement, 'previous', 'catalog')).toBeInTheDocument()
  },
}

export const Narrow: Story = { name: 'Узкая ширина', parameters: { workshop: { width: 360, height: 650 } } }
export const AllControlsNarrow: Story = {
  name: 'Все кнопки · 125% · узкая ширина',
  parameters: {
    taskbarElements: ['cover', 'previous', 'transport', 'next', 'like', 'shuffle', 'repeat'],
    taskbarScale: 1.25,
    workshop: { width: 360, height: 650 },
  },
  play: async ({ canvasElement }) => {
    await expect(order(canvasElement)).toEqual(['cover', 'previous', 'transport', 'next', 'like', 'shuffle', 'repeat'])
    await expect(canvasElement.querySelector('.taskbar-player')).toHaveStyle({ '--taskbar-scale': '1.25' })
  },
}
export const Light: Story = { name: 'Светлое оформление', parameters: { settingsColorScheme: 'light' } }
export const English: Story = { name: 'English', globals: { locale: 'en' } }
