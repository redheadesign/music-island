import { useEffect, useRef, type ReactNode } from 'react'
import './Modal.css'

/** Native top layer supplies focus containment, Escape and return-focus behavior. */
export function Modal({ label, onClose, children, className, open = true }: { label: string; onClose: () => void; children: ReactNode; className?: string; open?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (open) dialog?.showModal()
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [open])
  if (!open) return null
  return <dialog ref={ref} className={`app-modal ${className ?? ''}`} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose() }}>{children}</dialog>
}
