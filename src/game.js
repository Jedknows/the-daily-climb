import {
  ROUNDS_PER_DAY, SECONDS_PER_ROUND, MAX_DAY_SCORE, TIERS, LADDER,
  altitudeFor, formatAltitude, altitudeText, landmarkFor, bandFor, cameraAnchor,
} from './rules.js'
import { scoreGuess } from './answers.js'
import { promptsForDay, promptsForEndless, dayNumber, nextResetAt } from './daily.js'
import { Sky } from './sky.js'
import { mountClimber } from './climber.js'
import { sfx, playTier, unlock, isMuted, toggleMuted, onMuteChange } from './audio.js'
import * as portal from './portal.js'

const WORLD_PX = 12 // screen pixels per point of score
const $ = (id) => document.getElementById(id)

// Flavour pinned along the climb, on top of the LADDER rungs. `major` lines
// are the zone boundaries and get bigger type.
const AMBIENT = [
  [8, 'L', 'the pad falls away'],
  [30, 'R', 'birds cruise about here'],
  [50, 'L', 'the clouds start'],
  [72, 'R', 'Everest — 8,849m'],
  [86, 'L', 'the airliners level off'],
  [100, 'R', 'THE TROPOPAUSE', 1],
  [118, 'L', 'weather stops. it is all clear above.'],
  [130, 'R', 'the Armstrong limit — blood boils here'],
  [160, 'L', 'the ozone layer'],
  [180, 'R', 'Baumgartner jumped from here'],
  [200, 'L', 'THE STRATOPAUSE', 1],
  [230, 'R', 'meteors burn up around you'],
  [260, 'L', 'noctilucent clouds — the highest clouds there are'],
  [285, 'R', 'the mesopause. the coldest place on Earth.'],
  [300, 'L', 'THE KÁRMÁN LINE — SPACE', 1],
  [318, 'R', 'no air. no sound. no weather.'],
  [360, 'L', 'the Space Station passes'],
  [400, 'R', 'THE AURORA CEILING', 1],
  [430, 'L', 'the Van Allen belts'],
  [465, 'R', 'geostationary — satellites hang still up here'],
  [500, 'L', 'THE MOON', 1],
  [530, 'R', 'Webb, watching from L2'],
  [560, 'L', 'you pass the Sun'],
  [580, 'R', 'Neptune. the last planet.'],
  [600, 'L', 'VOYAGER 1 — INTERSTELLAR SPACE', 1],
  [630, 'R', 'Proxima Centauri, the next star over'],
  [655, 'L', 'Betelgeuse'],
  [680, 'R', 'the Pillars of Creation'],
  [700, 'L', 'THE GALACTIC CORE — a perfect climb ends here', 1],
]

export class Game {
  constructor() {
    this.el = {
      stage: $('stage'), sky: $('sky'), world: $('world'), climber: $('climber'),
      hud: $('hud'), altValue: $('alt-value'), altUnit: $('alt-unit'),
      scoreValue: $('score-value'), pipbar: $('pipbar'), pipword: $('pipword'),
      title: $('title'), daynum: $('daynum'), answerbar: $('answerbar'),
      answer: $('answer'), timer: $('timer'), timerNum: $('timer-num'),
      continuebar: $('continuebar'), btnContinue: $('btn-continue'),
      summary: $('summary'), vignette: $('vignette'), flash: $('flash'),
      btnSound: $('btn-sound'), btnHelp: $('btn-help'), btnLaunch: $('btn-launch'),
      btnEndless: $('btn-endless'), how: $('how'),
    }

    this.sky = new Sky(this.el.sky, WORLD_PX)
    this.climber = mountClimber(this.el.climber)

    this.mode = 'daily'
    this.phase = 'title'
    this.score = 0
    this.camScore = 0
    this.targetScore = 0
    this.round = 0
    this.results = []
    this.questions = []
    this.endlessRuns = 0
    this.deadline = 0
    this.lastTick = -1
    this.timers = []

    this.buildWorld()
    this.wire()
    this.el.daynum.textContent = 'CLIMB #' + dayNumber()
    this.syncMuteButton()
    this.renderPips()

    this.lastFrame = performance.now()
    requestAnimationFrame(this.frame)
  }

  // ---------- setup ----------

  buildWorld() {
    const frag = document.createDocumentFragment()
    for (const [score, side, text, major] of AMBIENT) {
      const d = document.createElement('div')
      d.className = 'amb ' + side + (major ? ' major' : '')
      d.style.top = (MAX_DAY_SCORE - score) * WORLD_PX + 'px'
      d.innerHTML =
        side === 'L'
          ? '<span class="dash">──</span> ' + text
          : text + ' <span class="dash">──</span>'
      d.dataset.score = String(score)
      frag.appendChild(d)
    }
    this.el.world.appendChild(frag)
    this.ambients = [...this.el.world.querySelectorAll('.amb')]
  }

  wire() {
    const { el } = this

    el.btnLaunch.addEventListener('click', () => this.start('daily'))
    el.btnEndless.addEventListener('click', () => this.start('endless'))
    el.btnContinue.addEventListener('click', () => this.nextRound())
    el.btnSound.addEventListener('click', () => {
      toggleMuted()
      sfx.ui()
    })
    el.btnHelp.addEventListener('click', () => {
      el.how.open = !el.how.open
      el.how.scrollIntoView?.({ block: 'nearest' })
      sfx.ui()
    })
    onMuteChange(() => this.syncMuteButton())

    el.answerbar.addEventListener('submit', (e) => {
      e.preventDefault()
      this.submit(el.answer.value)
    })
    el.answer.addEventListener('input', () => sfx.type())

    // One unlock for the whole session; audio contexts stay suspended until
    // a real gesture touches them.
    const once = () => {
      unlock()
      window.removeEventListener('pointerdown', once)
      window.removeEventListener('keydown', once)
    }
    window.addEventListener('pointerdown', once)
    window.addEventListener('keydown', once)

    window.addEventListener('resize', () => this.sky.resize())

    // A tab that goes to sleep must not eat the clock: freeze on hide and
    // give the time back on return.
    document.addEventListener('visibilitychange', () => {
      if (this.phase !== 'asking') return
      if (document.hidden) {
        this.hiddenAt = performance.now()
      } else if (this.hiddenAt) {
        this.deadline += performance.now() - this.hiddenAt
        this.hiddenAt = 0
      }
    })
  }

  syncMuteButton() {
    const m = isMuted()
    this.el.btnSound.textContent = m ? '\u{1F507}' : '\u{1F508}'
    this.el.btnSound.classList.toggle('off', m)
    this.el.btnSound.setAttribute('aria-pressed', m ? 'true' : 'false')
    this.el.btnSound.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off')
  }

  later(fn, ms) {
    const id = setTimeout(fn, ms)
    this.timers.push(id)
    return id
  }
  clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  // ---------- run lifecycle ----------

  start(mode) {
    this.mode = mode
    this.clearTimers()
    this.score = 0
    this.camScore = 0
    this.targetScore = 0
    this.round = 0
    this.results = []
    this.questions =
      mode === 'daily' ? promptsForDay() : promptsForEndless(Date.now() ^ (++this.endlessRuns * 2654435761))

    document.body.classList.add('playing')
    this.el.title.classList.add('gone')
    this.el.summary.hidden = true
    this.el.summary.innerHTML = ''
    this.el.hud.hidden = false
    this.el.scoreValue.textContent = '0'
    this.renderPips()
    this.el.world.querySelectorAll('.card, .landed').forEach((n) => n.remove())
    this.ambients.forEach((a) => a.classList.remove('passed'))

    sfx.launch()
    this.climber.setState('boost', 900)
    portal.gameplayStart()

    this.later(() => {
      this.el.title.hidden = true
      this.beginRound()
    }, 900)
  }

  beginRound() {
    const q = this.questions[this.round]
    if (!q) return this.finish()

    this.phase = 'asking'
    this.renderPips()

    const card = document.createElement('div')
    card.className = 'card'
    card.style.top = (MAX_DAY_SCORE - this.score) * WORLD_PX - 150 + 'px'
    card.innerHTML =
      `<div class="rnd">PROMPT ${this.round + 1} OF ${ROUNDS_PER_DAY}</div>` +
      `<div class="prompt"></div>` +
      (q.note ? `<div class="note"></div>` : '') +
      `<div class="hint">▲ rarer answers climb higher ▲</div>`
    card.querySelector('.prompt').textContent = q.prompt
    if (q.note) card.querySelector('.note').textContent = q.note
    this.el.world.appendChild(card)
    this.promptCard = card

    this.el.answerbar.hidden = false
    this.el.continuebar.hidden = true
    this.el.answer.value = ''
    this.el.answer.disabled = false
    // Focusing on a phone throws up the keyboard and eats half the screen.
    if (!matchMedia('(pointer: coarse)').matches) this.el.answer.focus()

    this.deadline = performance.now() + SECONDS_PER_ROUND * 1000
    this.lastTick = -1
    this.hiddenAt = 0
  }

  submit(raw) {
    if (this.phase !== 'asking') return
    this.phase = 'revealing'
    this.el.answer.disabled = true
    this.el.answerbar.hidden = true
    document.documentElement.style.setProperty('--urgency', '0')
    this.el.timer.classList.remove('hot')

    const q = this.questions[this.round]
    const result = scoreGuess(q, raw)
    const from = this.score
    this.score = Math.min(MAX_DAY_SCORE, this.score + result.points)
    this.targetScore = this.score
    this.results.push({ prompt: q.prompt, ...result })

    if (this.promptCard) {
      const card = this.promptCard
      card.style.transition = 'opacity .45s linear, transform .45s var(--ease-out)'
      card.style.opacity = '0'
      card.style.transform = 'translate(-50%, -20px)'
      this.later(() => card.remove(), 520)
      this.promptCard = null
    }

    this.showLanding(result, from)
  }

  showLanding(result, fromScore) {
    const tier = result.tier
    const colour = tier ? `var(--tier-${tier.id})` : 'var(--tier-miss)'
    const el = document.createElement('div')
    el.className = 'landed' + (tier ? '' : ' miss')
    // The panel is bottom-anchored in CSS; this is the gap between the
    // player's head and the underside of the card.
    el.style.top = (MAX_DAY_SCORE - this.score) * WORLD_PX - 30 + 'px'
    el.style.setProperty('--tc', colour)

    const alt = altitudeText(altitudeFor(this.score))
    el.innerHTML =
      `<div class="tname">${tier ? tier.name.toUpperCase() : 'NOTHING LIFTED'}</div>` +
      `<div class="tans"></div>` +
      `<div class="tpts"><b>+${result.points} PTS</b>${
        result.points > 0 ? ` &middot; ${alt} up` : ''
      }</div>` +
      `<div class="tsub"></div>`
    el.querySelector('.tans').textContent = result.text ? `“${result.text}”` : '—'
    el.querySelector('.tsub').textContent = result.hit
      ? result.quip
      : 'never got off the ground.'
    this.el.world.appendChild(el)
    this.landedCard = el

    if (tier) {
      playTier(tier.id)
      this.flash(colour, tier.id === 'astronomical' ? 0.5 : 0.26)
      if (tier.id === 'tooclever') {
        this.shake()
        this.climber.setState('flail', 1600)
      } else if (tier.id === 'astronomical') {
        this.climber.setState('cheer', 2200)
        portal.happytime()
      } else if (tier.score >= 60) {
        this.climber.setState('boost', 900)
      }
    } else {
      sfx.miss()
      this.climber.setState('slump', 1200)
    }

    this.animateScore(fromScore + (this.score - fromScore) * 0, this.score)
    this.el.continuebar.hidden = false
    this.el.btnContinue.textContent =
      this.round + 1 >= ROUNDS_PER_DAY ? 'SEE THE CLIMB ▲' : 'ASCEND ▲'
    this.phase = 'landed'
  }

  nextRound() {
    if (this.phase !== 'landed') return
    sfx.ui()
    this.el.continuebar.hidden = true
    if (this.landedCard) {
      const card = this.landedCard
      card.style.animation = 'none'
      card.style.transition = 'opacity .5s linear'
      card.style.opacity = '0'
      this.later(() => card.remove(), 560)
      this.landedCard = null
    }
    this.round++
    if (this.round >= ROUNDS_PER_DAY) return this.finish()
    this.later(() => this.beginRound(), 260)
  }

  finish() {
    this.phase = 'done'
    this.el.answerbar.hidden = true
    this.el.continuebar.hidden = true
    portal.gameplayStop()
    sfx.finish()
    this.later(() => this.renderSummary(), 700)
  }

  // ---------- rendering ----------

  animateScore(from, to) {
    const t0 = performance.now()
    const dur = 900
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - k, 4)
      this.el.scoreValue.textContent = String(Math.round(from + (to - from) * e))
      if (k < 1) requestAnimationFrame(step)
      else {
        this.el.scoreValue.textContent = String(to)
        this.el.scoreValue.classList.add('slam')
        this.later(() => this.el.scoreValue.classList.remove('slam'), 520)
      }
    }
    requestAnimationFrame(step)
  }

  flash(colour, strength) {
    const f = this.el.flash
    f.style.transition = 'none'
    f.style.background = colour
    f.style.opacity = String(strength)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        f.style.transition = 'opacity .5s ease-out'
        f.style.opacity = '0'
      })
    )
  }

  shake() {
    const s = this.el.stage
    s.classList.remove('shake')
    void s.offsetWidth
    s.classList.add('shake')
  }

  renderPips() {
    const bar = this.el.pipbar
    if (bar.children.length !== ROUNDS_PER_DAY) {
      bar.innerHTML = ''
      for (let i = 0; i < ROUNDS_PER_DAY; i++) bar.appendChild(document.createElement('span'))
    }
    ;[...bar.children].forEach((sp, i) => {
      sp.className = i < this.round ? 'done' : i === this.round && this.phase !== 'title' ? 'cur' : ''
    })
    this.el.pipword.textContent =
      this.phase === 'title'
        ? 'LAUNCH PAD'
        : this.round >= ROUNDS_PER_DAY
          ? 'CLIMB COMPLETE'
          : landmarkFor(this.camScore).label
  }

  frame = (now) => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now

    // Camera easing: a soft chase so the world glides rather than snapping.
    const diff = this.targetScore - this.camScore
    if (Math.abs(diff) > 0.02) this.camScore += diff * Math.min(1, dt * 2.6)
    else this.camScore = this.targetScore

    const vh = window.innerHeight
    const anchor = cameraAnchor(this.camScore)
    const offset = vh * anchor - (MAX_DAY_SCORE - this.camScore) * WORLD_PX
    this.el.world.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
    this.el.climber.style.top = (anchor * 100).toFixed(2) + '%'

    this.sky.draw(this.camScore, dt)
    this.climber.setAltitude(this.camScore)

    const { value, unit } = formatAltitude(altitudeFor(this.camScore))
    this.el.altValue.textContent = value
    this.el.altUnit.textContent = unit

    // The dark closes in as the air thins — a slow vignette tied to altitude.
    this.el.vignette.style.opacity = String(Math.min(0.85, Math.max(0, (this.camScore - 180) / 420)))
    this.el.vignette.style.background =
      'radial-gradient(ellipse at 50% 48%, transparent 34%, rgba(2,4,10,.55) 74%, rgba(2,4,10,.92) 100%)'

    for (const a of this.ambients) {
      if (!a.classList.contains('passed') && this.camScore >= Number(a.dataset.score)) {
        a.classList.add('passed')
      }
    }

    if (this.phase === 'asking') this.tickClock(now)
    if (this.phase !== 'title') this.renderPips()

    requestAnimationFrame(this.frame)
  }

  tickClock(now) {
    const left = Math.max(0, this.deadline - now)
    const secs = Math.ceil(left / 1000)
    if (secs !== this.lastTick) {
      this.lastTick = secs
      this.el.timerNum.textContent = String(secs)
      if (secs <= 5 && secs > 0) sfx.warn()
      else if (secs <= 10 && secs > 5) sfx.tick()
    }
    const urgency = left < 6000 ? 1 - left / 6000 : 0
    document.documentElement.style.setProperty('--urgency', urgency.toFixed(2))
    this.el.timer.classList.toggle('hot', left < 5000)
    if (left <= 0) this.submit(this.el.answer.value)
  }

  renderSummary() {
    const total = this.score
    const band = bandFor(total)
    const alt = altitudeFor(total)
    const s = this.el.summary
    const rows = this.results
      .map((r, i) => {
        const colour = r.tier ? `var(--tier-${r.tier.id})` : 'var(--tier-miss)'
        const name = r.tier ? r.tier.name : '—'
        return (
          `<div class="sum-row"><span class="n">${i + 1}</span>` +
          `<span class="a${r.text ? '' : ' none'}">${escapeHtml(r.text || 'no answer')}</span>` +
          `<span class="t" style="color:${colour}">${name}</span>` +
          `<span class="p">${r.points}</span></div>`
        )
      })
      .join('')

    const reachedLabel = landmarkFor(total).label
    s.innerHTML =
      `<div class="sum-verdict" style="color:var(--tier-${band.tier})">${escapeHtml(band.verdict)}</div>` +
      `<div class="sum-final">${total}<small> / ${MAX_DAY_SCORE}</small></div>` +
      `<div class="sum-alt">you reached ${altitudeText(alt)} — ${escapeHtml(reachedLabel)}</div>` +
      `<div class="sum-rows">${rows}</div>` +
      `<div class="sum-actions">
         <button id="sum-copy" type="button">COPY RESULT</button>
         <button id="sum-again" type="button" class="ghost">ENDLESS ∞</button>
       </div>` +
      `<div class="sum-note" id="sum-note"></div>`
    s.hidden = false

    const note = $('sum-note')
    if (this.mode === 'daily') {
      const ms = nextResetAt() - new Date()
      const hrs = Math.floor(ms / 3_600_000)
      const mins = Math.floor((ms % 3_600_000) / 60_000)
      note.textContent = `next climb in ${hrs}h ${mins}m — or keep going in Endless.`
    } else {
      note.textContent = 'endless run. the daily is still waiting.'
    }

    $('sum-copy').addEventListener('click', () => this.copyResult(total, band))
    $('sum-again').addEventListener('click', () => {
      this.el.summary.hidden = true
      this.start('endless')
    })
  }

  copyResult(total, band) {
    const glyphs = this.results
      .map((r) => (r.tier ? TIERS[r.tier.id].emoji : '⬛'))
      .join('')
    const label = this.mode === 'daily' ? `Climb #${dayNumber()}` : 'Endless Climb'
    const text =
      `The Daily Climb — ${label}\n${glyphs}\n` +
      `${total}/${MAX_DAY_SCORE} · ${altitudeText(altitudeFor(total))} · ${band.verdict}`
    const btn = $('sum-copy')
    const done = (ok) => {
      btn.textContent = ok ? 'COPIED ✓' : 'COPY FAILED'
      setTimeout(() => (btn.textContent = 'COPY RESULT'), 1600)
    }
    navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)) ?? done(false)
    sfx.ui()
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

export { LADDER, TIERS }
