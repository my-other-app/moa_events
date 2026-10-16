import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// The older pages' global rules, where form.css used to put them in the cascade.
import './styles/legacy-base.css'
import App from './App.jsx'
import { rememberRef } from './utils/ref'

// A tracking link lands here with ?ref=; keep it for the sign-up a moment later.
rememberRef()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
