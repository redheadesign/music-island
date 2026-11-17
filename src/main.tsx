import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GlassRefraction } from './shared/ui/GlassRefraction'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlassRefraction />
    <App />
  </StrictMode>,
)
