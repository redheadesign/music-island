import type { dataApi as nativeApi } from '../../app/data/dataApi'
export const dataApi: typeof nativeApi = {
  snapshot: async () => ({ folders: [{ path: 'C:\\Users\\User\\AppData\\Roaming\\Music Island', bytes: 810_000_000 }], models: 700_000_000, history: 10_000_000, runtime: 100_000_000, total: 810_000_000, confirmation: 'storybook-only' }),
  open: async () => {}, removeAll: async () => {},
}
