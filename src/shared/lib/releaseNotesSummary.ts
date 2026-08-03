import type { Locale } from './types'

/** Short user-facing bullets from a GitHub release body / changelog dump. */
export function summarizeReleaseNotes(
  body: string | null | undefined,
  locale: Locale,
): string[] {
  const fixedBugs =
    locale === 'ru' ? 'Исправили ошибки и стабильность' : 'Bug fixes and stability improvements'
  const empty =
    locale === 'ru' ? 'Небольшие улучшения' : 'Small improvements'

  if (!body?.trim()) return [empty]

  const lines = body
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const featureLike: string[] = []
  let sawBugOnly = false

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) continue
    if (/^[-*•]\s*known/i.test(line)) break
    if (/известн/i.test(line) && /issue|проблем/i.test(line)) break

    const bullet = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
    if (!bullet || bullet.length < 4) continue

    const isBug =
      /\b(fix|bug|issue|#\d+|crash|ошибк|баг|фикс|исправ)/i.test(bullet) ||
      /\(#[0-9]+\)/.test(bullet)

    if (isBug) {
      sawBugOnly = true
      continue
    }

    // Drop meta / legal / process noise
    if (
      /gpl|license|github|open beta|portable build|not pushed|smartscreen|unsigned/i.test(
        bullet,
      )
    ) {
      continue
    }

    const cleaned = bullet
      .replace(/\s*\(#[0-9]+\)\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned.length > 90) {
      featureLike.push(`${cleaned.slice(0, 87).trim()}…`)
    } else {
      featureLike.push(cleaned)
    }
    if (featureLike.length >= 4) break
  }

  if (featureLike.length === 0) {
    return sawBugOnly ? [fixedBugs] : [empty]
  }
  if (sawBugOnly) featureLike.push(fixedBugs)
  return featureLike.slice(0, 5)
}
