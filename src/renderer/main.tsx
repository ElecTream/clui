import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HostApp from './HostApp'
import './index.css'

// Phase 0.1 — same renderer bundle is loaded into both the pill window
// and the new host window. Branch on the URL query so each top-level
// surface only mounts the components it needs. Single bundle, two roots.
const params = new URLSearchParams(window.location.search)
const windowKind = params.get('window') === 'host' ? 'host' : 'pill'

// Tag the document so window-scoped CSS rules can target the correct shell
// (e.g. the host needs an opaque body, the pill needs transparent).
document.documentElement.setAttribute('data-clui-window', windowKind)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {windowKind === 'host' ? <HostApp /> : <App />}
  </React.StrictMode>
)
