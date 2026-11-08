import { useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { LLMPrompt, PostProcessProvider } from '../../shared/lib/dictationTypes'
import type { Locale } from '../../shared/lib/types'
import { Button, Input, Notice, SearchField, Switch, Textarea } from '../../shared/ui/SettingsControls'
import { Check } from '../../shared/ui/SettingsIcons'
import { Modal } from '../../shared/ui/Modal'
import { CommitInput, DictationField } from './DictationFields'
import { DictationShortcut } from './DictationShortcut'
import './DictationProcessing.css'

type Choice = { id: string; label: string }
type Translate = (ru: string, en: string) => string

function Choices({ label, options, value, disabled, onChange }: {
  label: string; options: Choice[]; value?: string; disabled: boolean; onChange: (value: string) => void
}) {
  return <div className="dictation-processing-choices" role="group" aria-label={label}>
    {options.map(option => <Button key={option.id} size="compact" variant="ghost" aria-pressed={option.id === value}
      disabled={disabled} onClick={() => { if (value !== option.id) onChange(option.id) }}>
      <Check size={14} aria-hidden="true" />{option.label}
    </Button>)}
  </div>
}

export function DictationProcessing({ controller: c, locale }: { controller: DictationController; locale: Locale }) {
  const t: Translate = (ru, en) => locale === 'ru' ? ru : en
  const { api, data } = c
  const [dialog, setDialog] = useState<'connection' | 'prompt' | null>(null)
  const s = data?.settings
  const enabled = Boolean(s?.post_process_enabled)
  const providers = (s?.post_process_providers ?? []).filter(provider => provider.id !== 'apple_intelligence')
  const provider = providers.find(item => item.id === s?.post_process_provider_id)
  const prompts = s?.post_process_prompts ?? []
  const prompt = prompts.find(item => item.id === s?.post_process_selected_prompt_id)
  const busy = Boolean(c.busy)
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => undefined) }
  const close = () => setDialog(null)
  const connectionLabel = t('Подключение', 'Connection')
  const promptLabel = t('Шаблон', 'Prompt')

  return <>
    <section className="dictation-card">
      <Switch label={t('Обработка с ИИ', 'AI processing')}
        hint={t('Отдельное сочетание отправляет текст сервису.', 'A separate shortcut sends text to the service.')}
        checked={enabled} disabled={busy}
        onChange={checked => run('processing-enabled', () => api.changePostProcessEnabledSetting(checked))} />
      {enabled ? <>
        <DictationField label={t('Диктовка с ИИ', 'Dictate with AI')}>
          <DictationShortcut controller={c} id="transcribe_with_post_process" locale={locale} />
        </DictationField>
        <DictationField label={connectionLabel} hint={provider?.label ?? t('Сервис не выбран', 'No service selected')}>
          <Button size="compact" onClick={() => setDialog('connection')}>{t('Настроить', 'Configure')}</Button>
        </DictationField>
      </> : null}
    </section>
    {enabled ? <section className="dictation-card">
      <h3>{t('Шаблоны', 'Prompts')}</h3>
      {prompts.length ? <Choices label={promptLabel} value={prompt?.id} disabled={busy}
        options={prompts.map(item => ({ id: item.id, label: item.name }))}
        onChange={id => run('prompt', () => api.setPostProcessSelectedPrompt(id))} /> : null}
      <div className="ui-action-row dictation-processing-actions">
        {prompt ? <Button size="compact" onClick={() => setDialog('prompt')}>{t('Редактировать шаблон', 'Edit prompt')}</Button> : null}
        <Button size="compact" variant={prompt ? 'ghost' : 'secondary'} disabled={busy}
          onClick={() => run('add-prompt', () => api.addPostProcessPrompt(t('Новый шаблон', 'New prompt'), '${output}'))}>
          {t('Добавить шаблон', 'Add prompt')}
        </Button>
      </div>
    </section> : null}
    {enabled && dialog === 'connection' ? <Modal label={connectionLabel} onClose={close}>
      <h3>{connectionLabel}</h3>
      <Choices label={t('Сервис', 'Service')} options={providers} value={provider?.id} disabled={busy}
        onChange={id => run('provider', () => api.setPostProcessProvider(id))} />
      {provider ? <ProviderSetup key={provider.id} provider={provider} controller={c} t={t} /> : null}
      {c.error ? <Notice tone="danger">{c.error}</Notice> : null}
      <div className="dictation-dialog__actions"><Button onClick={close}>{t('Готово', 'Done')}</Button></div>
    </Modal> : null}
    {enabled && dialog === 'prompt' && prompt ? <PromptEditor key={prompt.id} prompt={prompt} controller={c} t={t} onClose={close} /> : null}
  </>
}

function ProviderSetup({ provider, controller: c, t }: { provider: PostProcessProvider; controller: DictationController; t: Translate }) {
  const { api, data } = c
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const busy = Boolean(c.busy)
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => undefined) }
  const selectedModel = data?.settings.post_process_models?.[provider.id] ?? ''
  const filteredModels = models?.filter(name => name.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  const keyLabel = t('Ключ API', 'API key')
  return <div className="dictation-processing-provider">
    {provider.allow_base_url_edit ? <DictationField label={t('Адрес API', 'API endpoint')}>
      <CommitInput type="url" value={provider.base_url}
        onSave={value => run('endpoint', () => api.changePostProcessBaseUrlSetting(provider.id, value))} />
    </DictationField> : null}
    <DictationField label={keyLabel}>
      <div className="dictation-processing-key">
        <form onSubmit={event => {
          event.preventDefault()
          if (key.trim() && !busy) run('api-key', async () => { await api.changePostProcessApiKeySetting(provider.id, key.trim()); setKey('') })
        }}>
          <Input type="password" value={key} autoComplete="off" aria-label={keyLabel} onChange={event => setKey(event.target.value)} />
          <Button type="submit" size="compact" disabled={!key.trim() || busy}>{t('Сохранить', 'Save')}</Button>
        </form>
        <Button size="compact" variant="ghost" disabled={busy} onClick={() => run('remove-api-key', async () => {
          await api.changePostProcessApiKeySetting(provider.id, '')
          setKey('')
        })}>{t('Удалить ключ', 'Remove key')}</Button>
      </div>
    </DictationField>
    <DictationField label={t('Модель ИИ', 'AI model')}>
      <CommitInput value={selectedModel} onSave={value => run('processing-model', () => api.changePostProcessModelSetting(provider.id, value))} />
    </DictationField>
    {provider.models_endpoint ? <div className="ui-action-row dictation-processing-actions">
      <Button size="compact" disabled={busy} onClick={() => run('available-models', async () => {
        setModels(await api.fetchPostProcessModels(provider.id))
        setQuery('')
      })}>{t('Загрузить список моделей', 'Fetch models')}</Button>
    </div> : null}
    {models && models.length > 0 ? <>
      <SearchField label={t('Найти модель ИИ', 'Find an AI model')} clearLabel={t('Очистить поиск', 'Clear search')}
        value={query} onChange={setQuery} />
      {filteredModels.length ? <div className="dictation-processing-models">
        <Choices label={t('Доступные модели', 'Available models')} value={selectedModel} disabled={busy}
          options={filteredModels.map(name => ({ id: name, label: name }))}
          onChange={value => run('processing-model', () => api.changePostProcessModelSetting(provider.id, value))} />
      </div> : <p role="status">{t('Ничего не нашлось.', 'No matching models.')}</p>}
    </> : models ? <p role="status">{t('Сервис не вернул модели.', 'The service returned no models.')}</p> : null}
  </div>
}

function PromptEditor({ prompt, controller: c, t, onClose }: {
  prompt: LLMPrompt; controller: DictationController; t: Translate; onClose: () => void
}) {
  const title = t('Редактировать шаблон', 'Edit prompt')
  const [name, setName] = useState(prompt.name)
  const [body, setBody] = useState(prompt.prompt)
  const busy = Boolean(c.busy)
  const finish = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).then(onClose).catch(() => undefined) }
  return <Modal label={title} onClose={onClose}>
    <h3>{title}</h3>
    <form onSubmit={event => {
      event.preventDefault()
      if (!busy && name.trim() && body.trim()) {
        finish('prompt-update', () => c.api.updatePostProcessPrompt(prompt.id, name.trim(), body))
      }
    }}>
      <DictationField label={t('Название', 'Name')}><Input value={name} onChange={event => setName(event.target.value)} /></DictationField>
      <DictationField label={t('Текст шаблона', 'Prompt text')}
        hint={t('${output} — распознанный текст.', '${output} is the transcript.')}>
        <Textarea rows={6} value={body} onChange={event => setBody(event.target.value)} />
      </DictationField>
      {c.error ? <Notice tone="danger">{c.error}</Notice> : null}
      <div className="dictation-dialog__actions dictation-processing-editor-actions">
        <Button variant="danger" disabled={busy} onClick={() => finish('delete-prompt', () => c.api.deletePostProcessPrompt(prompt.id))}>
          {t('Удалить шаблон', 'Delete prompt')}
        </Button>
        <Button onClick={onClose}>{t('Отмена', 'Cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !body.trim()}>{t('Сохранить', 'Save')}</Button>
      </div>
    </form>
  </Modal>
}
