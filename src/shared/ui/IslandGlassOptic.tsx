import { memo, useId, type CSSProperties } from 'react'
import 'glisse/styles.css'
import bezelField from './glisse-bezel.png?inline'
import './IslandGlassOptic.css'

/** Windows supplies the desktop frost. Browser previews use the original
 * Glisse field; the player rim is already baked at 2x for either renderer. */
export const IslandGlassOptic = memo(function IslandGlassOptic({ active = true, refract = false }: {
  active?: boolean
  refract?: boolean
}) {
  const id = useId()
  const filterId = `glisse-bezel-${id}`
  const hasField = active && refract
  const style = hasField ? { '--island-optic-filter': `url("#${filterId}")` } as CSSProperties : undefined
  return <div className="island-glass-optic" data-glass-surface={refract ? 'player' : 'capsule'} data-active={active || undefined} aria-hidden="true" style={style}>
    {hasField && <svg width="0" height="0" focusable="false" aria-hidden="true">
      <defs>
        <filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={bezelField} x="0%" y="0%" width="100%" height="100%" preserveAspectRatio="none" result="field" />
          <feDisplacementMap in="SourceGraphic" in2="field" scale="15" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>}
    <span className="lg-glass" />
  </div>
})
