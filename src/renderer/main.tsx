import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HostApp from './HostApp'
import PopoutApp from './PopoutApp'
import './index.css'

// Same renderer bundle is loaded into the pill, the host, and any number
// of per-tab pop-out viewports. Branch on the URL query so each top-level
// surface only mounts the components it needs. Single bundle, three
// roots.
const params = new URLSearchParams(window.location.search)
const rawKind = params.get('window')
const windowKind: 'pill' | 'host' | 'popout' =
  rawKind === 'host' ? 'host' : rawKind === 'popout' ? 'popout' : 'pill'

// Tag the document so window-scoped CSS rules can target the correct shell
// (e.g. the host + popout need an opaque body, the pill needs transparent).
document.documentElement.setAttribute('data-clui-window', windowKind)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {windowKind === 'host' && <HostApp />}
    {windowKind === 'popout' && <PopoutApp />}
    {windowKind === 'pill' && <App />}
  </React.StrictMode>
)
