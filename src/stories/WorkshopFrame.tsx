import {
  isValidElement,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import type { StoryContext } from '@storybook/react-vite'
import { WarpSurfaceProvider } from '../shared/ui/WarpSurface'
import { DEFAULT_INTERFACE_THEME, getInterfaceThemeDefinition, normalizeInterfaceTheme } from '../shared/lib/interfaceTheme'
import { applyAccentTheme } from '../shared/lib/accentTheme'
import { GlassRefraction } from '../shared/ui/GlassRefraction'
import { useGlassPointerLight } from '../shared/ui/useGlassPointerLight'

export function WorkshopFrame({
  children,
  context,
}: {
  children: ReactNode
  context: StoryContext
}) {
  useGlassPointerLight(context.viewMode === 'story')
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState(false)
  const {
    locale = 'ru',
    accent = '#f76100',
    surface = 'studio',
    interfaceTheme = DEFAULT_INTERFACE_THEME,
  } = context.globals
  useLayoutEffect(() => {
    applyAccentTheme(String(accent))
    document.documentElement.lang = String(locale)
  }, [accent, locale])

  useEffect(() => {
    setCopied(false)
    setFeedback('')
  }, [context.id, context.args, locale, accent, surface, interfaceTheme])

  async function copyContext() {
    const url = new URL(window.parent.location.href)
    url.pathname = '/'
    url.searchParams.delete('id')
    url.searchParams.delete('viewMode')
    url.searchParams.set('path', `/story/${context.id}`)
    const args = JSON.stringify(context.args, (_, value) => {
      if (typeof value === 'function' || isValidElement(value)) return undefined
      if (typeof value === 'string' && value.startsWith('data:'))
        return '[локальный ресурс]'
      return value
    })
    const text = `${context.title} / ${context.name}\n${url.href}\nЯзык: ${locale}; акцент: ${accent}; фон: ${surface}; тема: ${interfaceTheme}\nПараметры: ${args}\n\nЧто изменить: `
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setFeedback(text)
    }
  }

  if (context.parameters.workshop?.welcome) return <>{children}</>
  const refraction = context.viewMode === 'story' ? <GlassRefraction /> : null
  if (context.parameters.workshop?.bare) return <>{children}{refraction}</>
  const note = context.parameters.workshop?.note
  const scene = getInterfaceThemeDefinition(normalizeInterfaceTheme(interfaceTheme)).scene?.fallback
  const colorScheme = context.parameters.settingsColorScheme === 'light' || context.parameters.light ? 'light' : 'dark'

  return (
    <div
      className={`workshop workshop--${surface} ${context.viewMode === 'docs' ? 'workshop--docs' : ''}`}
    >
      {refraction}
      {context.viewMode === 'story' && (
        <header className="workshop-bar">
          <strong>
            {context.title.split('/').at(-1)} <span>· {context.name}</span>
          </strong>
          <button className="workshop-copy" onClick={() => void copyContext()}>
            {copied ? 'Контекст скопирован' : 'Скопировать контекст'}
          </button>
        </header>
      )}
      {feedback && (
        <textarea
          className="workshop-feedback"
          aria-label="Контекст для комментария"
          readOnly
          value={feedback}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      <div
        className="workshop-stage"
        style={{ minHeight: context.parameters.workshop?.height ?? 320 }}
      >
        <div
          className="workshop-content"
          data-interface-theme={context.parameters.handlesInterfaceTheme ? undefined : interfaceTheme}
          style={{ width: context.parameters.workshop?.width ?? 480 }}
        >
          {context.parameters.settingsPreviewScene
            ? <WarpSurfaceProvider scene={scene} colorScheme={colorScheme}>{children}</WarpSurfaceProvider>
            : children}
        </div>
      </div>
      {context.viewMode === 'story' && note && (
        <footer className="workshop-footer">{note}</footer>
      )}
    </div>
  )
}
