import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { Button, FeatureToggle, Input, SearchField, SettingRow, SettingsNavigation, SettingsSection, Switch } from '../../shared/ui/SettingsControls'
import { Select } from '../../shared/ui/Select'
import { Mic, SlidersHorizontal } from '../../shared/ui/SettingsIcons'

function Controls({ light = false, disabled = false }: { light?: boolean; disabled?: boolean }) {
  const [enabled, setEnabled] = useState(true)
  const [page, setPage] = useState('general')
  const [language, setLanguage] = useState('ru')
  const [query, setQuery] = useState('')
  return <div className="auxiliary-ui" data-color-scheme={light ? 'light' : 'dark'} style={{padding:24,display:'grid',gap:24,background:'var(--surface-canvas)',color:'var(--fg-primary)'}}>
    <FeatureToggle label="Диктовка" hint="Готова к записи по сочетанию клавиш." icon={<Mic size={24} weight="fill" />} checked={enabled} onChange={setEnabled} disabled={disabled} />
    <div style={{ display:'grid',gridTemplateColumns:'164px 1fr', gap:24 }}>
      <SettingsNavigation label="Пример навигации" value={page} onChange={setPage} items={[{id:'general',label:'Основное',icon:active=><Mic size={20} weight={active?'fill':'regular'} />},{id:'advanced',label:'Дополнительно',icon:active=><SlidersHorizontal size={20} weight={active?'fill':'regular'} />}]} />
      <SettingsSection title="Общие компоненты" showTitle={false}>
        <SearchField label="Найти модель" clearLabel="Очистить поиск" value={query} onChange={setQuery} />
        <SettingRow label="Язык"><Select ariaLabel="Язык" value={language} options={[{value:'ru',label:'Русский'},{value:'en',label:'English'}]} onChange={setLanguage} disabled={disabled}/></SettingRow>
        <SettingRow label="Название"><Input aria-label="Название" defaultValue="Мой словарь" disabled={disabled}/></SettingRow>
        <Switch label="Удалять междометия" hint="Обычные слова сохраняются." checked={enabled} onChange={setEnabled} disabled={disabled}/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="primary" disabled={disabled}>Сохранить</Button><Button disabled={disabled}>Отмена</Button><Button variant="ghost" disabled={disabled}>Подробнее</Button><Button variant="danger" disabled={disabled}>Удалить</Button></div>
      </SettingsSection>
    </div>
  </div>
}
const meta = { title:'Atoms/SettingsControls', component:Controls, parameters:{workshop:{width:850}} } satisfies Meta<typeof Controls>
export default meta
type Story = StoryObj<typeof meta>
export const Dark: Story = {name:'Единые контролы · графит'}
export const Light: Story = {name:'Единые контролы · светлая тема',args:{light:true}}
export const Disabled: Story = {name:'Недоступные действия',args:{disabled:true}}

function EdgeMenu({ light = false }: { light?: boolean }) {
  const [value, setValue] = useState('0')
  return <div className="auxiliary-ui" data-color-scheme={light ? 'light' : 'dark'} style={{ height: '100vh', background: 'var(--surface-canvas)', color: 'var(--fg-primary)' }}><div style={{ position: 'fixed', right: 16, bottom: 16, width: 220 }}><Select ariaLabel="Микрофон" value={value} options={Array.from({length: 12}, (_, i) => ({ value: String(i), label: `Микрофон ${i + 1} · USB Audio` }))} onChange={setValue}/></div></div>
}
const checkEdgeMenu: Story['play'] = async ({ canvasElement }) => {
  const trigger = within(canvasElement).getByRole('button', { name: 'Микрофон' })
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  const menu = await within(document.body).findByRole('listbox')
  await waitFor(() => {
    const rect = menu.getBoundingClientRect()
    expect(rect.left).toBeGreaterThanOrEqual(12)
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth - 11)
    expect(rect.bottom).toBeLessThan(trigger.getBoundingClientRect().top)
  })
  await userEvent.keyboard('{End}')
  await expect(within(menu).getByRole('option', { name: 'Микрофон 12 · USB Audio' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect(trigger).toHaveTextContent('Микрофон 12')
  await expect(trigger).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
}
export const PopoverAtEdge: Story = { name: 'Меню у края · клавиатура', render: () => <EdgeMenu />, parameters: { workshop: { bare: true } }, play: checkEdgeMenu }
export const PopoverAtEdgeLight: Story = { name: 'Меню у края · светлая тема', render: () => <EdgeMenu light />, parameters: { workshop: { bare: true } }, play: checkEdgeMenu }
