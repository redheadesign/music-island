import type { ReactNode } from 'react'
import type { AppConfig, MediaSnapshot } from '../../shared/lib/types'

export interface IslandModuleContext {
  config: AppConfig
  media: MediaSnapshot | null
  progressMs: number | null
  progressPercent: number
}

export interface IslandModule {
  id: string
  title: string
  icon: string
  defaultLayout: AppConfig['layout']['preset']
  renderCompact: (context: IslandModuleContext) => ReactNode
  renderExpanded: (context: IslandModuleContext) => ReactNode
  commands: string[]
  status: 'built-in' | 'reserved'
}

export const reservedModules = [
  {
    id: 'todo',
    title: 'Todo',
    icon: 'check',
    description: 'Quick local task capture inside the expanded island.',
  },
  {
    id: 'notes',
    title: 'Notes',
    icon: 'note',
    description: 'A local scratchpad for fast notes without leaving the current app.',
  },
  {
    id: 'transcription',
    title: 'Transcription',
    icon: 'mic',
    description: 'Future push-to-talk transcription with local LLM workflows inspired by RuFlow.',
  },
  {
    id: 'command-palette',
    title: 'Command Palette',
    icon: 'cmd',
    description: 'Fast actions for modules, media controls, settings and diagnostics.',
  },
] as const
