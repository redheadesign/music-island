import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowUpRight } from 'lucide-react'

const guidance = [
  {
    title: 'Apple HIG · Materials',
    url: 'https://developer.apple.com/design/human-interface-guidelines/materials',
    lesson: 'Стекло отделяет управление и навигацию от содержания. Сложные эффекты используются выборочно.',
    decision: 'В Music Island: полупрозрачная навигация, матовые группы настроек.',
  },
  {
    title: 'Apple HIG · Layout',
    url: 'https://developer.apple.com/design/human-interface-guidelines/layout',
    lesson: 'Общие линии выравнивания и расстояния показывают связь между элементами. Важному содержанию нужно место.',
    decision: 'В Music Island: постоянная ось подписей, значений и управления; отдельные страницы настроек.',
  },
  {
    title: 'Apple HIG · Accessibility',
    url: 'https://developer.apple.com/design/human-interface-guidelines/accessibility',
    lesson: 'Читаемость, понятные состояния и доступность управления входят в основу интерфейса.',
    decision: 'В Music Island: видимый фокус, подписи статусов, проверка контраста и снижение движения.',
  },
]

const references = [
  {
    title: 'Paper Shaders · Warp',
    source: 'Готовый React-компонент · проверено 8 сентября 2026',
    url: 'https://shaders.paper.design/warp#colors=14120f,d2a76a,f0edea&proportion=0.24&softness=1&distortion=0.21&swirl=0.57&swirlIterations=10&shape=edge&shapeScale=0.75&speed=4.2&scale=2&rotation=0',
    context: 'Живая библиотека материалов',
    lesson: 'Текучие формы создают спокойный фон с равномерным затемнением.',
    decision: 'В Better Voice используется одна композиция Warp в тёплой графитовой палитре. Медленнее и темнее в ожидании, быстрее и светлее при обработке. В скрытой вкладке и при уменьшении движения анимация остановлена.',
  },
  {
    title: 'Apple · What’s new in design',
    source: 'Apple Developer · 2026',
    url: 'https://developer.apple.com/design/whats-new/',
    context: 'Актуальные материалы и ресурсы Apple',
    lesson: 'Материал поддерживает читаемость и иерархию управления.',
    decision: 'Это ориентир для нашего интерфейса на Windows; эффект Paper не является нативным Liquid Glass.',
  },
  {
    title: 'Notification panel',
    source: 'Viewport · 20 июня 2024',
    url: 'https://viewport-ui.design/posts/295-notification-panel/',
    context: 'Компактная панель уведомлений',
    lesson: 'Спокойная глубина, точные границы и ясный порядок небольших элементов.',
    decision: 'Применяем к плотности строк, локальным статусам и тонким границам.',
  },
  {
    title: 'Slider Ai. Сервис',
    source: 'Dprofile · 26 января 2026',
    url: 'https://dprofile.ru/case/165688/slider-ai-servis',
    context: '«В лучшем на Dprofile»',
    lesson: 'Темный продуктовый интерфейс с боковой навигацией и последовательными отступами.',
    decision: 'Применяем к структуре настроек: постоянная навигация и одна ясная задача на странице.',
  },
  {
    title: 'Kononenko Architectural Website',
    source: 'Dprofile · 19 августа 2026',
    url: 'https://dprofile.ru/case/191766/kononenko-architectural-website',
    context: 'Референс типографики и свободного пространства',
    lesson: 'Выразительная иерархия текста, воздух между смысловыми блоками и аккуратное выравнивание.',
    decision: 'Применяем к ритму и заголовкам. Сценарии архитектурного сайта отличаются от настроек приложения.',
  },
]

export default {
  title: 'Foundations/References',
  parameters: {
    workshop: {
      width: 920,
      note: 'Источники просмотрены 8 сентября 2026 года. Внешние ссылки открывают оригинальные рекомендации и кейсы.',
    },
    controls: { disable: true },
  },
} satisfies Meta

export const Curated: StoryObj = {
  name: 'Референсы и решения',
  render: () => (
    <article className="foundation-page">
      <header className="foundation-header">
        <span className="foundation-index">MUSIC ISLAND / REFERENCES</span>
        <h1>Референсы и решения</h1>
        <p>Рекомендации Apple и три визуальных ориентира для настроек Music Island. Рядом с каждым источником — прием, который помогает нашему интерфейсу.</p>
      </header>

      <section className="foundation-section">
        <div className="foundation-section-heading">
          <h2>Принципы</h2>
          <p>Адаптируем рекомендации к приложению Windows и его реальным задачам.</p>
        </div>
        <div className="foundation-principles">
          {guidance.map(({ title, url, lesson, decision }) => (
            <div key={url}>
              <a className="foundation-reference-link" href={url} target="_blank" rel="noreferrer">{title}<ArrowUpRight size={15} aria-hidden="true" /></a>
              <p>{lesson}</p>
              <p className="foundation-reference-decision">{decision}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="foundation-section">
        <div className="foundation-section-heading">
          <h2>Визуальные ориентиры</h2>
          <p>Оригинальные кейсы доступны по ссылкам. Описания ниже — наши выводы из просмотра.</p>
        </div>
        <div className="foundation-type-list">
          {references.map(({ title, source, url, context, lesson, decision }) => (
            <div className="foundation-type-row" key={url}>
              <div className="foundation-type-meta">
                <span>{source}</span>
                <a className="foundation-reference-link" href={url} target="_blank" rel="noreferrer">{title}<ArrowUpRight size={15} aria-hidden="true" /></a>
                <span>{context}</span>
              </div>
              <div>
                <p className="foundation-reference-summary">{lesson}</p>
                <p className="foundation-type-usage">{decision}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="foundation-section">
        <div className="foundation-section-heading"><h2>Результат для Music Island</h2></div>
        <div className="foundation-principles">
          <div><span>01</span><strong>Тихий фон, ясное действие</strong><p>Графитовая основа, читаемые панели и акцент у активного выбора.</p></div>
          <div><span>02</span><strong>Предсказуемый ритм</strong><p>Общая шкала отступов, пять текстовых ролей и единые размеры управления.</p></div>
          <div><span>03</span><strong>Настройки по задаче</strong><p>Внешний вид, источник музыки, система и информация о приложении доступны отдельно.</p></div>
        </div>
        <p className="foundation-note">Шкала с шагом 4 px — решение Music Island. Apple HIG задает принципы и правила для конкретных платформ, а не универсальное требование ко всем отступам Windows-приложений.</p>
      </section>
    </article>
  ),
}
