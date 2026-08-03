import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// Mobile-app-only adjustments. On the website (non-native) nothing here runs,
// so the site keeps pinch-zoom, normal scrolling, etc. exactly as before.
if (Capacitor?.isNativePlatform?.()) {
  document.documentElement.classList.add('native-app')
  const vp = document.querySelector('meta[name="viewport"]')
  if (vp) {
    vp.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
