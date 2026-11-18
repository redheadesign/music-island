import { useId, type ReactNode } from 'react'
import './AppearanceChoices.css'

export function AppearanceChoices<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly { value: T; label: string; swatch: ReactNode }[]
  value: T
  onChange: (value: T) => void
}) {
  const name = useId()
  return <fieldset className="appearance-choices">
    <legend>{label}</legend>
    <div className="appearance-choices__options">
      {options.map(option => <label key={option.value} className="appearance-choices__item">
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span className="appearance-choices__face">{option.swatch}{option.label}</span>
      </label>)}
    </div>
  </fieldset>
}
