import './SegmentedControl.css'

export function SegmentedControl<T extends string>({ label, options, value, onChange, className = '' }: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return <div className={`ui-segments ${className}`} role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
      onClick={() => { if (value !== option.value) onChange(option.value) }}>{option.label}</button>)}
  </div>
}
