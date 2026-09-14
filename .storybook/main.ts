import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const previewMocks = new Map(
  [
    ['src/app/tauriApi.ts', 'src/stories/mocks/tauriApi.ts'],
    ['src/app/usage/usageApi.ts', 'src/stories/mocks/usageApi.ts'],
    [
      'src/features/plugins/voice/pluginApi.ts',
      'src/stories/mocks/voiceApi.ts',
    ],
    [
      'src/features/plugins/voice/session.ts',
      'src/stories/mocks/voiceSession.ts',
    ],
  ].map(([source, mock]) => [
    path.resolve(root, source),
    // Vite's module graph uses slash-separated IDs on Windows too. Returning
    // backslashes creates a second mock instance, disconnected from beforeEach.
    path.resolve(root, mock).replaceAll('\\', '/'),
  ]),
)

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  typescript: { reactDocgen: 'react-docgen-typescript' },
  async viteFinal(config) {
    // Only the component workshop substitutes native adapters.
    // The application's Vite/Tauri build continues to use the real modules.
    config.plugins = [
      {
        name: 'music-island-storybook-mocks',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer || !source.startsWith('.')) return
          if (path.resolve(importer.split('?')[0]) === path.resolve(root, 'src/stories/mocks/tauriApi.ts')) return
          const resolved = path.resolve(
            path.dirname(importer.split('?')[0]),
            source,
          )
          return (
            previewMocks.get(resolved) ?? previewMocks.get(`${resolved}.ts`)
          )
        },
      },
      ...(config.plugins ?? []),
    ]
    config.server = {
      ...config.server,
      host: '127.0.0.1',
      watch: { ...config.server?.watch, ignored: ['**/.local/**', '**/src-tauri/**', `${path.resolve(root, 'release').replaceAll('\\', '/')}/**`, '**/storybook-static/**'] },
    }
    return config
  },
}

export default config
