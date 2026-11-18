import { INTERFACE_THEMES, type ThemeDefinition } from '../src/shared/lib/interfaceTheme.ts'

export const workshopThemes = {
  ...INTERFACE_THEMES,
  'workshop-contract': {
    material: 'glass',
    label: { ru: 'Проверка тем', en: 'Theme contract' },
    roles: { '--font-sans': 'Georgia, serif', '--space-unit': '6px', '--radius-unit': '7px', '--control-height': '46px' },
    schemes: {
      dark: { '--fg-primary': '#d6edc5', '--surface-raised': '#314329' },
      light: {
        '--fg-primary': '#385123', '--surface-raised': '#e8efdd',
        '--glass-selection-fill': '#385123', '--glass-selection-ink': '#ffffff',
      },
    },
  },
} satisfies Record<string, ThemeDefinition>
