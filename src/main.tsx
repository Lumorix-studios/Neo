import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import IdeWindowApp from './ide/IdeWindowApp.tsx'
import { ErrorProvider } from './errorContext'

// The dedicated IDE window loads the same bundle with ?window=ide (Cursor-style
// "IDE →" separate window); everything else renders the normal chat app.
const isIdeWindow =
  new URLSearchParams(window.location.search).get("window") === "ide"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorProvider>
      {isIdeWindow ? <IdeWindowApp /> : <App />}
    </ErrorProvider>
  </StrictMode>,
)