import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initUiPreferences } from './stores/uiStore'
import './styles/globals.css'

// 在首帧之前恢复界面缩放，避免先按 100% 渲染再跳一下
initUiPreferences()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
