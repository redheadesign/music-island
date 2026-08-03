/** Colored brand marks for social / external links. */

export function TelegramBrandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M17.6 7.2c.2-.8-.5-1.2-1.2-.9L5.7 10.3c-.7.3-.7.8-.1 1l2.8.9 1.1 3.4c.1.4.4.5.7.3l1.5-1.2 2.9 2.1c.5.3 1 .1 1.1-.5l1.9-9.1Zm-2.4 1.5-5.7 5.1-.3 2.1-.9-2.7 6.9-4.5Z"
      />
    </svg>
  )
}

export function GitHubBrandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#F78166" />
      <path
        fill="#fff"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 5.4c-3.5 0-6.3 2.8-6.3 6.3 0 2.8 1.8 5.2 4.3 6 .3.1.4-.1.4-.3v-1.2c-1.8.4-2.1-.8-2.1-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.6.1 1 .7 1 .7.6 1 1.6.7 2 .5.1-.4.2-.7.4-.8-1.4-.2-2.9-.7-2.9-3.2 0-.7.3-1.3.7-1.8-.1-.2-.3-.9.1-1.8 0 0 .6-.2 1.9.7a6.5 6.5 0 0 1 3.4 0c1.3-.9 1.9-.7 1.9-.7.4.9.2 1.6.1 1.8.4.5.7 1.1.7 1.8 0 2.5-1.5 3-2.9 3.2.2.2.4.6.4 1.2v1.8c0 .2.1.4.4.3 2.5-.8 4.3-3.2 4.3-6 0-3.5-2.8-6.3-6.3-6.3Z"
      />
    </svg>
  )
}
