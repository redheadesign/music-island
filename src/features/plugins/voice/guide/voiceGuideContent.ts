import type { Locale } from '../../../../shared/lib/types'

type GuideStep = {
  id: string
  title: string
  text: string
  note?: string
  device?: { label: string; value: string }
  action?: 'download'
}

type GuideDoc = {
  title: string
  lead: string
  localNote: string
  stepsLabel: string
  steps: GuideStep[]
  helpTitle: string
  help: { title: string; text: string }[]
  back: string
  returnToSettings: string
}

const ru: GuideDoc = {
  title: 'Подключение Better Voice',
  lead: 'Better Voice убирает шум и передаёт голос в другие приложения через VB-Cable.',
  localNote: 'Обработка на компьютере.',
  stepsLabel: 'Первое подключение',
  steps: [
    {
      id: 'install',
      title: 'Установите VB-Cable',
      text: 'Скачайте и распакуйте драйвер. Запустите установщик от имени администратора и перезагрузите компьютер.',
      note: 'Уже установлен? Переходите к шагу 2.',
      action: 'download',
    },
    {
      id: 'microphone',
      title: 'Выберите свой микрофон',
      text: 'В «Микрофоне и эффектах» выберите устройство, в которое говорите.',
    },
    {
      id: 'output',
      title: 'Выберите выход',
      text: 'Выберите CABLE Input в поле «Виртуальный выход».',
      device: { label: 'Better Voice · Виртуальный выход', value: 'CABLE Input' },
    },
    {
      id: 'app',
      title: 'Выберите вход в приложении',
      text: 'В настройках звука выберите CABLE Output как микрофон.',
      device: { label: 'Ваше приложение · Микрофон', value: 'CABLE Output' },
    },
    {
      id: 'start',
      title: 'Включите обработку',
      text: 'В Better Voice нажмите «Включить». Говорите: уровни должны меняться.',
      note: 'Не закрывайте Music Island, пока нужен микрофон.',
    },
  ],
  helpTitle: 'Если не получается',
  help: [
    {
      title: 'Нет CABLE Input или CABLE Output',
      text: 'Перезагрузите компьютер и откройте приложение заново. Не помогло — проверьте установку VB-Cable.',
    },
    {
      title: 'Меня не слышно',
      text: 'Проверьте обработку, микрофон и CABLE Input в Better Voice. В другом приложении проверьте CABLE Output.',
    },
    {
      title: 'Слышу себя или эхо',
      text: 'Выключите «Прослушивать себя» или смените колонки на наушники.',
    },
  ],
  back: 'Назад',
  returnToSettings: 'К настройкам',
}

const en: GuideDoc = {
  title: 'Connect Better Voice',
  lead: 'Better Voice reduces noise and sends audio to other apps through VB-Cable.',
  localNote: 'Audio stays on your computer.',
  stepsLabel: 'First-time setup',
  steps: [
    {
      id: 'install',
      title: 'Install VB-Cable',
      text: 'Download and extract the driver. Run the installer as administrator, then restart.',
      note: 'Already installed? Go to step 2.',
      action: 'download',
    },
    {
      id: 'microphone',
      title: 'Choose your microphone',
      text: 'Choose the device you speak into under Microphone and effects.',
    },
    {
      id: 'output',
      title: 'Choose the output',
      text: 'Choose CABLE Input under Virtual output.',
      device: { label: 'Better Voice · Virtual output', value: 'CABLE Input' },
    },
    {
      id: 'app',
      title: 'Choose the input in your app',
      text: 'Set CABLE Output as the microphone in the app’s audio settings.',
      device: { label: 'Your app · Microphone', value: 'CABLE Output' },
    },
    {
      id: 'start',
      title: 'Start processing',
      text: 'Select Start in Better Voice. Speak and check that the meters move.',
      note: 'Keep Music Island running.',
    },
  ],
  helpTitle: 'Troubleshooting',
  help: [
    {
      title: 'CABLE Input or CABLE Output is missing',
      text: 'Restart the computer and reopen the app. If it persists, check the VB-Cable installation.',
    },
    {
      title: 'Nobody can hear me',
      text: 'Check processing, the microphone and CABLE Input in Better Voice. Check CABLE Output in the other app.',
    },
    {
      title: 'I hear myself or an echo',
      text: 'Turn off Hear yourself or switch from speakers to headphones.',
    },
  ],
  back: 'Back',
  returnToSettings: 'Back to settings',
}

export function getVoiceGuide(locale: Locale): GuideDoc {
  return locale === 'en' ? en : ru
}
