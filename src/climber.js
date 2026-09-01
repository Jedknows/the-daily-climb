// The player's sprite. Two silhouettes for one journey: a balloon while
// there's still air to float in, a rocket once there isn't. The swap happens
// at the Karman line, which turns "you reached space" from a number on the
// HUD into something you watch happen.
const NS = 'http://www.w3.org/2000/svg'

const BALLOON = `
<g class="rig balloon">
  <rect x="8" y="1" width="10" height="2" fill="#ff5d8f"/>
  <rect x="6" y="3" width="14" height="8" fill="#ff5d8f"/>
  <rect x="6" y="3" width="4" height="8" fill="#ff86ad"/>
  <rect x="8" y="11" width="10" height="2" fill="#e0447a"/>
  <rect x="12" y="13" width="2" height="4" fill="#7d93b8"/>
  <rect x="9" y="17" width="8" height="6" fill="#4a5c7d"/>
  <rect x="9" y="17" width="8" height="2" fill="#7d93b8"/>
  <rect x="11" y="19" width="4" height="3" fill="#4de3ff"/>
</g>`

const ROCKET = `
<g class="rig rocket">
  <rect x="11" y="1" width="4" height="3" fill="#e8f1ff"/>
  <rect x="9" y="4" width="8" height="11" fill="#e8f1ff"/>
  <rect x="9" y="4" width="3" height="11" fill="#b9cbe6"/>
  <rect x="11" y="6" width="4" height="4" fill="#4de3ff"/>
  <rect x="6" y="11" width="3" height="6" fill="#ff5252"/>
  <rect x="17" y="11" width="3" height="6" fill="#ff5252"/>
  <rect x="9" y="15" width="8" height="2" fill="#7d93b8"/>
  <g class="flame">
    <rect x="10" y="17" width="6" height="5" fill="#ffd166"/>
    <rect x="11" y="19" width="4" height="5" fill="#ff9f43"/>
    <rect x="12" y="22" width="2" height="4" fill="#ff5252"/>
  </g>
</g>`

export function mountClimber(el) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 26 34')
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.innerHTML = BALLOON + ROCKET
  el.appendChild(svg)

  const balloon = svg.querySelector('.balloon')
  const rocket = svg.querySelector('.rocket')

  return {
    // Cross-fade the rigs across the Karman line rather than hard-cutting, so
    // the change reads as a transformation instead of a glitch.
    setAltitude(score) {
      const toRocket = score < 285 ? 0 : score > 315 ? 1 : (score - 285) / 30
      balloon.style.opacity = String(1 - toRocket)
      rocket.style.opacity = String(toRocket)
    },
    setState(name, ms = 1400) {
      el.classList.remove('cheer', 'flail', 'slump', 'boost')
      void el.offsetWidth
      if (!name) return
      el.classList.add(name)
      clearTimeout(this._t)
      this._t = setTimeout(() => el.classList.remove(name), ms)
    },
  }
}
