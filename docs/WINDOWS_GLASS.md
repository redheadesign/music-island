# Стекло на Windows

Список проверен по GitHub 21 ноября 2026 года. Звёзды показывают популярность репозитория. Пригодность для островка зависит от того, откуда реализация получает пиксели и сколько работы выполняет при каждом кадре.

| Репозиторий | Звёзд | Что применимо |
| --- | ---: | --- |
| [Windhawk](https://github.com/ramensoftware/windhawk) | 9 955 | Платформа для модификации оболочки Windows. Полезна как каталог примеров. |
| [liquid-glass-react](https://github.com/rdev/liquid-glass-react) | 6 759 | SVG-преломление внутри веб-страницы. Подходит для кнопок и браузерного превью. |
| [DWMBlurGlass](https://github.com/Maplespe/DWMBlurGlass) | 4 702 | Системные материалы и размытие заголовков окон через модификацию DWM. |
| [liquid-dom](https://github.com/AndrewPrifer/liquid-dom) | 2 604 | WebGPU для стекла внутри собственной сцены. Полезен как референс профиля линзы. |
| [liquid-glass-js](https://github.com/dashersw/liquid-glass-js) | 1 841 | Веб-оптика с WebGL. Источник изображения находится внутри страницы. |
| [liquid-glass](https://github.com/shuding/liquid-glass) | 1 235 | Компактный пример поля смещения в SVG. |
| [Windhawk Mods](https://github.com/ramensoftware/windhawk-mods) | 1 139 | Исходники модов оболочки и стилизаторов элементов Windows. |
| [liquidGL](https://github.com/naughtyduk/liquidGL) | 1 090 | WebGL-линза над растеризованным содержимым страницы. |
| [OpenGlass](https://github.com/ALTaleX531/OpenGlass) | 802 | Модификация DWM для системного Aero. Привязана к версиям системного композитора. |
| [Glisse](https://github.com/0kzh/glisse) | 626 | Нынешняя основа кнопок и их оптики внутри WebView. |

## Нативные примеры

- **Taskbar Liquid Glass** получил 2 звезды. Мод снимает монитор через Windows Graphics Capture, копирует область под панелью задач и искажает её на GPU. Стили прозрачных кнопок и панелей идут через Windows 11 Taskbar Styler. Его темы задают XAML-подложки, а оптику рабочего стола рисует отдельный нативный слой. Это ближайший пример для Music Island. [Исходник и описание мода](https://github.com/AlexVishnevsky/taskbar-liquid-glass) · [Тема Taskbar Styler](https://github.com/ramensoftware/windows-11-taskbar-styling-guide/tree/main/Themes/LiquidGlass)
- **Island Media Controls** получил 9 звёзд. Автор Taskbar Liquid Glass указывает его как источник подхода с GPU-искажением вдоль краёв плашки. [Репозиторий мода](https://github.com/usho-lear/island-media-controls)
- **alphamerics/liquid-glass** получил 1 звезду. Ближайший архитектурный пример для Tauri с D3D11, WGC, HLSL и дисперсией. Его дистрибутиву нужен отдельный процесс, который обслуживает весь пользовательский сеанс. В Music Island цепочка встроена в portable EXE и обрабатывает только видимый корпус. [Репозиторий проекта](https://github.com/alphamerics/liquid-glass)
- **OpenFluidGlass** получил 2 звезды. Действительно искажает окна на уровне DWM. Для portable-островка предпочтительны публичные API, которые работают внутри своего процесса и сохраняют системный режим при проблемах с GPU. [Репозиторий проекта](https://github.com/DreY85/OpenFluidGlass)

## Режимы в Music Island

Системное стекло включено по умолчанию. GPU-линза доступна в режиме разработчика на странице «Превью и отладка». У неё отдельные параметры преломления и дисперсии. Контур линзы следует скруглению корпуса. Цвет берётся из кадра под корпусом, а цветные края возникают из смещения RGB-каналов на этом кадре.

Режим использует Windows 11 с поддержкой ограничения частоты Windows Graphics Capture. Фреймпул ограничен двумя кадрами. При открытом островке он принимает до 30 кадров в секунду, копирует на GPU область корпуса с небольшим запасом и пропускает кадры с изменениями вне неё. Закрытие островка, системный режим и отключение прозрачности завершают захват. На время захвата Windows исключает окно островка из записи и демонстрации экрана, чтобы оно не попало в собственное отражение. [Windows Graphics Capture](https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture) · [Исключение окна из захвата](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
