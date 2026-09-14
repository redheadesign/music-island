import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { UpdateBanner } from '../../shared/ui/UpdateBanner'

const meta = {
  title: 'Organisms/UpdateBanner',
  component: UpdateBanner,
  tags: ['autodocs'],
  args: {
    variant: 'settings',
    title: 'Доступна версия 1.4.0',
    releaseNotes:
      '- Настройки стали просторнее и понятнее.\n- Уровень микрофона теперь проще настроить.\n- Исправлено отображение длинных названий треков.',
    primaryLabel: 'Обновить',
    laterLabel: 'Позже',
    expandLabel: 'Все изменения',
    collapseLabel: 'Свернуть',
    emptyNotesLabel: 'Описание изменений пока не добавлено.',
    status: 'available',
    onPrimary: fn().mockName('update.preview'),
    onLater: fn().mockName('update.dismiss'),
    onOpenUrl: fn(),
  },
  parameters: {
    workshop: {
      width: 580,
      note: 'Все действия — демонстрационные. Обновления не проверяются и не устанавливаются.',
    },
  },
} satisfies Meta<typeof UpdateBanner>
export default meta
type Story = StoryObj<typeof meta>
export const Available: Story = {
  name: 'Доступно обновление',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Обновить' }))
    await expect(args.onPrimary).toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Позже' }))
    await expect(args.onLater).toHaveBeenCalled()
  },
}
export const Downloading: Story = {
  name: 'Загрузка',
  args: {
    status: 'downloading',
    progressPercent: 46,
    progressLabel: 'Загружаем обновление',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar', { name: 'Загружаем обновление' })).toHaveAttribute('aria-valuenow', '46')
    await expect(canvas.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Позже' })).not.toBeInTheDocument()
  },
}
export const Installing: Story = {
  name: 'Установка',
  args: { status: 'installing', progressLabel: 'Устанавливаем обновление' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar', { name: 'Устанавливаем обновление' })).not.toHaveAttribute('aria-valuenow')
    await expect(canvas.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Позже' })).not.toBeInTheDocument()
  },
}
export const Error: Story = {
  name: 'Ошибка загрузки',
  args: {
    status: 'error',
    primaryLabel: 'Повторить',
    error:
      'Не удалось загрузить обновление. Проверьте подключение и повторите попытку.',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('Не удалось загрузить обновление.')
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }))
    await expect(args.onPrimary).toHaveBeenCalled()
  },
}
export const Island: Story = {
  name: 'Баннер на островке',
  args: { variant: 'island' },
}
export const NoNotes: Story = {
  name: 'Без описания',
  args: { releaseNotes: null },
}

export const Narrow: Story = {
  name: 'Узкий баннер · 320 px',
  parameters: { workshop: { width: 320 } },
}

export const DownloadingUnknown: Story = {
  name: 'Загрузка без размера файла',
  args: { status: 'downloading', progressLabel: 'Загружаем обновление', progressPercent: null },
  parameters: { workshop: { width: 320 } },
}

export const LongNotes: Story = {
  name: 'Длинное описание и ссылка',
  args: {
    releaseNotes: '### Интерфейс\n\n- Настройки получили единую систему отступов.\n- Длинные названия источников остаются читаемыми в узком окне.\n\n### Звук\n\nИсправлено восстановление выбранного микрофона после повторного подключения устройства.\n\n### Подробности\n\nПолный список изменений доступен в [истории выпусков](https://github.com/redheadesign/music-island/releases).',
  },
  parameters: { workshop: { width: 400 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const expand = canvas.getByRole('button', { name: 'Все изменения' })
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByRole('heading', { name: 'Звук' })).not.toBeInTheDocument()
    await userEvent.click(expand)
    await expect(canvas.getByRole('button', { name: 'Свернуть' })).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByRole('heading', { name: 'Звук' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'истории выпусков' }))
    await expect(args.onOpenUrl).toHaveBeenCalledWith('https://github.com/redheadesign/music-island/releases')
    await userEvent.click(canvas.getByRole('button', { name: 'Свернуть' }))
    await expect(canvas.queryByRole('heading', { name: 'Звук' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'истории выпусков' })).not.toBeInTheDocument()
  },
}

export const LongTitle: Story = {
  name: 'Длинный заголовок · 320 px',
  args: {
    title: 'Доступно обновление Music Island с новым интерфейсом настроек и улучшениями Better Voice',
    releaseNotes: null,
    primaryLabel: 'Обновить приложение',
    laterLabel: 'Напомнить позже',
  },
  parameters: { workshop: { width: 320 } },
}

export const ErrorNarrow: Story = {
  name: 'Длинная ошибка · 320 px',
  args: {
    status: 'error',
    primaryLabel: 'Повторить',
    error: 'Не удалось заменить файл music-island.exe. Закройте другие запущенные копии Music Island и повторите попытку.',
  },
  parameters: { workshop: { width: 320 } },
}

export const IslandDownloading: Story = {
  name: 'Островок · загрузка',
  args: { variant: 'island', status: 'downloading', progressPercent: 46, progressLabel: 'Загружаем обновление' },
}

export const IslandInstalling: Story = {
  name: 'Островок · установка',
  args: { variant: 'island', status: 'installing', progressLabel: 'Устанавливаем обновление' },
}

export const IslandError: Story = {
  name: 'Островок · ошибка',
  args: {
    variant: 'island',
    status: 'error',
    primaryLabel: 'Повторить',
    error: 'Не удалось загрузить обновление. Проверьте подключение и повторите попытку.',
  },
}

export const IslandNarrow: Story = {
  name: 'Островок · узкий баннер',
  args: { variant: 'island' },
  parameters: { workshop: { width: 320 } },
}

export const IslandLongTitle: Story = {
  name: 'Островок · длинный заголовок',
  args: {
    variant: 'island',
    title: 'Доступно обновление Music Island с улучшениями настроек и управления звуком',
    primaryLabel: 'Обновить приложение',
    laterLabel: 'Напомнить позже',
  },
  parameters: { workshop: { width: 400 } },
}
