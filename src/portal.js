// CrazyGames packaging. The same bundle runs on the open web and inside
// their iframe; this module is the only place the two differ, and every call
// is a safe no-op when __PORTAL__ is null or the SDK is blocked.
import { setSdkMuted } from './audio.js'

export const PORTAL = typeof __PORTAL__ !== 'undefined' ? __PORTAL__ : null
export const isPortal = () => PORTAL === 'crazygames'

let sdkLoad = null
export function loadSdk() {
  if (!isPortal()) return Promise.resolve(null)
  if (!sdkLoad) {
    sdkLoad = new Promise((resolve) => {
      const s = document.createElement('script')
      s.async = true
      s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
      s.onload = async () => {
        try {
          await window.CrazyGames.SDK.init()
          resolve(window.CrazyGames.SDK)
        } catch {
          sdkLoad = null // blocked or disabled — stays retryable
          resolve(null)
        }
      }
      s.onerror = () => {
        sdkLoad = null
        s.remove()
        resolve(null)
      }
      document.head.appendChild(s)
    })
  }
  return sdkLoad
}

const call = (path) => {
  if (!isPortal()) return
  loadSdk().then((sdk) => {
    try {
      path(sdk)
    } catch { /* SDK disabled: the build is running outside their frame */ }
  })
}

// They measure load time and load-crash rate between these two markers. Ship
// without them and their harness infers the window, which books early
// bounces as crashes.
let loadingStarted = false
let loadingStopped = false
export function loadingStart() {
  if (!isPortal() || loadingStarted) return
  loadingStarted = true
  call((sdk) => {
    if (!loadingStopped) sdk?.game?.loadingStart?.()
  })
}
export function loadingStop() {
  if (!isPortal() || loadingStopped || !loadingStarted) return
  loadingStopped = true
  call((sdk) => sdk?.game?.loadingStop?.())
}

export const gameplayStart = () => call((sdk) => sdk?.game?.gameplayStart?.())
export const gameplayStop = () => call((sdk) => sdk?.game?.gameplayStop?.())
export const happytime = () => call((sdk) => sdk?.game?.happytime?.())

// Platform mute: the embed can arrive muted, and the player can toggle it
// from their chrome mid-session. Their QA checks that the in-game button
// cannot override it.
export function wireAudio() {
  if (!isPortal()) return
  try {
    if (new URLSearchParams(location.search).get('muteAudio') === 'true') setSdkMuted(true)
  } catch { /* malformed query string */ }
  call((sdk) =>
    sdk?.game?.addSettingsChangeListener?.((s) => {
      if (typeof s?.muteAudio === 'boolean') setSdkMuted(s.muteAudio)
    })
  )
}

// On their mobile page the iframe already sits below the browser chrome, but
// the browser hands it the parent's safe-area inset anyway — so honouring it
// raw reserves that band twice and sinks the HUD into the play field. Hold
// half of it when the frame really does cover the screen, none when it
// doesn't. Off-portal, raw env() is correct and is left alone.
export function fitTopInset() {
  if (!isPortal()) return
  let framed = false
  try {
    framed = window.self !== window.top
  } catch {
    framed = true // a cross-origin parent throws, which IS being framed
  }
  if (!framed) return
  const root = document.documentElement
  const apply = () => {
    const coversScreen =
      Boolean(document.fullscreenElement) ||
      window.innerHeight >= (window.screen?.height ?? Infinity) - 4
    root.style.setProperty('--top-inset', coversScreen ? 'calc(env(safe-area-inset-top, 0px) / 2)' : '0px')
  }
  apply()
  window.addEventListener('resize', apply)
  document.addEventListener('fullscreenchange', apply)
}

// Their storage wrapper survives contexts where localStorage is partitioned
// away inside the iframe; off-portal it falls straight through.
export const store = {
  get(key) {
    try {
      const sdk = window.CrazyGames?.SDK
      if (isPortal() && sdk?.data) return sdk.data.getItem(key)
    } catch { /* fall through to localStorage */ }
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      const sdk = window.CrazyGames?.SDK
      if (isPortal() && sdk?.data) {
        sdk.data.setItem(key, value)
        return
      }
    } catch { /* fall through to localStorage */ }
    try {
      localStorage.setItem(key, value)
    } catch { /* nothing to persist to */ }
  },
}
