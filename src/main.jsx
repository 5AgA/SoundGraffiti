import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/skeleton-shimmer.css'
import App from './App.jsx'

// 풀 리로드 직후 홈에서 mapFocusPostId 포커스를 한 번 무시
function markReloadForHomeFeedReset() {
  try {
    const entries = performance.getEntriesByType?.('navigation')
    const nav = entries?.[0]
    if (nav && nav.type === 'reload') {
      sessionStorage.setItem('soundgraffitiSuppressMapFocusOnce', '1')
      return
    }
  } catch {
    /* noop */
  }
  try {
    const legacy = performance.navigation
    if (legacy && legacy.type === legacy.TYPE_RELOAD) {
      sessionStorage.setItem('soundgraffitiSuppressMapFocusOnce', '1')
    }
  } catch {
    /* noop */
  }
}

markReloadForHomeFeedReset()
setTimeout(markReloadForHomeFeedReset, 0)

try {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }
} catch {
  /* noop */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
