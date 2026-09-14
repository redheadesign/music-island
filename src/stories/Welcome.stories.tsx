import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowUpRight,
  Blocks,
  Circle,
  Layers,
  Music2,
  PanelsTopLeft,
} from 'lucide-react'
import { MusicModule } from '../features/music/MusicModule'
import { media } from './fixtures'

const href = (id: string) => `/?path=/story/${id}`
function Welcome() {
  return (
    <main className="workshop-welcome">
      <div className="welcome-topline">
        <span className="welcome-mark">
          <Music2 size={18} />
        </span>{' '}
        MUSIC ISLAND <span>/</span> COMPONENT WORKSHOP
      </div>
      <section className="welcome-hero">
        <div>
          <span className="welcome-kicker">Личная мастерская интерфейса</span>
          <h1>
            Всё начинается
            <br />с деталей.
          </h1>
          <p>
            Живые компоненты Music Island — от одной кнопки до целого экрана.
            Исследуйте состояния, пробуйте настройки и обсуждайте изменения.
          </p>
          <a
            className="welcome-primary"
            href={href('organisms-musicmodule--playing')}
            target="_top"
          >
            Открыть плеер <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="welcome-preview">
          <div className="sample-music">
            <MusicModule
              media={media}
              progressMs={73000}
              progressPercent={34}
              density="balanced"
              showArtwork
              showTitle
              showArtist
              showProgress
              showSource
              showPreviousNext
              locale="ru"
              onCommand={() => {}}
            />
          </div>
          <div className="welcome-preview-label">
            РЕАЛЬНЫЙ КОМПОНЕНТ ИЗ ПРИЛОЖЕНИЯ
          </div>
        </div>
      </section>
      <div className="welcome-section-label">ОТ МАЛОГО К ЦЕЛОМУ</div>
      <nav className="welcome-grid" aria-label="Каталог компонентов">
        {[
          {
            title: 'Атомы',
            detail: 'Кнопки, метки, слайдеры и текст',
            id: 'atoms-iconbutton--default',
            Icon: Circle,
          },
          {
            title: 'Молекулы',
            detail: 'Выбор цвета, списки и индикаторы',
            id: 'molecules-accentcolorpicker--default',
            Icon: Blocks,
          },
          {
            title: 'Организмы',
            detail: 'Плеер, баннеры и живой маскот',
            id: 'organisms-foxmascot--interactive',
            Icon: Layers,
          },
          {
            title: 'Экраны',
            detail: 'Настройки, Better Voice и островок',
            id: 'screens-settings--default',
            Icon: PanelsTopLeft,
          },
        ].map(({ title, detail, id, Icon }) => (
          <a className="welcome-card" key={id} href={href(id)} target="_top">
            <Icon size={22} />
            <strong>{title}</strong>
            <span>{detail}</span>
          </a>
        ))}
      </nav>
      <div className="welcome-section-label">КАК РАБОТАТЬ</div>
      <section className="welcome-how">
        <div>
          <strong>01 / Выберите состояние</strong>
          <p>
            В меню слева: воспроизведение, ошибка, длинный текст и другие
            готовые примеры. В Foundations — палитра и типографика.
          </p>
        </div>
        <div>
          <strong>02 / Попробуйте варианты</strong>
          <p>
            Controls меняет параметры. Сверху — язык, акцент, фон и размер
            области просмотра. Accessibility помогает заметить проблемы
            доступности.
          </p>
        </div>
        <div>
          <strong>03 / Передайте комментарий</strong>
          <p>
            Нажмите «Скопировать контекст», вставьте его в чат и допишите, что
            изменить. Название, ссылка и параметры уже будут в сообщении.
          </p>
        </div>
      </section>
      <p className="welcome-note">
        Музыка и микрофон используют демонстрационные данные. Windows,
        аудиодвижок и обновления приложения здесь не запускаются. Каталог не
        публикует релизы.
      </p>
    </main>
  )
}

export default {
  title: 'Welcome',
  component: Welcome,
  parameters: { workshop: { welcome: true }, controls: { disable: true } },
} satisfies Meta<typeof Welcome>
export const Start: StoryObj<typeof Welcome> = { name: 'Начать здесь' }
