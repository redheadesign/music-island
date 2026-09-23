/** Shared presentation for the real top edge and the deterministic release demo. */
export function IslandTopIndicator({ progressPercent, hidden = false }: { progressPercent: number; hidden?: boolean }) {
  return <><span className="edge-peek" aria-hidden="true" /><span className={`collapsed-progress${hidden ? ' collapsed-progress--hidden' : ''}`}><span className="collapsed-progress__fill" style={{ transform: `scaleX(${progressPercent / 100})` }} /></span></>
}
