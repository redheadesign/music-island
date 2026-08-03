import type { Locale } from '../../../../shared/lib/types'

export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; text: string }

export type GuideSection = {
  id: string
  title: string
  blocks: GuideBlock[]
}

export type GuideDoc = {
  title: string
  lead: string
  sections: GuideSection[]
}

const ru: GuideDoc = {
  title: 'Справка Better Voice',
  lead:
    'Better Voice чистит голос в реальном времени и отдаёт его в виртуальный микрофон. Так Discord, Zoom и браузер слышат уже обработанный звук.',
  sections: [
    {
      id: 'what',
      title: 'Зачем это нужно',
      blocks: [
        {
          type: 'p',
          text: 'Обычные приложения видят только микрофоны из списка Windows. Они не умеют подключаться «внутрь» Music Island. Поэтому нужен виртуальный кабель: Better Voice пишет в него, а приложения берут его как микрофон.',
        },
        {
          type: 'ul',
          items: [
            'Шумодав убирает фон и клавиатуру',
            'Усиление и EQ выравнивают громкость и тембр',
            'В созвоне или записи слышен уже чистый голос',
          ],
        },
      ],
    },
    {
      id: 'route',
      title: 'Как идёт звук',
      blocks: [
        {
          type: 'ol',
          items: [
            'Реальный микрофон → вход Better Voice',
            'Обработка (шум, громкость, EQ, эффекты)',
            'Выход в CABLE Input',
            'В Discord / Zoom / браузере микрофон → CABLE Output',
          ],
        },
        {
          type: 'callout',
          text: 'CABLE Input — куда пишет Better Voice. CABLE Output — что выбирают другие приложения как микрофон.',
        },
      ],
    },
    {
      id: 'drivers',
      title: 'Установка VB-Cable',
      blocks: [
        {
          type: 'p',
          text: 'Один раз ставится бесплатный подписанный драйвер VB-Cable с официального сайта. Это тот же принцип, что у встроенного виртуального мика в Krisp.',
        },
        {
          type: 'ol',
          items: [
            'Открой vb-audio.com/Cable',
            'Скачай VB-Cable и запусти установщик от имени администратора',
            'Пройди мастер. Если Windows попросит перезагрузку — перезагрузись',
            'В Better Voice: микрофон — твой реальный вход, виртуальный выход — CABLE Input',
            'В Discord / Zoom / браузере: микрофон — CABLE Output',
            'Нажми Старт и говори',
          ],
        },
      ],
    },
    {
      id: 'controls',
      title: 'Основные кнопки',
      blocks: [
        {
          type: 'ul',
          items: [
            'Старт / Стоп — включает и выключает обработку',
            'Прослушать себя — слышишь финальный микс в наушниках или колонках',
            'Эхо, Робот, Перегруз — короткие эффекты поверх голоса',
            'Шумодав, громкость и EQ — постоянная обработка',
          ],
        },
      ],
    },
    {
      id: 'problems',
      title: 'Если что-то не работает',
      blocks: [
        {
          type: 'h3',
          text: 'В приложении нет CABLE Output',
        },
        {
          type: 'p',
          text: 'Драйвер не установился или нужна перезагрузка Windows. Поставь VB-Cable ещё раз от администратора.',
        },
        {
          type: 'h3',
          text: 'Тебя не слышно',
        },
        {
          type: 'ul',
          items: [
            'Better Voice запущен (Старт)',
            'Виртуальный выход — CABLE Input',
            'В созвоне выбран микрофон CABLE Output, а не обычный мик',
          ],
        },
        {
          type: 'h3',
          text: 'Слышен сырой микрофон',
        },
        {
          type: 'p',
          text: 'В приложении созвона всё ещё выбран реальный микрофон. Переключи на CABLE Output.',
        },
        {
          type: 'h3',
          text: 'Эхо или слышишь сам себя',
        },
        {
          type: 'p',
          text: 'Выключи «Прослушать себя» или убавь громкость колонок. Для созвонов удобнее наушники.',
        },
      ],
    },
    {
      id: 'faq',
      title: 'Частые вопросы',
      blocks: [
        {
          type: 'h3',
          text: 'Нужна ли отдельная программа рядом с Music Island?',
        },
        {
          type: 'p',
          text: 'Нет. Better Voice уже внутри Music Island. Нужен только драйвер VB-Cable в Windows.',
        },
        {
          type: 'h3',
          text: 'Это безопасно?',
        },
        {
          type: 'p',
          text: 'VB-Cable — известный подписанный драйвер. Music Island обрабатывает звук локально и не отправляет голос на сервер для шумодава.',
        },
        {
          type: 'h3',
          text: 'Почему функция в бете?',
        },
        {
          type: 'p',
          text: 'Интерфейс и часть сценариев ещё дорабатываются. Основной маршрут — мик → обработка → CABLE — уже рабочий.',
        },
      ],
    },
  ],
}

const en: GuideDoc = {
  title: 'Better Voice help',
  lead:
    'Better Voice cleans your mic in real time and sends it to a virtual microphone, so Discord, Zoom, and browsers hear the processed voice.',
  sections: [
    {
      id: 'what',
      title: 'Why you need it',
      blocks: [
        {
          type: 'p',
          text: 'Apps only see microphones listed by Windows. They cannot tap into Music Island directly. A virtual cable bridges that gap: Better Voice writes into it, apps pick it as the mic.',
        },
        {
          type: 'ul',
          items: [
            'Denoise cuts background noise and keyboard clicks',
            'Gain and EQ keep level and tone steady',
            'Calls and recordings get the cleaned voice',
          ],
        },
      ],
    },
    {
      id: 'route',
      title: 'Signal path',
      blocks: [
        {
          type: 'ol',
          items: [
            'Hardware mic → Better Voice input',
            'Processing (noise, gain, EQ, effects)',
            'Output to CABLE Input',
            'In Discord / Zoom / browser: mic → CABLE Output',
          ],
        },
        {
          type: 'callout',
          text: 'CABLE Input is where Better Voice writes. CABLE Output is what other apps select as the microphone.',
        },
      ],
    },
    {
      id: 'drivers',
      title: 'Install VB-Cable',
      blocks: [
        {
          type: 'p',
          text: 'Install the free signed VB-Cable driver once from the official site — same idea as Krisp’s built-in virtual mic.',
        },
        {
          type: 'ol',
          items: [
            'Open vb-audio.com/Cable',
            'Download VB-Cable and run the installer as Administrator',
            'Finish the wizard. Reboot if Windows asks',
            'In Better Voice: input = your real mic, virtual output = CABLE Input',
            'In Discord / Zoom / browser: mic = CABLE Output',
            'Press Start and talk',
          ],
        },
      ],
    },
    {
      id: 'controls',
      title: 'Main controls',
      blocks: [
        {
          type: 'ul',
          items: [
            'Start / Stop — turns processing on and off',
            'Monitor — hear the final mix in your headphones or speakers',
            'Echo, Robot, Distortion — short voice effects',
            'Denoise, gain, and EQ — ongoing processing',
          ],
        },
      ],
    },
    {
      id: 'problems',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'h3',
          text: 'No CABLE Output in the app',
        },
        {
          type: 'p',
          text: 'The driver is missing or Windows needs a reboot. Reinstall VB-Cable as Administrator.',
        },
        {
          type: 'h3',
          text: 'Nobody can hear you',
        },
        {
          type: 'ul',
          items: [
            'Better Voice is running (Start)',
            'Virtual output is CABLE Input',
            'The call app uses CABLE Output, not your hardware mic',
          ],
        },
        {
          type: 'h3',
          text: 'They hear the raw mic',
        },
        {
          type: 'p',
          text: 'The call app still uses your real microphone. Switch it to CABLE Output.',
        },
        {
          type: 'h3',
          text: 'Echo or you hear yourself',
        },
        {
          type: 'p',
          text: 'Turn off Monitor or lower speaker volume. Headphones are easier for calls.',
        },
      ],
    },
    {
      id: 'faq',
      title: 'FAQ',
      blocks: [
        {
          type: 'h3',
          text: 'Do I need a separate app next to Music Island?',
        },
        {
          type: 'p',
          text: 'No. Better Voice is built in. You only need the VB-Cable Windows driver.',
        },
        {
          type: 'h3',
          text: 'Is it safe?',
        },
        {
          type: 'p',
          text: 'VB-Cable is a well-known signed driver. Music Island processes audio locally and does not upload your voice for denoising.',
        },
        {
          type: 'h3',
          text: 'Why is it beta?',
        },
        {
          type: 'p',
          text: 'The UI and some edge cases are still being polished. The core route — mic → process → CABLE — already works.',
        },
      ],
    },
  ],
}

export function getVoiceGuide(locale: Locale): GuideDoc {
  return locale === 'en' ? en : ru
}
