# Мастерская компонентов Music Island

Storybook показывает реальные React-компоненты проекта в браузере. Сборка `.exe`, Rust, запущенная Яндекс Музыка и микрофон для этого не нужны.

## Запуск

Из корня проекта:

```powershell
npm install
npm run storybook
```

Откройте [мастерскую](http://127.0.0.1:6006/?path=/story/welcome--start). После изменений кода браузер обновляется автоматически. Для остановки нажмите `Ctrl+C` в терминале. Сервер слушает только локальный адрес.

## Как устроен каталог

- **Welcome** — стартовая страница и инструкция по обратной связи.
- **Foundations** — семантические цвета, типографика, отступы, материалы, движение и доступность.
- **Atoms** — IconButton, RangeSlider, StatusChip, MarqueeText, GlassSurface.
- **Molecules** — AccentColorPicker, DarkSelect, ActiveSelectionChip, LevelMeter.
- **Organisms** — MusicModule, TaskbarPlayer, UpdateBanner, VoiceControlCard, VoiceEffects и FoxMascot с отдельными клипами.
- **Screens** — Settings, BetterVoice и настоящая оболочка Island.

Это организация каталога, а не новая архитектура приложения. Компоненты остаются в своих слоях `shared`, `app` и `features`.

## Визуальная система

Источник значений — [`src/shared/styles/tokens.css`](../src/shared/styles/tokens.css). Раздел Foundations показывает эти CSS-переменные, их назначение и примеры использования:

- [Палитра и семантика](http://127.0.0.1:6006/?path=/story/foundations--palette): четыре уровня поверхностей, три уровня текста, статусы, границы и пользовательский акцент.
- [Типографика и иерархия](http://127.0.0.1:6006/?path=/story/foundations--typography): роли `caption`, `label`, `body`, `title`, `display`, соответствующие интервалы и насыщенность.
- [Отступы и размеры](http://127.0.0.1:6006/?path=/story/foundations--spacing): шкала `--space-1` … `--space-9` — 4, 8, 12, 16, 20, 24, 32, 40 и 48 px; скругления и размеры управления.
- [Материалы и глубина](http://127.0.0.1:6006/?path=/story/foundations--surfaces): матовые панели для содержания и один слой стекла для плавающей навигации.
- [Движение и обратная связь](http://127.0.0.1:6006/?path=/story/foundations--motion): отклик 120 мс, переключение 200 мс, появление 320 мс; все длительности обнуляются при `prefers-reduced-motion`.
- [Контраст и доступность](http://127.0.0.1:6006/?path=/story/foundations--accessibility): расчет контраста заданных пар текста и непрозрачной панели, проверка фокуса и управления с клавиатуры.
- [Референсы и решения](http://127.0.0.1:6006/?path=/story/foundations-references--curated): рекомендации Apple, Viewport и выбранные кейсы Dprofile с пояснением примененных приемов. Основания редизайна описаны в [DESIGN.md](DESIGN.md).

В настройках используйте семантические переменные вместо новых оттенков и случайных размеров. Стандартный внутренний отступ панели — `--space-6`, строки — `--space-5`, расстояние между разделами — `--space-7`. Это шкала Music Island, выбранная для данного интерфейса; она не выдается за обязательные размеры Apple HIG.

Стекло не нужно для каждой группы настроек: непрозрачный `--surface-panel` обеспечивает стабильный контраст длинного текста. `--fg-muted` предназначен для метаданных на темной основе или панели. Контраст прозрачных поверхностей и произвольного пользовательского акцента проверяйте на фактическом фоне отдельно.

Выберите компонент и состояние в меню слева. Поиск также находит названия компонентов. На вкладке **Docs** у базовых компонентов есть описание, примеры и параметры.

## Инструменты просмотра

- **Controls** — параметры компонента. Слайдеры и выбор устройства синхронизированы с этими параметрами.
- **Actions** — события кнопок и демонстрационные вызовы.
- **Interactions** — результаты встроенных проверок взаимодействий для соответствующих примеров.
- **Accessibility** — автоматическая проверка доступности. Найденные проблемы относятся к показанному состоянию; проверка не заменяет ручной просмотр.
- **Code** — код примера.
- Панель сверху: русский/английский для компонентов с локализацией, цвет акцента, фон и ширина области просмотра. Подписи, передаваемые как текстовые параметры, редактируются в Controls.
- Фон **Прозрачность** особенно удобен для видео лисёнка, фон **Рабочий стол** — для стеклянных поверхностей.
- Инструменты **Measure** и **Outline** помогают сравнивать размеры и отступы.

## Как передать комментарий

1. Откройте нужное состояние и настройте параметры.
2. Нажмите **Скопировать контекст** над компонентом.
3. Вставьте сообщение в чат и допишите желаемое изменение. При необходимости приложите снимок.

В буфере будут название, ссылка, язык, акцент, фон и параметры. Если браузер не разрешает копирование, текст появится в поле на странице. Ссылка на локальный сервер работает на этом компьютере, пока Storybook запущен.

Пример: «Organisms/MusicModule → Длинный трек. Уменьши отступ между названием и кнопкой избранного на 4 px».

## Демонстрационные данные

Музыка использует локальную обложку и фиксированный трек из `src/stories/fixtures.ts`. Кнопки плеера меняют состояние примера или записывают событие в Actions.

Settings использует существующий браузерный режим `tauriApi`: настройки живут в памяти примера, обновления не загружаются. Better Voice получает отдельную замену `pluginApi` только в конфигурации Storybook: фиктивные устройства, аудиоуровни и состояния запуска. Сохранение сессии также заменено на память. Сценарии сбрасываются перед запуском каждой истории.

Это средство просмотра интерфейса. SMTC, CDP, реальный звук, нативное наведение, DPI и установка обновлений проверяются в Windows через Tauri.

## Добавление примеров

Создайте `src/stories/<уровень>/<Component>.stories.tsx`, импортируйте настоящий компонент и используйте `Meta` / `StoryObj` из `@storybook/react-vite`.

- `title: 'Molecules/ComponentName'` задаёт раздел и стабильный ID.
- `name` у экспортируемой истории задаёт понятное русское название состояния.
- `args` задают воспроизводимые данные; обработчики используйте через `fn()` из `storybook/test`.
- `tags: ['autodocs']` включает документацию. Для тяжёлых экранов и видео предпочтительны отдельные истории, чтобы не запускать множество экземпляров одновременно.
- `parameters.workshop` принимает `width`, `height` и `note` для области просмотра.
- `parameters.voicePreview` принимает `running`, `cableInstalled` и `failStart` для сценариев Better Voice.
- Не импортируйте `src/stories` в код приложения. Не обращайтесь из примеров к настоящему микрофону или нативным командам.

Сначала добавляйте обычное состояние, затем крайние случаи: пустые данные, ошибка, недоступное действие, длинный текст и узкая область.

## Проверки и статический каталог

```powershell
npm run check:storybook
npm run build-storybook
npm test
npm run lint
npm run build
```

`build-storybook` создаёт автономный каталог в `storybook-static/`. Каталог и зависимости Storybook не входят в сборку приложения. Эта команда ничего не публикует на GitHub и не создаёт релиз. Статический каталог и логи исключены из Git.

Конфигурация основана на [Storybook для React + Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite) и [toolbars/globals](https://storybook.js.org/docs/essentials/toolbars-and-globals).

## Единая оболочка и контролы

`Screens/Settings` использует production-компонент `SettingsWindow`, включая шапку,
фиксированную навигацию и единственный правый scroll. Проверяйте размеры именно
в этом примере: отдельная история `SettingsPanel` не заменяет геометрию окна.

`Atoms/SettingsControls` показывает общие Button, FeatureToggle, Switch, Input,
Select, SettingsNavigation и секции в тёмной/светлой теме и disabled-состоянии.
`Foundations` показывает семантические токены вспомогательных экранов; материал
островка выделен отдельно. Править палитру нужно в `tokens.css`, компоненты — в
`shared/ui`, а не поверхностями внутри каждой feature.

`Screens/Dictation/ImportedRnnt` отличает скачанную/выбранную модель от загруженной
в память. Дополнительно есть выключенная диктовка с доступными настройками, запись,
загрузка, ошибка, согласие на скачивание и импорт. `Atoms/PlaybackFeedback` использует
настоящий `IslandFeedback`: волна принадлежит поверхности островка. У reduced-motion
истории проверяется отсутствие волны. Истории знакомства используют реальные элементы
и не скачивают модели или подключают сервисы.

## Release 3

`Molecules/ModelCard` covers recommendations, installed/loaded, download progress, retry, long names and action-menu keyboard behavior. `Screens/Onboarding` covers four steps, explicit startup consent, skip, already enabled and failure states. The drag geometry story measures the SVG itself as well as the portal container.

`Screens/Release3` reuses the shared ReleaseScene compositions plus dictation/model scenes. `Screens/Release3Motion` is the editable 46-second timeline for both video formats. Export instructions are in RELEASES.md. None of these helpers or fixtures is part of the production bundle.

`Molecules/MonitorSetting` covers primary/secondary, disconnected, light and EN
states using fictional displays. `Screens/Settings/ScopeStartsAtFirstPage` checks
navigation reset. Both layout editors have `PointerGrabGeometry` stories that
measure the actual cloned SVG at multiple preview scales and cancel with Escape.
`SearchField` is included in the shared controls rather than a dictation-only skin.

The opening motion scene reuses `IslandTopIndicator`, a halfway track and cursor
approach before the real player opens. Final scenes contain a repository QR.
The RU encode includes Strophe-generated music; EN remains silent. Source, attribution,
original demo artwork and reproduction details: [media sources](releases/3.0-media-sources.md).

`Atoms/AppLogo` reviews standard, intro and portrait logo variants at 16/24/40/80/128/256px in both
themes. The SVG owns the circular photo mask; no outer image rounding is allowed.
The release-only theme wipe clips two rendered copies of the same settings page.
Static theme snapshots are cached during export; only the reveal boundary moves.
The image exporter waits for a decoded alpha frame of the real fox video.

The current logo roles and usage rules are in [BRAND.md](BRAND.md).
All three variants are explicit in Atoms/AppLogo. Release3Motion adds Continuous
(40s) and Rhythm (36s) stories with RU output, video-aware deterministic capture,
separate Handy transfer and independent frame/output namespaces. Production and
export details: [MOTION_PRODUCTION.md](MOTION_PRODUCTION.md).

