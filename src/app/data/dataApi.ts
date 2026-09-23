import { invoke } from '@tauri-apps/api/core'
import type { DataSnapshot } from '../../shared/lib/dataTypes'
export const dataApi = {
  snapshot: () => invoke<DataSnapshot>('get_data_snapshot'),
  open: () => invoke<void>('open_data_folder'),
  removeAll: (confirmation: string) => invoke<void>('delete_all_data_and_exit', { confirmation }),
}
