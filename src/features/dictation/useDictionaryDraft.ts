import { useRef, useState } from 'react'

/** Keep edits while the user visits other dictation pages or a disk write fails. */
export function useDictionaryDraft(stored: string[] | null | undefined, write: (words: string[]) => Promise<unknown>) {
  const [draft, setDraft] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const latest = useRef<string | null>(null)
  const revision = useRef(0)
  const queued = useRef(-1)
  const chain = useRef(Promise.resolve())
  const value = draft ?? (stored ?? []).join('\n')
  const edit = (text: string) => {
    revision.current++
    latest.current = text
    setDraft(text); setFailed(false)
  }
  const save = () => {
    const text = latest.current
    const edited = revision.current
    if (text === null || queued.current === edited) return
    queued.current = edited
    const words = text.split('\n').map(word => word.trim()).filter(Boolean)
    chain.current = chain.current.then(async () => {
      try {
        await write(words)
        if (revision.current === edited) { latest.current = null; setDraft(null); setFailed(false) }
      } catch { if (revision.current === edited) setFailed(true) }
      finally { if (queued.current === edited) queued.current = -1 }
    })
  }
  return { value, edit, save, failed }
}
