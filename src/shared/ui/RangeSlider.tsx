import { useState, type CSSProperties, type InputHTMLAttributes } from 'react'
import './RangeSlider.css'

type RangeSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue'> & {
  min?: number
  max?: number
} & ({ value: number; defaultValue?: never } | { value?: never; defaultValue: number })

/** Range input with primary-colored fill up to the thumb. */
export function RangeSlider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  className,
  style,
  onChange,
  ...rest
}: RangeSliderProps) {
  const [localValue, setLocalValue] = useState(defaultValue ?? min)
  const displayedValue = value ?? localValue
  const fill = max === min ? 0 : ((displayedValue - min) / (max - min)) * 100
  const mergedStyle = {
    ...style,
    ['--range-fill' as string]: `${Math.min(100, Math.max(0, fill))}%`,
  } as CSSProperties

  return (
    <input
      type="range"
      className={['range-slider', className].filter(Boolean).join(' ')}
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      style={mergedStyle}
      {...rest}
      onChange={event => {
        if (value === undefined) setLocalValue(event.currentTarget.valueAsNumber)
        onChange?.(event)
      }}
    />
  )
}
