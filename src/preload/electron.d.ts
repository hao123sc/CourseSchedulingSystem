import type { ElectronAPI } from '@electron-toolkit/preload'
import type { ZhikepaiApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    zhikepai: ZhikepaiApi
  }
}
