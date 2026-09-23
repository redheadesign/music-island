import type { ImgHTMLAttributes } from 'react'
import appIcon from '../../../assets/app-icon.svg'
import portraitIcon from '../../../assets/app-icon-portrait.svg'
import introIcon from '../../../assets/app-icon-intro.svg'

const variants = { standard: appIcon, portrait: portraitIcon, intro: introIcon }
/** Portraits are explicit: functional and small placements always use the white center. */
export function AppLogo({ size = 80, alt = '', variant = 'standard', ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> & { size?: number; variant?: keyof typeof variants }) {
  return <img {...props} src={variants[variant]} alt={alt} width={size} height={size} draggable={false} />
}
