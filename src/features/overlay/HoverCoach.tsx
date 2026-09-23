import { Mouse } from 'lucide-react'

export function HoverCoach({ label }: { label: string }) {
  return <div className="hover-coach" aria-live="polite" role="status">
    <div className="hover-coach__cursor" aria-hidden="true"><Mouse size={25} strokeWidth={1.7} /><span className="hover-coach__trail" /></div>
    <p className="hover-coach__label">{label}</p>
  </div>
}
