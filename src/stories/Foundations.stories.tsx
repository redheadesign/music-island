import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, ChevronRight, Music2, Pause, Play } from 'lucide-react'
import { ACCENT_PRESETS } from '../shared/lib/accentTheme'
import { GlassSurface } from '../shared/ui/GlassSurface'
import { IconButton } from '../shared/ui/IconButton'
import { StatusChip } from '../shared/ui/StatusChip'

export default {
  title: 'Foundations',
  decorators: [(Story) => <div className="auxiliary-ui" style={{ background: 'var(--surface-canvas)', padding: 24 }}><Story /></div>],
  parameters: { workshop: { width: 920 }, controls: { disable: true } },
} satisfies Meta

function FoundationPage({ index, title, description, children }: {
  index: string; title: string; description: string; children: ReactNode
}) {
  return (
    <article className="foundation-page">
      <header className="foundation-header">
        <span className="foundation-index">MUSIC ISLAND / {index}</span>
        <h1>{title}</h1><p>{description}</p>
      </header>
      {children}
    </article>
  )
}

function FoundationSection({ title, description, children }: {
  title: string; description?: string; children: ReactNode
}) {
  return (
    <section className="foundation-section">
      <div className="foundation-section-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {children}
    </section>
  )
}

const surfaces = [
  { token: '--surface-canvas', label: 'Основа', value: '#1E1E1E', usage: 'Фон окна и пространство между разделами' },
  { token: '--surface-panel', label: 'Содержание', value: '#272727', usage: 'Группы настроек и длинный текст' },
  { token: '--surface-raised', label: 'Управление', value: '#303030', usage: 'Поля ввода, меню и вторичные кнопки' },
  { token: '--surface-glass', label: 'Меню', value: '#303030', usage: 'Поверхность меню и вложенного содержимого' },
] as const

export const Palette: StoryObj = {
  name: 'Палитра и семантика',
  render: () => (
    <FoundationPage index="01" title="Цвет с назначением" description="Графитовые поверхности, ясная иерархия текста и один личный акцент. Каждый цвет отвечает за конкретную роль.">
      <FoundationSection title="Поверхности" description="Чем ближе элемент к пользователю, тем светлее его поверхность.">
        <div className="foundation-palette-grid">
          {surfaces.map(({ token, label, value, usage }) => (
            <div className="foundation-swatch-card" key={token}>
              <div className="foundation-swatch" style={{ background: `var(${token})` }}><span>{label}</span></div>
              <div className="foundation-token-info"><code>{token}</code><span>{value}</span><p>{usage}</p></div>
            </div>
          ))}
        </div>
      </FoundationSection>
      <FoundationSection title="Текст" description="Важность задается цветом и расстоянием. Второстепенные подписи остаются читаемыми.">
        <div className="foundation-text-colors">
          {[
            ['--fg-primary', 'Основной текст', '#f5f5f5', 'Названия, значения, активная навигация'],
            ['--fg-secondary', 'Пояснения', '#b7b7b7', 'Описания настроек и дополнительный контекст'],
            ['--fg-muted', 'Метаданные', '#929292', 'Версии, единицы измерения, вспомогательные подписи'],
          ].map(([token, label, value, usage]) => (
            <div className="foundation-text-color" key={token} style={{ color: `var(${token})` }}>
              <span className="foundation-text-specimen" aria-hidden="true">Aa</span>
              <strong>{label}</strong><code>{token}</code><span>{value}</span><p>{usage}</p>
            </div>
          ))}
        </div>
      </FoundationSection>
      <FoundationSection title="Статусы и границы" description="Статус всегда подписан: его можно понять без различения цветов.">
        <div className="foundation-status-grid">
          <div><StatusChip tone="success" className="sample-pill">Подключено</StatusChip><code>--status-success</code><p>Успешное действие или готовность</p></div>
          <div><StatusChip tone="warning" className="sample-pill">Нужна настройка</StatusChip><code>--status-warning</code><p>Состояние, требующее внимания</p></div>
          <div><StatusChip tone="danger" className="sample-pill">Нет подключения</StatusChip><code>--status-danger</code><p>Ошибка, которую можно исправить</p></div>
        </div>
        <div className="foundation-border-grid">
          <div><span style={{ borderColor: 'var(--border-subtle)' }} /><code>--border-subtle</code><p>Скрыт у обычных панелей</p></div>
          <div><span style={{ borderColor: 'var(--border-strong)' }} /><code>--border-strong</code><p>Фокус и необходимые границы</p></div>
        </div>
      </FoundationSection>
      <FoundationSection title="Личный акцент" description="Выбранный цвет отмечает активный выбор и основное действие. Палитра берется из настроек приложения.">
        <div className="foundation-accents">
          {ACCENT_PRESETS.map((color, index) => <div key={color}><span style={{ background: color }} /><code>{color}</code>{index === 0 && <small>По умолчанию</small>}</div>)}
        </div>
        <p className="foundation-note">Для текста на яркой заливке используйте <code>--accent-ink</code>. Для небольшого акцентного текста на темном фоне — <code>--accent-soft</code>.</p>
      </FoundationSection>
    </FoundationPage>
  ),
}

const typeStyles = [
  { role: 'Заголовок экрана', token: 'display', size: 28, leading: 1.2, weight: 'semibold', example: 'Настройки', usage: 'Один главный заголовок на странице' },
  { role: 'Заголовок раздела', token: 'title', size: 20, leading: 1.3, weight: 'semibold', example: 'Внешний вид', usage: 'Начало самостоятельного раздела' },
  { role: 'Основной текст', token: 'body', size: 14, leading: 1.6, weight: 'regular', example: 'Настройте островок под себя.', usage: 'Пояснения, описания и длинный текст' },
  { role: 'Название настройки', token: 'label', size: 13, leading: 1.4, weight: 'medium', example: 'Запускать вместе с Windows', usage: 'Поля, кнопки и навигация' },
  { role: 'Подпись', token: 'caption', size: 12, leading: 1.5, weight: 'regular', example: 'Изменения сохраняются автоматически', usage: 'Метаданные и дополнительный контекст' },
] as const

export const Typography: StoryObj = {
  name: 'Типографика и иерархия',
  render: () => (
    <FoundationPage index="02" title="Пять текстовых ролей" description="Системный шрифт, спокойная плотность и понятная иерархия. Размер выбирается по задаче текста.">
      <div className="foundation-type-list">
        {typeStyles.map(({ role, token, size, leading, weight, example, usage }) => (
          <div className="foundation-type-row" key={token}>
            <div className="foundation-type-meta"><strong>{role}</strong><code>--text-{token}</code><span>{size} px / {leading} · {weight}</span></div>
            <div><p className="foundation-type-example" style={{ fontSize: `var(--text-${token})`, lineHeight: `var(--leading-${token})`, fontWeight: `var(--weight-${weight})` }}>{example}</p><p className="foundation-type-usage">{usage}</p></div>
          </div>
        ))}
      </div>
      <FoundationSection title="Текст в интерфейсе" description="Сначала название, затем короткое пояснение. Значение находится рядом с элементом управления.">
        <div className="foundation-type-composition">
          <div><h3>Масштаб интерфейса</h3><p>Размер текста и элементов островка</p></div>
          <span>100<span>%</span></span>
        </div>
        <p className="foundation-note">Обычный текст — <code>--weight-regular</code>, названия — <code>--weight-medium</code>, заголовки — <code>--weight-semibold</code>. Числовые значения используют табличные цифры.</p>
      </FoundationSection>
    </FoundationPage>
  ),
}

const spacing = [
  [1, 4, 'Иконка и короткая подпись'], [2, 8, 'Название и пояснение'],
  [3, 12, 'Элементы одной группы'], [4, 16, 'Внутренний отступ компактного блока'],
  [5, 20, 'Внутренний отступ строки настройки'], [6, 24, 'Внутренний отступ панели'],
  [7, 32, 'Расстояние между разделами'], [8, 40, 'Свободное поле большого экрана'],
  [9, 48, 'Отступ вокруг самостоятельного блока'],
] as const

export const Spacing: StoryObj = {
  name: 'Отступы и размеры',
  render: () => (
    <FoundationPage index="03" title="Ритм с шагом 4 px" description="Связанные элементы стоят ближе, самостоятельные группы — дальше. Это шкала Music Island, а не универсальный набор размеров Apple.">
      <div className="foundation-spacing-list">
        {spacing.map(([step, size, usage]) => (
          <div className="foundation-spacing-row" key={step}>
            <code>--space-{step}</code><strong>{size} px</strong><div className="foundation-spacing-track"><span style={{ width: `var(--space-${step})` }} /></div><p>{usage}</p>
          </div>
        ))}
      </div>
      <FoundationSection title="Как складывается панель" description="24 px внутри панели, 20 px внутри строки, 8 px между названием и пояснением.">
        <div className="foundation-spacing-panel"><span className="foundation-measure">24 px</span><div className="foundation-spacing-setting"><div><strong>Источник музыки</strong><p>Системный плеер Windows</p></div><ChevronRight size={18} aria-hidden="true" /></div></div>
      </FoundationSection>
      <FoundationSection title="Скругления и управление" description="Форма отражает размер и назначение элемента. Основная высота управления — 40 px, компактная — 32 px.">
        <div className="foundation-radius-grid">
          {[['sm', 8, 'Кнопки'], ['md', 12, 'Поля и меню'], ['lg', 16, 'Группы'], ['xl', 20, 'Оболочка'], ['pill', 999, 'Метки']].map(([name, size, usage]) => (
            <div key={name}><span style={{ borderRadius: `var(--radius-${name})` }}>{size === 999 ? '∞' : size}</span><strong>{usage}</strong><code>--radius-{name}</code></div>
          ))}
        </div>
      </FoundationSection>
    </FoundationPage>
  ),
}

export const Surfaces: StoryObj = {
  name: 'Материалы и глубина',
  render: () => (
    <FoundationPage index="04" title="Глубина без декора" description="Матовая основа удерживает внимание на содержании. Полупрозрачность помогает отделить плавающую навигацию от страницы.">
      <div className="foundation-material-grid">
        <div className="foundation-material"><div className="foundation-material-stage"><GlassSurface className="foundation-material-sample foundation-material-sample--solid"><Music2 size={22} aria-hidden="true" /><strong>Music Island</strong><span>Ваши настройки</span></GlassSurface></div><h2>Матовая панель</h2><p>Стабильный контраст для текста и настроек, независимо от фона.</p><code>--surface-panel · --radius-xl</code></div>
        <div className="foundation-material"><div className="foundation-material-stage foundation-material-stage--glass"><span className="foundation-material-background" aria-hidden="true">Music<br />Island</span><GlassSurface className="foundation-material-sample foundation-material-sample--glass"><Music2 size={22} aria-hidden="true" /><strong>Music Island</strong><span>Плавающий островок</span></GlassSurface></div><h2>Материал островка</h2><p>Один слой размытия, нейтральный оттенок и тонкий светлый контур.</p><code>--surface-glass · --glass-blur</code></div>
      </div>
      <FoundationSection title="Правила материала">
        <div className="foundation-principles">
          <div><span>01</span><strong>Один уровень стекла</strong><p>Не вкладывайте размытие в размытие. Содержимое располагается на матовых поверхностях.</p></div>
          <div><span>02</span><strong>Контур вместо свечения</strong><p>Тонкая граница отделяет поверхности. Акцент остается у выбранного действия.</p></div>
          <div><span>03</span><strong>Контраст важнее эффекта</strong><p>Проверяйте стекло на светлом и темном фоне. При сниженной прозрачности используйте матовую заливку.</p></div>
        </div>
      </FoundationSection>
    </FoundationPage>
  ),
}

function MotionDemo() {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="foundation-motion-demo">
      <div className="foundation-motion-controls"><IconButton className="foundation-play-button" aria-label={playing ? 'Пауза' : 'Воспроизвести'} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</IconButton><div><strong>Мгновенный отклик</strong><p>Наведите курсор, нажмите или перейдите клавишей Tab</p></div></div>
      <div className={`foundation-motion-state${playing ? ' is-playing' : ''}`} aria-live="polite"><span /><span>{playing ? 'Воспроизводится' : 'На паузе'}</span></div>
    </div>
  )
}

export const Motion: StoryObj = {
  name: 'Движение и обратная связь',
  render: () => (
    <FoundationPage index="05" title="Движение по делу" description="Интерфейс отвечает на действие, помогает увидеть переход и быстро останавливается. Настройки не требуют фоновой анимации.">
      <MotionDemo />
      <div className="foundation-motion-grid">
        {[
          ['fast', 120, 'Отклик', 'Наведение, нажатие и изменение цвета'],
          ['normal', 200, 'Переключение', 'Выбор вкладки и раскрытие элемента'],
          ['slow', 320, 'Появление', 'Первое появление крупной поверхности'],
        ].map(([token, duration, label, usage]) => <div key={token}><span>{duration}<small>мс</small></span><h2>{label}</h2><p>{usage}</p><code>--motion-{token}</code></div>)}
      </div>
      <FoundationSection title="Кривые и системные предпочтения">
        <div className="foundation-principles">
          <div><Check size={18} /><strong>Без лишнего отскока</strong><p><code>--ease-standard</code> для управления, <code>--ease-enter</code> для появления поверхности.</p></div>
          <div><Check size={18} /><strong>Меньше движения</strong><p>При <code>prefers-reduced-motion</code> длительности токенов равны нулю. Состояние меняется сразу.</p></div>
          <div><Check size={18} /><strong>Состояние видно всегда</strong><p>Анимация дополняет цвет, текст и форму. Действие остается понятным без движения.</p></div>
        </div>
      </FoundationSection>
    </FoundationPage>
  ),
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const a = luminance(foreground); const b = luminance(background)
  return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)
}

export const Accessibility: StoryObj = {
  name: 'Контраст и доступность',
  render: () => (
    <FoundationPage index="06" title="Читаемо и доступно" description="Контраст, видимый фокус и понятные состояния входят в визуальную систему. Автоматические проверки дополняют просмотр с клавиатуры.">
      <FoundationSection title="Контраст текста на панели" description="Расчет для непрозрачного фона #18191c. Ориентир WCAG AA для обычного текста — не менее 4,5 : 1.">
        <div className="foundation-contrast-list">
          {[
            ['--fg-primary', '#f5f5f5', 'Основной текст'],
            ['--fg-secondary', '#b7b7b7', 'Пояснение к настройке'],
            ['--fg-muted', '#929292', 'Дополнительная подпись'],
          ].map(([token, value, label]) => <div key={token} style={{ '--contrast-color': `var(${token})` } as CSSProperties}><strong>{label}</strong><code>{token}</code><span>{contrastRatio(value, '#18191c')} : 1</span><Check size={16} aria-label="Соответствует AA" /></div>)}
        </div>
      </FoundationSection>
      <FoundationSection title="Проверка взаимодействия" description="Нажмите Tab: у кнопок должен появиться заметный контур. Enter и пробел запускают действие."><MotionDemo /></FoundationSection>
      <div className="foundation-principles">
        <div><span>01</span><strong>Текст остается текстом</strong><p>Подписи не заменяются одним цветом или иконкой. Небольшой текст начинается с 12 px.</p></div>
        <div><span>02</span><strong>Управление с клавиатуры</strong><p>Видимый фокус, последовательный Tab-порядок и подписи у кнопок с иконками.</p></div>
        <div><span>03</span><strong>Проверка на реальном экране</strong><p>Узкая ширина, длинные названия, масштаб Windows и все состояния элементов.</p></div>
      </div>
      <p className="foundation-note">Прозрачные поверхности и пользовательский акцент проверяются отдельно на фактическом фоне. Значения выше относятся только к указанным парам цветов.</p>
    </FoundationPage>
  ),
}
