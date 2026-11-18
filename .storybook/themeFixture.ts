import { INTERFACE_THEMES, type ThemeDefinition } from '../src/shared/lib/interfaceTheme.ts'

export const workshopThemes = {
  ...INTERFACE_THEMES,
  'workshop-contract': {
    material: 'glass',
    label: { ru: 'Проверка тем', en: 'Theme contract' },
    roles: {
      '--font-sans': 'Georgia, serif', '--space-unit': '6px', '--radius-unit': '7px',
      '--control-height': '46px', '--fg-primary': '#d6edc5', '--surface-raised': '#314329',
    },
  },
} satisfies Record<string, ThemeDefinition>
