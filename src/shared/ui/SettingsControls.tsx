import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import './SettingsControls.css'
import { Search, X } from './SettingsIcons'

export function Button({ variant = 'secondary', size = 'normal', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'normal' | 'compact' }) {
  return <button type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} {...props} />
}

export function SettingRow({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`ui-setting-row ${className}`}><span className="ui-setting-row__copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span><span className="ui-setting-row__control">{children}</span></label>
}

export function Toggle({ checked, onChange, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button {...props} type="button" className={`ui-toggle ${props.className ?? ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
}

export function Switch({ label, hint, checked, onChange, disabled = false }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <div className="ui-setting-row"><span className="ui-setting-row__copy"><strong id={`${id}-label`}>{label}</strong>{hint ? <small id={`${id}-hint`}>{hint}</small> : null}</span><Toggle checked={checked} onChange={onChange} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} disabled={disabled} /></div>
}

export function FeatureToggle({ icon, ...props }: Parameters<typeof Switch>[0] & { icon?: ReactNode }) {
  return <div className="ui-feature-toggle" data-enabled={props.checked}>{icon ? <span className="ui-feature-toggle__icon" aria-hidden="true">{icon}</span> : null}<Switch {...props} /></div>
}

export function SettingsSection({ title, icon, children, action, hidden, showTitle = true, className = '' }: { className?: string; title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode; hidden?: boolean; showTitle?: boolean }) {
  return <section className={`settings-section ui-section ${className}`} hidden={hidden} aria-label={title}>{showTitle ? <header className="settings-section-header"><div className="settings-section-title">{icon}<h2>{title}</h2></div>{action}</header> : null}{children}</section>
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={`ui-input ${className}`} {...props} /> }
export function SearchField({ value, onChange, label, clearLabel }: { value: string; onChange: (value: string) => void; label: string; clearLabel: string }) {
  return <div className="ui-search"><Search size={17} aria-hidden="true" /><input type="search" value={value} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={label} />{value ? <button type="button" aria-label={clearLabel} onClick={event => { onChange(''); event.currentTarget.parentElement?.querySelector('input')?.focus() }}><X size={16} aria-hidden="true" /></button> : null}</div>
}
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={`ui-input ui-textarea ${className}`} {...props} /> }

export interface SettingsNavItem<T extends string> { id: T; label: string; icon: (active: boolean) => ReactNode }
export function SettingsNavigation<T extends string>({ label, items, value, onChange, footer }: { label: string; items: SettingsNavItem<T>[]; value: T; onChange: (value: T) => void; footer?: ReactNode }) {
  return <nav className="settings-navigation ui-navigation" aria-label={label}>{items.map((item) => <button type="button" key={item.id} className="ui-navigation__item" aria-current={item.id === value ? 'page' : undefined} onClick={() => onChange(item.id)}>{item.icon(item.id === value)}<span>{item.label}</span></button>)}{footer}</nav>
}
