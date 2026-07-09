import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels, type SpriteApi } from '../shared/ipc'

// Renderer-facing IPC surface: thin wrappers over ipcRenderer.invoke so the
// renderer never sees ipcRenderer or raw channel names (§4). Typed against
// SpriteApi so the wrappers can't drift from the main-process handlers.
const api: SpriteApi = {
  getSpriteList: () => ipcRenderer.invoke(IpcChannels.getSpriteList),
  getThumbnail: (id) => ipcRenderer.invoke(IpcChannels.getThumbnail, id),
  getFullImage: (id) => ipcRenderer.invoke(IpcChannels.getFullImage, id),
  convertSprite: (id, colourCount) => ipcRenderer.invoke(IpcChannels.convertSprite, id, colourCount)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
