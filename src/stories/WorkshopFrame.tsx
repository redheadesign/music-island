import {
  isValidElement,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import type { StoryContext } from '@storybook/react-vite'
import { applyAccentTheme } from '../shared/lib/accentTheme'

export function WorkshopFrame({
  children,
  context,
}: {
  children: ReactNode
  context: StoryContext
}) {
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState(false)
  const {
    locale = 'ru',
    accent = '#f76100',
    surface = 'studio',
  } = context.globals
  useLayoutEffect(() => {
    applyAccentTheme(String(accent))
    document.documentElement.lang = String(locale)
  }, [accent, locale])

  useEffect(() => {
    setCopied(false)
    setFeedback('')
  }, [context.id, context.args, locale, accent, surface])

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
    const text = `${context.title} / ${context.name}\n${url.href}\nЯзык: ${locale}; акцент: ${accent}; фон: ${surface}\nПараметры: ${args}\n\nЧто изменить: `
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setFeedback(text)
    }
  }

  if (context.parameters.workshop?.welcome || context.parameters.workshop?.bare) return <>{children}</>

  return (
    <div
      className={`workshop workshop--${surface} ${context.viewMode === 'docs' ? 'workshop--docs' : ''}`}
    >
      {context.viewMode === 'story' && (
        <header className="workshop-bar">
          <div>
            <span className="workshop-eyebrow">MUSIC ISLAND / UI</span>
            <strong>
              {context.title.split('/').at(-1)} <span>· {context.name}</span>
            </strong>
          </div>
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
          style={{ width: context.parameters.workshop?.width ?? 480 }}
        >
          {children}
        </div>
      </div>
      {context.viewMode === 'story' && (
        <footer className="workshop-footer">
          {context.parameters.workshop?.note ??
            'Изменяйте параметры во вкладке Controls. Нажатия отображаются во вкладке Actions.'}
        </footer>
      )}
    </div>
  )
}
