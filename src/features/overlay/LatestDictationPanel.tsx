import { useState, type Ref } from 'react'
import { createTranslator } from '../../shared/i18n/messages'
import type { LatestDictationMessage } from '../../shared/lib/dictationTypes'
import type { Locale } from '../../shared/lib/types'
import { Check, Copy, X } from '../../shared/ui/SettingsIcons'
import { Notice, SettingsIconButton } from '../../shared/ui/SettingsControls'
import './LatestDictationPanel.css'

export function LatestDictationPanel({ message, locale, copy, dismiss, ref }: {
  message: LatestDictationMessage
  locale: Locale
  copy: (id: number) => Promise<void>
  dismiss: () => void
  ref: Ref<HTMLElement>
}) {
  const t = createTranslator(locale)
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const copyText = async () => {
    setState('copying')
    try {
      await copy(message.id)
      setState('copied')
    } catch {
      setState('error')
    }
  }

  return (
    <section className="island-latest-dictation island-surface" aria-label={t('dictation.latestTitle')} ref={ref}>
      <p className="island-latest-dictation__text" title={message.text}>{message.text}</p>
      <div className="island-latest-dictation__actions">
        <SettingsIconButton variant="ghost" size="compact" label={t('dictation.latestCopy')} busy={state === 'copying'} onClick={() => void copyText()}>
          {state === 'copied' ? <Check size={16} weight="bold" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </SettingsIconButton>
        <SettingsIconButton variant="ghost" size="compact" label={t('dictation.latestDismiss')} onClick={dismiss}>
          <X size={16} aria-hidden="true" />
        </SettingsIconButton>
      </div>
      <span className="island-latest-dictation__status" role="status">{state === 'copied' ? t('dictation.latestCopied') : ''}</span>
      {state === 'error' ? <Notice className="island-latest-dictation__error" tone="danger">{t('dictation.latestCopyError')}</Notice> : null}
    </section>
  )
}
