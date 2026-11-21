import { useId } from 'react'
import { ColorSwatches } from '../../shared/ui/ColorSwatches'
import { Switch } from '../../shared/ui/SettingsControls'
import { Check } from '../../shared/ui/SettingsIcons'
import { DEFAULT_GLASS_MATERIAL, type GlassMaterial } from '../../shared/lib/glassMaterial'
import { INTERFACE_THEMES, INTERFACE_THEME_IDS, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import { AppearanceChoices } from '../settings/AppearanceChoices'
import { GlassMaterialSettings } from '../settings/GlassMaterialSettings'
import { dictationThemes, dictationPalettes, dictationPaletteSwatches, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { DictationVisual } from './DictationVisual'

const themeNames = { classic: ['Классическая', 'Classic'], wave: ['Волны', 'Waves'], pixels: ['Лиса', 'Fox'] }
const paletteNames = { accent: ['Акцент', 'Accent'], white: ['Белый', 'White'], prism: ['Призма', 'Prism'], aurora: ['Аврора', 'Aurora'], lagoon: ['Лагуна', 'Lagoon'], sakura: ['Сакура', 'Sakura'], ember: ['Угли', 'Ember'], dune: ['Дюны', 'Dune'] }
const previewLevels = [.65]

export function DictationThemePicker({ value, islandGlass, onChange, locale }: { value: DictationAppearance; islandGlass: GlassMaterial; onChange: (value: DictationAppearance) => void; locale: 'ru' | 'en' }) {
  const ru = locale === 'ru', index = ru ? 0 : 1
  const id = useId()
  const t = (a: string, b: string) => ru ? a : b
  const patch = (next: Partial<DictationAppearance>) => onChange({ ...value, ...next })
  return <><section className="dictation-theme-selection">
    <div className="dictation-theme-picker" role="radiogroup" aria-label={t('Тема диктовки', 'Dictation theme')}>
      {dictationThemes.map(theme => <label className="dictation-theme-choice" key={theme} data-selected={value.theme === theme}>
        <input type="radio" name={`${id}-theme`} value={theme} checked={value.theme === theme} onChange={() => patch({ theme })} />
        <span className="dictation-theme-choice__art" aria-hidden="true"><DictationVisual appearance={{ ...value, theme }} phase={theme === 'pixels' ? 'preparing' : 'recording'} levels={previewLevels} still /></span>
        <span className="dictation-theme-choice__name">{themeNames[theme][index]}</span>
        {value.theme === theme ? <Check className="dictation-theme-choice__check" size={15} aria-hidden="true" /> : null}
      </label>)}
    </div>
  </section>
    <div className="dictation-card dictation-theme-options">
      {value.theme !== 'classic' && <ColorSwatches ariaLabel={t('Цвет диктовки', 'Dictation color')} value={value.palette} onChange={palette => patch({ palette })} options={dictationPalettes.map(palette => ({ value: palette, label: paletteNames[palette][index], color: dictationPaletteSwatches[palette] }))} />}
      {value.theme === 'wave' ? <Switch label={t('Цветные края волн', 'Colored wave edges')} checked={value.chromatic} onChange={chromatic => patch({ chromatic })} /> : null}
      <AppearanceChoices<InterfaceThemeId | 'island'>
        label={t('Материал капсулы', 'Capsule material')}
        value={value.materialTheme ?? 'island'}
        options={[
          { value: 'island', label: t('Как у островка', 'Match island'), swatch: null },
          ...INTERFACE_THEME_IDS.map(id => ({
            value: id, label: INTERFACE_THEMES[id].label[locale],
            swatch: <span aria-hidden="true" className="appearance-choices__swatch appearance-choices__material" data-interface-theme={id} />,
          })),
        ]}
        onChange={mode => patch({
          materialTheme: mode === 'island' ? undefined : mode,
          ...(mode === 'glass' && !value.glassMaterial && { glassMaterial: islandGlass }),
        })}
      />
      {value.materialTheme === 'glass' && <GlassMaterialSettings
        locale={locale} material={value.glassMaterial ?? DEFAULT_GLASS_MATERIAL}
        onChange={glassMaterial => patch({ glassMaterial })}
      />}
    </div>
  </>
}
