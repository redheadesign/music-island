import { addons } from 'storybook/manager-api'
import { create } from 'storybook/theming'

addons.setConfig({
  theme: create({
    base: 'dark',
    brandTitle: 'Music Island · UI',
    brandUrl: '/?path=/story/welcome--start',
    brandTarget: '_self',
    colorPrimary: '#f76100',
    colorSecondary: '#ff9a55',
    appBg: '#111216',
    appContentBg: '#15161b',
    appPreviewBg: '#15161b',
    appBorderColor: '#2a2b32',
    barBg: '#191a20',
    textColor: '#ececf1',
    fontBase: 'Inter, "Segoe UI", sans-serif',
  }),
  sidebar: { showRoots: true },
})
