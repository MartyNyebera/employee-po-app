import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '../styles/index.css'
import { Toaster } from './components/ui/sonner'

// Version for cache busting
const VERSION = '1.0.0'

// Version check function
const checkVersion = async () => {
  try {
    const response = await fetch('/version.txt?t=' + new Date().getTime())
    if (response.ok) {
      const currentVersion = await response.text()
      if (currentVersion.trim() !== VERSION) {
                window.location.reload()
      }
    }
  } catch (error) {
      }
}

// Check version every 30 seconds
setInterval(checkVersion, 30000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
)
