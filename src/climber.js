// The mascot. Screen-fixed beside the action, the way the dive game's krill
// is: it does not fly with your answer, it watches it go and reacts.
//
// It is a balloon the whole way up, and it INFLATES as it climbs — which is
// what a real stratospheric balloon does as the air thins — and puffs up a
// notch on every landing. Altitude drives the envelope's size through an
// SVG transform attribute; the landing pump is a CSS animation on a wrapper
// group, so the two never fight over one transform.
import { iconSvg } from './icons.js'

const NS = 'http://www.w3.org/2000/svg'

const BALLOON = `
<g class="rig">
  <g class="pump">
    <g class="envelope">
      <rect x="10" y="0" width="6" height="1" fill="#ff5d8f"/>
      <rect x="8" y="1" width="10" height="1" fill="#ff5d8f"/>
      <rect x="7" y="2" width="12" height="1" fill="#ff5d8f"/>
      <rect x="6" y="3" width="14" height="6" fill="#ff5d8f"/>
      <rect x="7" y="9" width="12" height="1" fill="#f0508a"/>
      <rect x="8" y="10" width="10" height="1" fill="#e0447a"/>
      <rect x="10" y="11" width="6" height="1" fill="#e0447a"/>
      <rect x="12" y="12" width="2" height="1" fill="#c93a6c"/>
      <rect x="7" y="3" width="3" height="5" fill="#ff86ad"/>
      <rect x="8" y="2" width="2" height="1" fill="#ff86ad"/>
      <rect x="9" y="3" width="1" height="2" fill="#ffb6cf"/>
      <rect x="13" y="0" width="1" height="12" fill="#e94d82" opacity=".55"/>
    </g>
  </g>
  <rect x="12" y="13" width="2" height="4" fill="#7d93b8"/>
  <rect x="9" y="17" width="8" height="6" fill="#4a5c7d"/>
  <rect x="9" y="17" width="8" height="2" fill="#7d93b8"/>
  <rect x="11" y="19" width="4" height="3" fill="#4de3ff"/>
</g>`

const band = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)))

const BLUBS = ['whee!', 'hup!', 'up!', 'onward!']

export function mountClimber(el, { onPoke } = {}) {
  const mascot = document.createElement('div')
  mascot.className = 'mascot'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 26 34')
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.setAttribute('class', 'sprite')
  svg.innerHTML = BALLOON
  const blub = document.createElement('span')
  blub.className = 'blub'
  blub.textContent = BLUBS[0]
  mascot.appendChild(svg)
  mascot.appendChild(blub)
  el.appendChild(mascot)

  const envelope = svg.querySelector('.envelope')
  const pump = svg.querySelector('.pump')
  let stateTimer = 0
  let gold = false

  const api = {
    el,
    mascot,
    isGold: () => gold,

    setAltitude(score) {
      const s = 1 + 1.5 * band(score, 0, 150) + 0.5 * band(score, 150, 700)
      envelope.setAttribute('transform', `translate(13 13) scale(${s.toFixed(3)}) translate(-13 -13)`)
      envelope.style.opacity = String(1 - 0.16 * band(score, 0, 150))
    },

    pump() {
      pump.classList.remove('go')
      void pump.getBBox()
      pump.classList.add('go')
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
