import type { Preview } from '@storybook/react-vite'
import { themes } from 'storybook/theming'
import { WorkshopFrame } from '../src/stories/WorkshopFrame'
import { resetDictationPreview } from '../src/stories/mocks/dictationApi'
import { resetVoicePreview } from '../src/stories/mocks/voiceApi'
import { resetVoiceSession } from '../src/stories/mocks/voiceSession'
import { resetNativePreview } from '../src/stories/mocks/tauriApi'
import '../src/index.css'
import '../src/App.css'
import '../src/stories/workshop.css'

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'Язык компонентов',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'ru', title: 'Русский' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
    accent: {
      description: 'Акцент интерфейса',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: '#f76100', title: 'Оранжевый' },
          { value: '#b7a5ff', title: 'Лавандовый' },
          { value: '#6bd8ff', title: 'Голубой' },
          { value: '#9fe1bd', title: 'Мятный' },
        ],
        dynamicTitle: true,
      },
    },
    surface: {
      description: 'Фон для проверки стекла и прозрачности',
      toolbar: {
        icon: 'photo',
        items: [
          { value: 'studio', title: 'Студия' },
          { value: 'desktop', title: 'Рабочий стол' },
          { value: 'checker', title: 'Прозрачность' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'ru', accent: '#f76100', surface: 'studio' },
  parameters: {
    layout: 'fullscreen',
    controls: {
      expanded: true,
      sort: 'requiredFirst',
      matchers: { color: /(color|background)$/i },
    },
    docs: { theme: themes.dark, codePanel: true },
    a11y: { test: 'todo' },
    options: {
      storySort: {
        order: [
          'Welcome',
          'Foundations',
          'Atoms',
          'Molecules',
          'Organisms',
          'Screens',
        ],
      },
    },
    viewport: {
      options: {
        narrow: {
          name: 'Узкая область · 360',
          styles: { width: '360px', height: '800px' },
        },
        settings: {
          name: 'Настройки · 760',
          styles: { width: '760px', height: '900px' },
        },
        desktop: {
          name: 'Рабочий стол · 1280',
          styles: { width: '1280px', height: '800px' },
        },
      },
    },
  },
  beforeEach(context) {
    resetNativePreview(context.parameters.nativePreview)
    resetDictationPreview()
    resetVoicePreview(context.parameters.voicePreview)
    resetVoiceSession()
  },
  decorators: [
    (Story, context) => (
      <WorkshopFrame key={context.id} context={context}>
        <Story />
      </WorkshopFrame>
    ),
  ],
}

export default preview
