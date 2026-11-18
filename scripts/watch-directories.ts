import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A worktree can itself live under .local, and src/stories/release contains
// source files. Ignore only generated directories directly under this project.
const root = fileURLToPath(new URL('../', import.meta.url))
export const ignoredWatchPaths = ['.local', 'src-tauri', 'release', 'storybook-static']
  .map(name => path.resolve(root, name).replaceAll('\\', '/') + '/**')
