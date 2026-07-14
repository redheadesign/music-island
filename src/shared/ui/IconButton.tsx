import type { ButtonHTMLAttributes } from 'react'

export function IconButton({
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`glass-icon-button ${className}`.trim()} {...props} />
}
