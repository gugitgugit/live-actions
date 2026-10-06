import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/theme.css'
import './popup.css'
import { App } from './App'

document.documentElement.lang = chrome.i18n.getUILanguage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
