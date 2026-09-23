import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PlaybackButton, ReactionButton } from '../../features/music/MusicControls'
function Feedback({reducedMotion = false}: {reducedMotion?: boolean}) {
  const [playing, setPlaying]=useState(false), [liked,setLiked]=useState(false)
  return <IslandFeedback className="island-root media-controls island-card island-surface" style={{position:'relative',display:'flex',gap:24,padding:24,width:'max-content',pointerEvents:'auto'}}>
    <PlaybackButton playing={playing} reducedMotion={reducedMotion} onClick={() => setPlaying((value) => !value)} />
    <ReactionButton kind="like" active={liked} reducedMotion={reducedMotion} onClick={() => setLiked((value) => !value)} />
  </IslandFeedback>
}
const meta = {title: 'Atoms/PlaybackFeedback',component: Feedback,parameters:{workshop:{width:300,height:140}}} satisfies Meta<typeof Feedback>
export default meta
type Story = StoryObj<typeof meta>
export const MouseAndKeyboard: Story = {name:'Нажатия мышью и клавиатурой',play:async ({canvasElement}) => {
  const canvas=within(canvasElement)
  await userEvent.click(canvas.getByRole('button',{name:'Play'}))
  await userEvent.click(canvas.getByRole('button',{name:'Pause'}))
  await userEvent.keyboard('{Enter}')
  await expect(canvas.getByRole('button',{name:'Pause'})).toBeInTheDocument()
  await userEvent.click(canvas.getByRole('button',{name:'Добавить в любимое'}))
  await expect(canvas.getByRole('button',{name:'Убрать из любимого'})).toHaveAttribute('aria-pressed','true')
}}
export const ReducedMotion: Story = {name:'Без движения',args:{reducedMotion:true},play:async ({canvasElement}) => {
  await userEvent.click(within(canvasElement).getByRole('button',{name:'Play'}))
  await expect(canvasElement.querySelector('.island-feedback__wave')).not.toBeInTheDocument()
}}
