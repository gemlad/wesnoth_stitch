import { ElectronAPI } from '@electron-toolkit/preload'
import type { SpriteApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: SpriteApi
  }
}
