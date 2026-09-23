export interface DataSnapshot { folders: { path: string; bytes: number }[]; models: number; history: number; runtime: number; total: number; confirmation: string }
export interface HandyImportPreview { items: { id: string; name: string; source: string; bytes: number; exists: boolean }[]; settings: string[]; settingsPath: string }
