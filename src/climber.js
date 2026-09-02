// The mascot. Screen-fixed beside the action, the way the dive game's krill
// is: it does not fly with your answer, it watches it go and reacts. Two
// rigs for one journey — a balloon while there is air to float in, a rocket
// once there isn't — cross-faded at the Karman line.
import { iconSvg } from './icons.js'

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

const BLUBS = ['whee!', 'hup!', 'up!', 'onward!']

export function mountClimber(el, { onPoke } = {}) {
  const mascot = document.createElement('div')
  mascot.className = 'mascot'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 26 34')
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.setAttribute('class', 'sprite')
  svg.innerHTML = BALLOON + ROCKET
  const blub = document.createElement('span')
  blub.className = 'blub'
  blub.textContent = BLUBS[0]
  mascot.appendChild(svg)
  mascot.appendChild(blub)
  el.appendChild(mascot)

  const balloon = svg.querySelector('.balloon')
  const rocket = svg.querySelector('.rocket')
  let stateTimer = 0
  let gold = false

  const api = {
    el,
    mascot,
    isGold: () => gold,

    setAltitude(score) {
      const toRocket = score < 285 ? 0 : score > 315 ? 1 : (score - 285) / 30
      balloon.style.opacity = String(1 - toRocket)
      rocket.style.opacity = String(toRocket)
    },

    // Reactions live on the sprite; the idle hover lives on the wrapper, so
    // the two never fight over one transform.
    react(name, ms = 0) {
      svg.classList.remove('celebrate', 'faint', 'sad', 'roll', 'boost')
      void svg.offsetWidth
      clearTimeout(stateTimer)
      if (!name) return
      svg.classList.add(name)
      if (ms) stateTimer = setTimeout(() => svg.classList.remove(name), ms)
    },

    // Gold mode: earned by an Astronomical, kept for the rest of the run.
    setGold(on, { quiet = false } = {}) {
      gold = !!on
      mascot.classList.toggle('gold', gold)
      if (gold && !quiet) {
        mascot.classList.remove('gilding')
        void mascot.offsetWidth
        mascot.classList.add('gilding')
        setTimeout(() => mascot.classList.remove('gilding'), 1200)
      }
    },

    blub() {
      blub.textContent = BLUBS[(Math.random() * BLUBS.length) | 0]
      blub.classList.remove('show')
      void blub.offsetWidth
      blub.classList.add('show')
    },
  }

  mascot.addEventListener('click', () => {
    api.blub()
    api.react('roll', 950)
    onPoke?.()
  })

  return api
}

export { iconSvg }
