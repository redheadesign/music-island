import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DarkSelect } from '../../features/plugins/voice/DarkSelect'

const meta = {
  title: 'Molecules/DarkSelect',
  component: DarkSelect,
  tags: ['autodocs'],
  args: {
    value: 'usb',
    ariaLabel: 'Микрофон',
    placeholder: 'Выберите микрофон',
    disabled: false,
    options: [
      { value: 'usb', label: 'Studio USB' },
      { value: 'builtin', label: 'Встроенный микрофон' },
      {
        value: 'long',
        label:
          'Очень длинное название внешнего аудиоустройства · USB Audio Interface',
      },
    ],
    onChange: fn(),
  },
  parameters: { workshop: { width: 300, height: 420 } },
  render: function Select(args, context) {
    const [, updateArgs] = useArgs()
    return (
      <div className="sample-column">
        {context.parameters.tabNavigation ? <button type="button" className="secondary-button">Предыдущий элемент</button> : null}
        <DarkSelect
          {...args}
          onChange={(value) => {
            updateArgs({ value })
            args.onChange(value)
          }}
        />
        {context.parameters.tabNavigation ? <button type="button" className="secondary-button">Следующий элемент</button> : null}
      </div>
    )
  },
} satisfies Meta<typeof DarkSelect>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {
  name: 'Выбор устройства',
  play: async ({ canvas, canvasElement, args }) => {
    const trigger = canvas.getByRole('button', { name: 'Микрофон' })
    await userEvent.click(trigger)
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('option', {
        name: 'Встроенный микрофон',
      }),
    )
    await expect(args.onChange).toHaveBeenCalledWith('builtin')
    await expect(args.onChange).toHaveBeenCalledTimes(1)
    await expect(trigger).toHaveFocus()
  },
}
export const Empty: Story = {
  name: 'Нет устройств',
  args: { value: '', options: [], placeholder: 'Микрофоны не найдены' },
}
export const Disabled: Story = { name: 'Недоступен', args: { disabled: true } }
export const LongLabel: Story = {
  name: 'Длинное название',
  args: { value: 'long' },
}
export const Keyboard: Story = {
  name: 'Управление с клавиатуры',
  parameters: {
    tabNavigation: true,
    workshop: {
      note: 'Стрелки, Home и End перемещают фокус. Enter выбирает устройство. Escape отменяет выбор. Tab продолжает переход между элементами формы.',
    },
  },
  play: async ({ canvas, canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', { name: 'Микрофон' })
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(page.getByRole('option', { name: 'Studio USB' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    await expect(page.getByRole('option', { name: /Очень длинное/ })).toHaveFocus()
    await userEvent.keyboard('{Home}{ArrowDown}')
    await expect(page.getByRole('option', { name: 'Встроенный микрофон' })).toHaveFocus()
    await expect(args.onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenCalledTimes(1)
    await expect(args.onChange).toHaveBeenCalledWith('builtin')
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}{End}{Escape}')
    await expect(page.queryByRole('listbox')).not.toBeInTheDocument()
    await expect(trigger).toHaveFocus()
    await expect(args.onChange).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Следующий элемент' })).toHaveFocus()
    await expect(page.queryByRole('listbox')).not.toBeInTheDocument()
    trigger.focus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.tab({ shift: true })
    await expect(canvas.getByRole('button', { name: 'Предыдущий элемент' })).toHaveFocus()
    await expect(args.onChange).toHaveBeenCalledTimes(1)
  },
}
export const Narrow: Story = {
  name: 'Узкая область с длинными названиями',
  args: { value: 'long' },
  parameters: { workshop: { width: 260, height: 420 } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Микрофон' }))
  },
}
