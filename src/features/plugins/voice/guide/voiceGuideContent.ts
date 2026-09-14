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
  lead: 'Для приложений, где шумоподавления нет или его недостаточно. Better Voice убирает фоновый шум и передаёт обработанный голос через виртуальный микрофон.',
  localNote: 'Звук обрабатывается на вашем компьютере.',
  stepsLabel: 'Первое подключение',
  steps: [
    {
      id: 'install',
      title: 'Установите VB-Cable',
      text: 'Скачайте драйвер для Windows с сайта VB-Audio. Распакуйте архив, запустите установщик от имени администратора и перезагрузите компьютер.',
      note: 'Если VB-Cable уже установлен, переходите к шагу 2.',
      action: 'download',
    },
    {
      id: 'microphone',
      title: 'Выберите свой микрофон',
      text: 'В Better Voice откройте раздел «Устройства». В поле «Микрофон» выберите устройство, в которое говорите.',
    },
    {
      id: 'output',
      title: 'Направьте звук в кабель',
      text: 'В том же разделе выберите CABLE Input. Сюда Better Voice отправит обработанный голос.',
      device: { label: 'Better Voice · Виртуальный выход', value: 'CABLE Input' },
    },
    {
      id: 'app',
      title: 'Выберите кабель в нужном приложении',
      text: 'Откройте настройки звука приложения и выберите CABLE Output как микрофон. Так оно получит звук из Better Voice.',
      device: { label: 'Ваше приложение · Микрофон', value: 'CABLE Output' },
    },
    {
      id: 'start',
      title: 'Включите обработку',
      text: 'Вернитесь в Better Voice и нажмите «Включить обработку». Говорите в микрофон: индикаторы уровня должны двигаться.',
      note: 'Оставьте Music Island запущенным, пока используете этот микрофон.',
    },
  ],
  helpTitle: 'Если не получается',
  help: [
    {
      title: 'Нет CABLE Input или CABLE Output',
      text: 'Перезагрузите компьютер после установки VB-Cable и заново откройте приложение. Если устройства не появились, проверьте, завершилась ли установка драйвера.',
    },
    {
      title: 'Меня не слышно',
      text: 'Проверьте, что обработка включена. В Better Voice должны быть выбраны ваш микрофон и CABLE Input, а в нужном приложении — CABLE Output.',
    },
    {
      title: 'Слышу себя или эхо',
      text: 'Выключите «Прослушивать себя» в Better Voice. Если используете колонки, попробуйте наушники.',
    },
  ],
  back: 'Назад',
  returnToSettings: 'К настройке микрофона',
}

const en: GuideDoc = {
  title: 'Connect Better Voice',
  lead: 'For apps with limited or no noise suppression. Better Voice reduces background noise and sends processed audio through a virtual microphone.',
  localNote: 'Audio is processed on your computer.',
  stepsLabel: 'First-time setup',
  steps: [
    {
      id: 'install',
      title: 'Install VB-Cable',
      text: 'Download the Windows driver from VB-Audio. Extract the archive, run the installer as administrator, then restart your computer.',
      note: 'If VB-Cable is already installed, continue to step 2.',
      action: 'download',
    },
    {
      id: 'microphone',
      title: 'Choose your microphone',
      text: 'Open Devices in Better Voice. Under Microphone, choose the device you speak into.',
    },
    {
      id: 'output',
      title: 'Send audio to the cable',
      text: 'In the same section, choose CABLE Input. Better Voice sends your processed audio here.',
      device: { label: 'Better Voice · Virtual output', value: 'CABLE Input' },
    },
    {
      id: 'app',
      title: 'Choose the cable in your app',
      text: 'Open the app’s audio settings and select CABLE Output as its microphone. This receives audio from Better Voice.',
      device: { label: 'Your app · Microphone', value: 'CABLE Output' },
    },
    {
      id: 'start',
      title: 'Start processing',
      text: 'Return to Better Voice and select Start processing. Speak into your microphone: the level meters should move.',
      note: 'Keep Music Island running while you use this microphone.',
    },
  ],
  helpTitle: 'Troubleshooting',
  help: [
    {
      title: 'CABLE Input or CABLE Output is missing',
      text: 'Restart your computer after installing VB-Cable, then reopen the app. If the devices are still missing, check that the driver installation completed.',
    },
    {
      title: 'Nobody can hear me',
      text: 'Check that processing is on. Better Voice should use your microphone and CABLE Input. Your other app should use CABLE Output.',
    },
    {
      title: 'I hear myself or an echo',
      text: 'Turn off Hear yourself in Better Voice. If you use speakers, try headphones.',
    },
  ],
  back: 'Back',
  returnToSettings: 'Back to microphone settings',
}

export function getVoiceGuide(locale: Locale): GuideDoc {
  return locale === 'en' ? en : ru
}
