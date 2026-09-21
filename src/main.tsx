/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorProvider } from './errorContext'

// The dedicated IDE window loads the same bundle with ?window=ide (Cursor-style
// "IDE →" separate window); everything else renders the normal chat app.
const isIdeWindow =
  new URLSearchParams(window.location.search).get("window") === "ide"

// Keep the chat and IDE entry points out of each other's initial bundle. The
// same HTML entry is used by both windows, but each window only needs one app.
const App = lazy(() => import('./App.tsx'))
const IdeWindowApp = lazy(() => import('./ide/IdeWindowApp.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorProvider>
      <Suspense fallback={null}>
        {isIdeWindow ? <IdeWindowApp /> : <App />}
      </Suspense>
    </ErrorProvider>
  </StrictMode>,
)