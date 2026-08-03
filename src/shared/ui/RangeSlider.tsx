import type { CSSProperties, InputHTMLAttributes } from 'react'

type RangeSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value: number
  min?: number
  max?: number
}

/** Range input with primary-colored fill up to the thumb. */
export function RangeSlider({
  value,
  min = 0,
  max = 100,
  className,
  style,
  ...rest
}: RangeSliderProps) {
  const lo = Number(min)
  const hi = Number(max)
  const fill = hi === lo ? 0 : ((Number(value) - lo) / (hi - lo)) * 100
  const mergedStyle = {
    ...style,
    ['--range-fill' as string]: `${Math.min(100, Math.max(0, fill))}%`,
  } as CSSProperties

  return (
    <input
      type="range"
      className={className}
      min={min}
      max={max}
      value={value}
      style={mergedStyle}
      {...rest}
    />
  )
}
