import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// First, so every component's stylesheet follows the page's own.
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
