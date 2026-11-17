/** One optical filter per document. Only an actively hovered control uses it. */
export function GlassRefraction() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        <filter id="music-island-glass-rim" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".016 .039" numOctaves="1" seed="11" result="rimNormals" />
          <feDisplacementMap in="SourceGraphic" in2="rimNormals" scale="8" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation=".55" />
        </filter>
      </defs>
    </svg>
  )
}
