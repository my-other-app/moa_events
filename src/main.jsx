import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { rememberRef } from './utils/ref'

// A tracking link lands here with ?ref=; keep it for the sign-up a moment later.
rememberRef()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
