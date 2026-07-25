import type { Locale } from '../lib/types'

const ru = {
  'settings.title': 'Настройки',
  'settings.island': 'Островок',
  'settings.reset': 'Сбросить',
  'settings.width': 'Ширина',
  'settings.widthHint': 'Ширина раскрытого островка',
  'settings.scale': 'Масштаб',
  'settings.scaleHint': 'Пропорционально уменьшает весь интерфейс',
  'settings.hoverDelay': 'Задержка открытия',
  'settings.hoverDelayHint': 'Как долго удерживать каплю до раскрытия',
  'settings.source': 'Источник музыки',
  'settings.preferredSource': 'Предпочитаемый источник',
  'settings.preferredSourceHint': 'Auto сохраняет текущий играющий источник',
  'settings.smtcHint': 'Универсальный системный протокол',
  'settings.sessions': 'сесс.',
  'settings.use': 'Использовать',
  'settings.active': 'Активен',
  'settings.connect': 'Подключить',
  'settings.disconnect': 'Отключить',
  'settings.restart': 'Перезапустить',
  'settings.restarting': 'Перезапуск…',
  'settings.system': 'Система',
  'settings.launchAtStartup': 'Запускать вместе с Windows',
  'settings.autostartOk': 'Автозапуск прописан успешно',
  'settings.autostartFail': 'Ошибка автозапуска',
  'settings.autostartFile': 'Файл',
  'settings.copyDiagnostics': 'Скопировать диагностику',
  'settings.about': 'О программе',
  'settings.aboutBody':
    'Неофициальный Windows-островок для управления музыкой. Автор — redheadesign: дизайн, продуктовые эксперименты и заметки о разработке в Telegram-канале.',
  'settings.aboutLicense':
    'Можно использовать, изучать и изменять по GPL-3.0. Проект не связан с Apple, Microsoft, Spotify или Яндексом.',
  'settings.githubSource': 'GitHub · исходники',
  'settings.license': 'Лицензия · GPL-3.0',
  'settings.loading': 'Загрузка настроек…',
  'settings.minimize': 'Свернуть',
  'settings.close': 'Закрыть',
  'consent.title': 'Прямое подключение к Yandex Music',
  'consent.body':
    'Music Island сначала подключится к уже открытому локальному endpoint. Перезапуск клиента нужен только если endpoint отсутствует.',
  'consent.li1': 'endpoint доступен только через 127.0.0.1;',
  'consent.li2': 'интеграция экспериментальная и может сломаться после обновления клиента;',
  'consent.li3': 'вернуться на Windows SMTC можно в любой момент.',
  'consent.cancel': 'Отмена',
  'consent.close': 'Закрыть',
  'consent.connecting': 'Подключение…',
  'direct.disabled': 'Активен Windows SMTC',
  'direct.connecting': 'Подключение к Direct…',
  'direct.connected': 'Direct-подключение активно',
  'direct.degraded': 'Direct переподключается…',
  'direct.restartRequired': 'Endpoint Direct не запущен. Переподключите в настройках.',
  'direct.incompatible': 'Клиент Yandex Music несовместим с Direct',
  'direct.error': 'Ошибка Direct-подключения',
  'music.smtcUnavailable': 'SMTC недоступен',
  'music.smtcUnavailableHint': 'Протокол Windows media завис. Перезагрузите Windows.',
  'music.noSession': 'Ничего не играет',
  'music.noSessionHint': 'Запустите любой источник Windows media.',
  'music.directOffline': 'Direct не подключён',
  'music.directOfflineHint':
    'После перезапуска Windows или сбоя протокола нажмите «Быстрая перезагрузка».',
  'music.quickReload': 'Быстрая перезагрузка',
  'music.reloading': 'Перезагрузка…',
  'music.unknownTrack': 'Неизвестный трек',
  'music.directDropped': 'Протокол Direct отвалился — нужна перезагрузка',
  'music.favorite': 'Любимое',
} as const

type MessageKey = keyof typeof ru

const en: Record<MessageKey, string> = {
  'settings.title': 'Settings',
  'settings.island': 'Island',
  'settings.reset': 'Reset',
  'settings.width': 'Width',
  'settings.widthHint': 'Width of the expanded island',
  'settings.scale': 'Scale',
  'settings.scaleHint': 'Scales the whole interface proportionally',
  'settings.hoverDelay': 'Open delay',
  'settings.hoverDelayHint': 'How long to hold the droplet before it expands',
  'settings.source': 'Music source',
  'settings.preferredSource': 'Preferred source',
  'settings.preferredSourceHint': 'Auto keeps the currently playing source',
  'settings.smtcHint': 'Universal system media protocol',
  'settings.sessions': 'sess.',
  'settings.use': 'Use',
  'settings.active': 'Active',
  'settings.connect': 'Connect',
  'settings.disconnect': 'Disconnect',
  'settings.restart': 'Restart',
  'settings.restarting': 'Restarting…',
  'settings.system': 'System',
  'settings.launchAtStartup': 'Launch with Windows',
  'settings.autostartOk': 'Autostart registered successfully',
  'settings.autostartFail': 'Autostart error',
  'settings.autostartFile': 'File',
  'settings.copyDiagnostics': 'Copy diagnostics',
  'settings.about': 'About',
  'settings.aboutBody':
    'Unofficial Windows island for music control. Made by redheadesign — design, product experiments, and build notes on Telegram.',
  'settings.aboutLicense':
    'Free to use, study, and modify under GPL-3.0. Not affiliated with Apple, Microsoft, Spotify, or Yandex.',
  'settings.githubSource': 'GitHub · source',
  'settings.license': 'License · GPL-3.0',
  'settings.loading': 'Loading settings…',
  'settings.minimize': 'Minimize',
  'settings.close': 'Close',
  'consent.title': 'Direct connection to Yandex Music',
  'consent.body':
    'Music Island will first attach to an already open local endpoint. Restarting the client is only needed when the endpoint is missing.',
  'consent.li1': 'the endpoint is available only on 127.0.0.1;',
  'consent.li2': 'the integration is experimental and may break after a client update;',
  'consent.li3': 'you can switch back to Windows SMTC at any time.',
  'consent.cancel': 'Cancel',
  'consent.close': 'Close',
  'consent.connecting': 'Connecting…',
  'direct.disabled': 'Windows SMTC is active',
  'direct.connecting': 'Connecting to Direct…',
  'direct.connected': 'Direct connection is active',
  'direct.degraded': 'Reconnecting Direct…',
  'direct.restartRequired': 'Direct endpoint is not running. Reconnect in Settings.',
  'direct.incompatible': 'Yandex Music client is incompatible with Direct',
  'direct.error': 'Direct connection error',
  'music.smtcUnavailable': 'SMTC unavailable',
  'music.smtcUnavailableHint': 'Windows media protocol is stuck. Restart Windows.',
  'music.noSession': 'No music playing',
  'music.noSessionHint': 'Start any Windows media source.',
  'music.directOffline': 'Direct is offline',
  'music.directOfflineHint':
    'After a Windows reboot or protocol failure, press Quick reload.',
  'music.quickReload': 'Quick reload',
  'music.reloading': 'Reloading…',
  'music.unknownTrack': 'Unknown track',
  'music.directDropped': 'Direct protocol dropped — reload required',
  'music.favorite': 'Liked',
}

const catalogs: Record<Locale, Record<MessageKey, string>> = { ru, en }

export type { MessageKey }

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'ru'
}

export function createTranslator(locale: Locale) {
  const catalog = catalogs[normalizeLocale(locale)]
  return (key: MessageKey): string => catalog[key] ?? ru[key]
}

export function directStatusMessage(
  state: string,
  fallback: string,
  t: (key: MessageKey) => string,
): string {
  switch (state) {
    case 'disabled':
      return t('direct.disabled')
    case 'connecting':
      return t('direct.connecting')
    case 'connected':
      return t('direct.connected')
    case 'degraded':
      return t('direct.degraded')
    case 'restart-required':
      return t('direct.restartRequired')
    case 'incompatible':
      return t('direct.incompatible')
    case 'error':
      return fallback.trim() || t('direct.error')
    default:
      return fallback
  }
}
