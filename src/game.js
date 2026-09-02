import {
  ROUNDS_PER_DAY, SECONDS_PER_ROUND, MAX_DAY_SCORE, TIERS, TIER_IDS,
  altitudeFor, formatAltitude, altitudeText, landmarkFor, bandFor, cameraAnchor,
} from './rules.js'
import { scoreGuess } from './answers.js'
import { promptsForDay, promptsForEndless, dayNumber, nextResetAt } from './daily.js'
import { distributionFor, betterThan, recordRun, loadHistory, BUCKET } from './distribution.js'
import { Sky } from './sky.js'
import { Fx } from './fx.js'
import { mountClimber } from './climber.js'
import { iconSvg } from './icons.js'
import { event as sound, unlock, isMuted, toggleMuted, onMuteChange } from './audio.js'
import * as portal from './portal.js'

const WORLD_PX = 12 // screen pixels per point of score
const LEAD = 5 // points the camera runs ahead of the answer in flight
const $ = (id) => document.getElementById(id)
const rand = (a, b) => a + Math.random() * (b - a)
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2

// How long each tier's answer takes to fly, and the curve it flies on. The
// better the answer, the longer you get to watch it go — the flight IS the
// reward, so the reward scales.
const FLIGHT = {
  dust: { dur: 3400, ease: easeSine },
  tooclever: { dur: 3000, ease: easeIO },
  flocker: { dur: 3000, ease: easeIO },
  rare: { dur: 3400, ease: easeIO },
  farout: { dur: 4300, ease: easeIO },
  astronomical: { dur: 4600, ease: easeIO },
}

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

// "coke" -> "Coke". Text the player typed with any capitals is left alone.
function displayCase(text) {
  const t = String(text ?? '').trim()
  if (!t || t !== t.toLowerCase()) return t
  return t.replace(/(^|[\s\-'’(])(\p{L})/gu, (m, pre, ch) => pre + ch.toUpperCase())
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export class Game {
  constructor() {
    this.el = {
      stage: $('stage'), sky: $('sky'), fx: $('fx'), world: $('world'), climber: $('climber'),
      hud: $('hud'), altValue: $('alt-value'), altUnit: $('alt-unit'), scoreValue: $('score-value'),
      pipbar: $('pipbar'), pipword: $('pipword'), title: $('title'), daynum: $('daynum'),
      countdown: $('countdown'), answerwrap: $('answerwrap'), answerbar: $('answerbar'),
      answer: $('answer'), btnSubmit: $('btn-submit'), timer: $('timer'), timerNum: $('timer-num'),
      rejectHint: $('reject-hint'), continuebar: $('continuebar'), btnContinue: $('btn-continue'),
      summary: $('summary'), vignette: $('vignette'), spot: $('spot'), flash: $('flash'),
      btnSound: $('btn-sound'), btnHelp: $('btn-help'), btnLaunch: $('btn-launch'),
      btnEndless: $('btn-endless'), how: $('how'),
    }

    this.sky = new Sky(this.el.sky, WORLD_PX)
    this.fx = new Fx(this.el.fx)
    this.climber = mountClimber(this.el.climber, { onPoke: () => this.poke() })

    this.mode = 'daily'
    this.phase = 'title'
    this.score = 0
    this.camScore = 0
    this.targetScore = 0
    this.round = 0 // prompts completed; questions[round] is the live one
    this.results = []
    this.questions = []
    this.endlessRuns = 0
    this.timeLeft = 0 // ms, advanced only by the frame loop
    this.lastTick = -1
    this.timers = []
    this.tweens = []
    this.ladder = []
    this.perch = null
    this.time = 0
    this.lastOffset = 0

    this.buildWorld()
    this.wire()
    this.el.daynum.textContent = 'CLIMB #' + dayNumber()
    this.syncMuteButton()
    this.renderPips()

    this.lastFrame = performance.now()
    requestAnimationFrame(this.frame)
  }

  // ---------- geometry ----------

  // Top (px) of a score inside the world column.
  yFor(score) {
    return (MAX_DAY_SCORE - score) * WORLD_PX
  }
  // Where a score currently sits on screen.
  screenY(score) {
    return this.yFor(score) + this.lastOffset
  }
  centreX() {
    return window.innerWidth / 2
  }

  // ---------- setup ----------

  buildWorld() {
    const frag = document.createDocumentFragment()
    for (const [score, side, text, major] of AMBIENT) {
      const d = document.createElement('div')
      d.className = 'amb ' + side + (major ? ' major' : '')
      d.style.top = this.yFor(score) + 'px'
      d.innerHTML = side === 'L' ? '<span class="dash">──</span> ' + text : text + ' <span class="dash">──</span>'
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
      sound('ui')
    })
    el.btnHelp.addEventListener('click', () => {
      el.how.open = !el.how.open
      sound('ui')
    })
    onMuteChange(() => this.syncMuteButton())

    el.answerbar.addEventListener('submit', (e) => {
      e.preventDefault()
      this.submit(el.answer.value)
    })
    // Enter is the whole game, so it is handled here directly rather than
    // left to the form's implicit submission — which some mobile keyboards,
    // IME states and embedded frames never deliver.
    el.answer.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return
      e.preventDefault()
      if (this.phase === 'landed') this.nextRound()
      else this.submit(el.answer.value)
    })
    el.answer.addEventListener('input', () => {
      sound('type')
      if (!el.rejectHint.hidden) el.rejectHint.hidden = true
    })

    const once = () => {
      unlock()
      window.removeEventListener('pointerdown', once)
      window.removeEventListener('keydown', once)
    }
    window.addEventListener('pointerdown', once)
    window.addEventListener('keydown', once)

    // Keyboard players never have to reach for the mouse: Enter (or Space)
    // advances a landed round and launches from the title. During a round
    // the form already owns Enter.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLButtonElement && e.key === ' ') return
      if (this.phase === 'landed') {
        e.preventDefault()
        this.nextRound()
      } else if (this.phase === 'title' && e.key === 'Enter' && !this.el.title.hidden) {
        e.preventDefault()
        this.start('daily')
      }
    })

    window.addEventListener('resize', () => {
      this.sky.resize()
      this.fx.resize()
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
    this.tweens = []
  }
  tween(dur, ease, upd, done) {
    this.tweens.push({ t0: performance.now(), dur, ease, upd, done })
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
    this.perch = null
    this.questions =
      mode === 'daily' ? promptsForDay() : promptsForEndless(Date.now() ^ (++this.endlessRuns * 2654435761))

    document.body.classList.add('playing')
    this.el.title.classList.add('gone')
    this.el.summary.hidden = true
    this.el.summary.innerHTML = ''
    this.el.hud.hidden = false
    this.el.scoreValue.textContent = '0'
    this.el.world.querySelectorAll('.card, .landed, .tierline, .plunge-tag').forEach((n) => n.remove())
    this.el.stage.querySelectorAll('.swarm').forEach((n) => n.remove())
    this.ambients.forEach((a) => a.classList.remove('passed'))
    this.climber.setGold(false, { quiet: true })
    this.climber.react(null)
    this.phase = 'intro'
    this.renderPips()

    sound('begin')
    this.climber.react('boost', 900)
    portal.gameplayStart()

    // "the clock starts in 3": the same beat the dive game opens on, so the
    // first prompt never lands on a player who is still reading the HUD.
    this.later(() => {
      this.el.title.hidden = true
      this.placePromptCard(this.questions[0])
      const cd = this.el.countdown
      cd.hidden = false
      let n = 3
      cd.querySelector('b').textContent = String(n)
      const tick = () => {
        n--
        if (n <= 0) {
          cd.hidden = true
          this.openRound()
          return
        }
        cd.querySelector('b').textContent = String(n)
        sound('tick')
        this.later(tick, 1000)
      }
      sound('tick')
      this.later(tick, 1000)
    }, 800)
  }

  placePromptCard(q, delayMs = 0) {
    this.promptCard?.remove()
    const card = document.createElement('div')
    card.className = 'card'
    card.style.top = this.yFor(this.score) - 150 + 'px'
    if (delayMs) card.style.animationDelay = delayMs + 'ms'
    card.innerHTML =
      `<div class="rnd">PROMPT ${this.round + 1} OF ${ROUNDS_PER_DAY}</div>` +
      `<div class="prompt"></div>` +
      (q.note ? `<div class="note"></div>` : '') +
      `<div class="hint">▲ rarer answers climb higher ▲</div>`
    card.querySelector('.prompt').textContent = q.prompt
    if (q.note) card.querySelector('.note').textContent = q.note
    this.el.world.appendChild(card)
    this.promptCard = card
  }

  // The round proper: input live, clock running.
  openRound() {
    this.phase = 'round'
    this.renderPips()
    const { el } = this
    el.answerwrap.hidden = false
    el.answerwrap.classList.remove('away')
    el.answerbar.classList.remove('disabled', 'rising')
    el.continuebar.hidden = true
    el.rejectHint.hidden = true
    // Anything typed during the glide up is kept: the prompt was already
    // showing, and a fast player shouldn't be punished for reading it.
    el.btnSubmit.disabled = false
    el.timerNum.textContent = String(SECONDS_PER_ROUND)
    if (!matchMedia('(pointer: coarse)').matches) el.answer.focus({ preventScroll: true })
    // The clock advances only in frame(), never against wall time. A tab
    // that isn't rendering — backgrounded, or a phone with the screen off —
    // burns no time, without any visibility bookkeeping to get wrong.
    this.timeLeft = SECONDS_PER_ROUND * 1000
    this.lastTick = -1
  }

  submit(raw) {
    if (this.phase !== 'round') return
    const text = String(raw ?? '').trim()
    if (!text) {
      this.zapInput()
      return
    }
    const q = this.questions[this.round]
    const result = scoreGuess(q, text)
    if (!result.hit) return this.reject(text)
    this.plunge(result)
  }

  // A guess that isn't on the board. The clock keeps running, the text stays
  // in the box (selected, so the next keystroke replaces it), and the player
  // goes again. The round only ends when something lands or time runs out.
  reject(text) {
    const { el } = this
    this.zapInput()
    el.answer.classList.remove('nope')
    void el.answer.offsetWidth
    el.answer.classList.add('nope')
    sound('reject')
    const r = el.answer.getBoundingClientRect()
    this.fx.puff(r.left + rand(20, r.width - 20), r.top + rand(-4, 6))
    this.fx.puff(r.left + rand(20, r.width - 20), r.top + rand(-8, 2))
    el.rejectHint.innerHTML = `<b>“${escapeHtml(text)}”</b>: no lift. try again.`
    el.rejectHint.hidden = false
    el.answer.focus({ preventScroll: true })
    el.answer.select()
  }

  zapInput() {
    const a = this.el.answer
    a.classList.remove('zap')
    void a.offsetWidth
    a.classList.add('zap')
  }

  // ---------- the flight ----------

  plunge(result) {
    const { el } = this
    this.phase = 'plunge'
    const tier = result.tier
    const from = this.score
    const to = Math.min(MAX_DAY_SCORE, from + result.points)
    const colour = `var(--tier-${tier.id})`
    const shown = displayCase(result.text)

    // submit fx: the input sparks and slides away; the round's card lifts off.
    sound('submit')
    this.zapInput()
    const r = el.answer.getBoundingClientRect()
    for (let i = 0; i < 12; i++) this.fx.spark(r.left + rand(0, r.width), r.top + rand(0, r.height), 2 + rand(0, 3))
    document.documentElement.style.setProperty('--urgency', '0')
    el.timer.classList.remove('danger')
    // The input is never disabled: disabling blurs it, and on a phone that
    // drops the keyboard, which then has to be summoned again every round.
    // submit() already refuses anything outside the round.
    el.answer.value = ''
    el.btnSubmit.disabled = true
    el.rejectHint.hidden = true
    el.answerbar.classList.add('disabled')
    this.later(() => el.answerwrap.classList.add('away'), 350)

    if (this.promptCard) {
      const card = this.promptCard
      const cr = card.getBoundingClientRect()
      this.fx.burst(cr.left + cr.width / 2, cr.top + cr.height / 2, '77,227,255', 12, 0.6)
      card.classList.add('gone')
      this.later(() => card.remove(), 650)
      this.promptCard = null
    }

    // The ladder: every tier's landing spot, measured from where you are.
    // You get to watch your answer climb past the ones it beat.
    this.clearLadder(true)
    TIER_IDS.forEach((id, i) => {
      const t = TIERS[id]
      const line = document.createElement('div')
      line.className = 'tierline'
      line.style.top = this.yFor(from + t.score) + 'px'
      line.style.setProperty('--tc', `var(--tier-${id})`)
      line.style.opacity = '0'
      line.innerHTML = `<div class="tag">${iconSvg(id, 17)}<span>${t.name.toUpperCase()} &middot; ${t.score}</span></div>`
      el.world.appendChild(line)
      // Force the layout flush synchronously so the opacity change below
      // transitions from 0 rather than being coalesced away — and so it
      // happens at all in a tab whose animation frames are throttled.
      void line.offsetWidth
      line.style.transitionDelay = i * 90 + 'ms'
      line.style.opacity = '1'
      this.ladder.push({ score: from + t.score, el: line, tier: id, passed: false })
    })

    // The answer itself takes off.
    const tag = document.createElement('div')
    tag.className = 'plunge-tag'
    tag.style.setProperty('--tc', colour)
    tag.style.top = this.yFor(from) + 'px'
    tag.innerHTML = `“${escapeHtml(shown.toUpperCase())}”<b>▲</b>`
    el.world.appendChild(tag)
    sound('lift')

    // The mascot's reaction is decided at take-off, like the krill's.
    if (tier.id === 'dust') this.climber.react('sad', FLIGHT.dust.dur + 800)
    else if (tier.id === 'tooclever') {
      this.flash('rgba(255,159,67,.7)', 3, 130)
      this.shake()
      this.climber.react('faint', 2400)
      this.swarm()
    } else if (tier.id === 'astronomical') this.climber.react('boost', 900)

    const spec = FLIGHT[tier.id]
    let es = from
    this.tween(
      spec.dur,
      spec.ease,
      (t) => {
        es = from + (to - from) * t
        let ed, rot
        if (tier.id === 'dust') {
          ed = 36 * Math.sin(7 * t) * (1 - 0.25 * t)
          rot = 0.55 * ed
        } else if (tier.id === 'tooclever') {
          ed = 7 * Math.sin(42 * t) + rand(-2, 2)
          rot = rand(-3, 3)
        } else if (tier.id === 'astronomical') {
          ed = Math.sin(24 * t) * (1 - t) * 26
          rot = 0.5 * ed
        } else {
          ed = Math.sin(16 * t) * (1 - t) * 14
          rot = 0.4 * ed
        }
        tag.style.top = this.yFor(es) + 'px'
        tag.style.transform = `translate3d(calc(-50% + ${ed.toFixed(1)}px), 0, 0) rotate(${rot.toFixed(1)}deg)`
        this.targetScore = Math.min(MAX_DAY_SCORE + 8, es + LEAD)

        const px = this.centreX() + ed
        const py = this.screenY(es) + 14
        if (tier.id === 'dust') {
          if (Math.random() < 0.25) this.fx.puff(px + rand(-30, 30), py)
        } else if (tier.id === 'rare') {
          if (Math.random() < 0.09) this.fx.rings(px + rand(-20, 20), py - 10, 3)
        } else if (tier.id === 'astronomical') {
          if (Math.random() < 0.5) this.fx.spark(px + rand(-30, 30), py, 1.5 + rand(0, 2), '255,209,102')
        } else if (tier.id === 'farout') {
          this.spotlight(px, py, 66)
          if (Math.random() < 0.3) this.fx.spark(px + rand(-20, 20), py, 1 + rand(0, 2), '191,167,255')
        } else if (Math.random() < 0.6) {
          this.fx.spark(px + rand(-34, 34), py + rand(-8, 4), 1.5 + rand(0, 2.5))
        }

        for (const line of this.ladder) {
          if (!line.passed && es > line.score - 0.4) {
            line.passed = true
            line.el.classList.add('passed')
            sound('tierline')
            if (line.tier !== tier.id) {
              this.fx.burst(this.centreX(), this.screenY(line.score), tierRgb(line.tier), 7, 0.5)
            }
          }
        }
      },
      () => {
        tag.remove()
        this.land(result, from, to, shown)
      }
    )
  }

  // The flock: for Too Clever, a stream of birds crosses the screen — the
  // whole flock had the same idea.
  swarm() {
    const n = window.innerWidth < 700 ? 8 : 11
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div')
      b.className = 'swarm' + (Math.random() < 0.5 ? ' flip' : '')
      b.innerHTML = iconSvg('flocker', 34)
      b.style.top = rand(22, 68) + '%'
      b.style.animationDelay = i * 130 + rand(0, 90) + 'ms'
      b.style.animationDuration = 1.7 + rand(0, 0.8) + 's'
      this.el.stage.appendChild(b)
      this.later(() => b.remove(), 3400)
    }
  }

  land(result, from, to, shown) {
    const { el } = this
    const tier = result.tier
    const colour = `var(--tier-${tier.id})`
    this.score = to
    this.targetScore = to
    this.round++
    this.results.push({ prompt: this.questions[this.round - 1].prompt, ...result, text: shown })

    for (const line of this.ladder) if (line.tier === tier.id) line.el.style.opacity = '0'

    const banner = this.banner({
      tierId: tier.id,
      name: tier.name.toUpperCase(),
      answer: shown,
      points: result.points,
      sub: result.quip,
      at: to,
    })

    // Where the camera will settle: the landing point maps to the anchor.
    // Using the live camera here is wrong on the one frame it matters, when
    // a throttled tab delivers the whole flight at once.
    const lx = this.centreX()
    const ly = cameraAnchor(to) * window.innerHeight
    switch (tier.id) {
      case 'dust':
        this.fx.burst(lx, ly, '143,163,196', 8, 0.4)
        sound('land_small')
        this.countScore(from, to)
        break
      case 'tooclever':
        this.flash('rgba(255,159,67,.6)', 2, 130)
        this.shake()
        this.fx.burst(lx, ly, tierRgb('tooclever'), 18, 0.7)
        sound('land_small')
        this.countScore(from, to)
        break
      case 'flocker':
        this.fx.burst(lx, ly, tierRgb('flocker'), 22, 0.8)
        sound('land_big')
        this.countScore(from, to)
        break
      case 'rare':
        this.fx.rings(lx, ly, 22)
        this.fx.burst(lx, ly, tierRgb('rare'), 26, 0.9)
        this.shake()
        this.flash('rgba(255,82,82,.45)', 1, 240)
        sound('land_big')
        this.countScore(from, to)
        break
      case 'farout':
        this.spotlight(lx, ly, 200)
        this.el.spot.classList.add('on')
        this.later(() => this.el.spot.classList.remove('on'), 2300)
        this.fx.burst(lx, ly, tierRgb('farout'), 18, 0.7)
        sound('land_big')
        this.countScore(from, to)
        break
      case 'astronomical':
        // The top: gold flash, a cheer, and the mascot perches on its own
        // trophy while the score cranks up a notch at a time.
        banner.classList.add('perched')
        this.flash('rgba(255,209,102,.35)', 1, 220)
        this.climber.react('celebrate', 1250)
        portal.happytime()
        this.later(() => {
          this.climber.setGold(true)
          this.fx.gild(lx, ly)
          sound('astronomical')
          this.crankScore(from, to)
          this.later(() => {
            if (this.phase === 'landed') this.perch = banner.querySelector('.icon')
          }, 900)
        }, 1000)
        break
    }

    this.phase = 'landed'
    this.renderPips()
    el.btnContinue.textContent = this.round >= ROUNDS_PER_DAY ? 'SEE THE CLIMB ▲' : 'ASCEND ▲'
    el.continuebar.hidden = false
  }

  // Time ran out with nothing on the board.
  timeout() {
    const { el } = this
    this.phase = 'plunge'
    const typed = el.answer.value.trim()
    el.answer.value = ''
    el.btnSubmit.disabled = true
    el.rejectHint.hidden = true
    el.answerbar.classList.add('disabled')
    document.documentElement.style.setProperty('--urgency', '0')
    el.timer.classList.remove('danger')
    this.later(() => el.answerwrap.classList.add('away'), 200)

    if (this.promptCard) {
      const card = this.promptCard
      card.classList.add('gone')
      this.later(() => card.remove(), 650)
      this.promptCard = null
    }

    this.shake()
    this.zapInput()
    sound('miss')
    this.flash('rgba(61,79,110,.5)', 1, 200)
    this.climber.react('sad', 2600)

    this.later(() => {
      const at = this.score + 4
      this.round++
      this.results.push({
        prompt: this.questions[this.round - 1].prompt, hit: false, tier: null, points: 0, quip: '', text: typed,
      })
      this.banner({
        tierId: null, name: 'NOTHING LIFTED', answer: typed || '—', points: 0, at,
        sub: typed ? 'never left the pad.' : 'the clock beat you to it.',
      })
      this.targetScore = this.score
      this.phase = 'landed'
      this.renderPips()
      el.btnContinue.textContent = this.round >= ROUNDS_PER_DAY ? 'SEE THE CLIMB ▲' : 'ASCEND ▲'
      el.continuebar.hidden = false
    }, 900)
  }

  banner({ tierId, name, answer, points, sub, at }) {
    const b = document.createElement('div')
    b.className = 'landed' + (tierId ? '' : ' miss') + (at < 110 ? ' lowsky' : '')
    b.style.top = this.yFor(at) - 30 + 'px'
    b.style.setProperty('--tc', tierId ? `var(--tier-${tierId})` : 'var(--tier-miss)')
    const alt = altitudeText(altitudeFor(this.score))
    b.innerHTML =
      (tierId ? `<div class="icon">${iconSvg(tierId, 66)}</div>` : '') +
      `<div class="tname">${escapeHtml(name)}</div>` +
      `<div class="tans"></div>` +
      `<div class="tpts"><b>+${points} PTS</b>${points > 0 ? ` &middot; ${alt} up` : ''}</div>` +
      `<div class="tsub"></div>`
    b.querySelector('.tans').textContent = answer ? `“${answer}”` : '—'
    b.querySelector('.tsub').textContent = sub
    this.el.world.appendChild(b)
    this.landedCard = b
    return b
  }

  nextRound() {
    if (this.phase !== 'landed') return
    sound('ui')
    this.perch = null
    this.el.continuebar.hidden = true
    if (this.round >= ROUNDS_PER_DAY) return this.finish()

    // Rise to the next prompt: banner and ladder fade behind, the new card
    // is waiting at your altitude, and the camera glides up to meet it.
    this.phase = 'rise'
    if (this.landedCard) {
      const c = this.landedCard
      c.style.animation = 'none'
      c.style.transition = 'opacity .6s'
      c.style.opacity = '0'
      this.later(() => c.remove(), 650)
      this.landedCard = null
    }
    this.clearLadder(false)
    this.climber.react(null)
    this.placePromptCard(this.questions[this.round], 450)
    this.el.answerwrap.hidden = false
    this.el.answerwrap.classList.remove('away')
    // Live but marked: the box accepts type-ahead during the glide, and
    // submit() holds anything sent until the round actually opens.
    this.el.answerbar.classList.add('disabled')
    this.el.answerbar.classList.add('rising')
    this.el.answer.value = ''
    this.el.timerNum.textContent = String(SECONDS_PER_ROUND)
    if (!matchMedia('(pointer: coarse)').matches) this.el.answer.focus({ preventScroll: true })
    const camFrom = this.camScore
    const camTo = this.score
    this.tween(2200, easeIO, (t) => {
      this.targetScore = camFrom + (camTo - camFrom) * t
    }, () => this.openRound())
  }

  clearLadder(immediate) {
    for (const line of this.ladder) {
      if (immediate) line.el.remove()
      else {
        line.el.style.transitionDelay = '0ms'
        line.el.style.opacity = '0'
        this.later(() => line.el.remove(), 600)
      }
    }
    this.ladder = []
  }

  finish() {
    this.phase = 'done'
    this.el.answerwrap.hidden = true
    this.el.continuebar.hidden = true
    portal.gameplayStop()
    sound('finish')
    this.history = recordRun({
      mode: this.mode,
      day: dayNumber(),
      score: this.score,
      tiers: this.results.map((r) => (r.tier ? r.tier.id : 'miss')),
    })
    this.later(() => this.renderSummary(), 700)
  }

  // ---------- fx helpers ----------

  countScore(from, to) {
    const t0 = performance.now()
    const dur = 700
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - k, 4)
      this.el.scoreValue.textContent = String(Math.round(from + (to - from) * e))
      if (k < 1) requestAnimationFrame(step)
      else {
        this.el.scoreValue.textContent = String(to)
        this.el.scoreValue.classList.remove('slam')
        void this.el.scoreValue.offsetWidth
        this.el.scoreValue.classList.add('slam')
      }
    }
    requestAnimationFrame(step)
  }

  // Eight jolts, one every 110ms — the top tier's score arrives like a
  // ratchet, not a slide.
  crankScore(from, to) {
    let n = 0
    const id = setInterval(() => {
      n++
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - n / 8, 2)))
      this.el.scoreValue.textContent = String(v)
      this.el.scoreValue.classList.remove('crank')
      void this.el.scoreValue.offsetWidth
      this.el.scoreValue.classList.add('crank')
      if (n >= 8) {
        clearInterval(id)
        this.el.scoreValue.textContent = String(to)
        this.el.scoreValue.classList.add('slam')
        this.later(() => this.el.scoreValue.classList.remove('slam'), 520)
      }
    }, 110)
    this.timers.push(id)
  }

  flash(colour, times, ms) {
    const f = this.el.flash
    let i = 0
    const one = () => {
      f.style.transition = 'none'
      f.style.background = colour
      f.style.opacity = '.42'
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          f.style.transition = 'opacity ' + ms + 'ms ease-out'
          f.style.opacity = '0'
        })
      )
      if (++i < times) this.later(one, 2.1 * ms)
    }
    one()
  }

  shake() {
    const s = this.el.stage
    s.classList.remove('shake')
    void s.offsetWidth
    s.classList.add('shake')
  }

  spotlight(x, y, r) {
    this.el.spot.style.background =
      `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, rgba(2,4,10,.72) ${r + 90}px, rgba(2,4,10,.96) ${r + 260}px)`
  }

  poke() {
    sound('blub')
    const r = this.el.climber.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    for (let i = 0; i < 6; i++) this.fx.spark(cx + rand(-16, 26), cy - 16, 1 + rand(0, 3))
    this.fx.burst(cx, cy, this.climber.isGold() ? '255,209,102' : '255,93,143', 10, 0.5)
  }

  // ---------- per-frame ----------

  renderPips() {
    const bar = this.el.pipbar
    if (bar.children.length !== ROUNDS_PER_DAY) {
      bar.innerHTML = ''
      for (let i = 0; i < ROUNDS_PER_DAY; i++) bar.appendChild(document.createElement('span'))
    }
    const live = this.phase === 'round' || this.phase === 'plunge' || this.phase === 'rise' || this.phase === 'intro'
    ;[...bar.children].forEach((sp, i) => {
      sp.className = i < this.round ? 'done' : i === this.round && live ? 'cur' : ''
    })
    this.el.pipword.textContent =
      this.phase === 'title' ? 'LAUNCH PAD'
        : this.phase === 'done' || (this.round >= ROUNDS_PER_DAY && this.phase === 'landed') ? 'CLIMB COMPLETE'
          : landmarkFor(this.camScore).label
  }

  frame = (now) => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.time += dt

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]
      const k = (now - tw.t0) / tw.dur
      if (k >= 1) {
        tw.upd(tw.ease(1))
        this.tweens.splice(i, 1)
        tw.done?.()
      } else tw.upd(tw.ease(Math.max(0, k)))
    }

    // Camera: a soft chase, plus the idle bob the whole world shares.
    this.camScore += (this.targetScore - this.camScore) * (1 - Math.exp(-6 * dt))
    const bob = this.phase === 'title' ? 0 : 2.6 * Math.sin(this.time * 0.45)

    const vh = window.innerHeight
    const anchor = cameraAnchor(this.camScore)
    const offset = vh * anchor - this.yFor(this.camScore) + bob
    const shift = offset - this.lastOffset
    this.lastOffset = offset
    this.el.world.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`

    // The mascot is screen-fixed: beside the action, never flying with it.
    this.el.climber.classList.toggle('perched', !!this.perch)
    if (this.perch) {
      const r = this.perch.getBoundingClientRect()
      this.el.climber.style.left = r.left + r.width / 2 + 'px'
      this.el.climber.style.top = r.top + r.height / 2 + 'px'
    } else {
      const onPad = this.round === 0 && this.phase !== 'plunge' && this.phase !== 'landed'
      const side = onPad ? 0 : -44
      this.el.climber.style.left = `calc(50% + ${side}px)`
      this.el.climber.style.top = (anchor * 100).toFixed(2) + '%'
    }

    this.sky.draw(this.camScore, dt)
    this.fx.step(dt, Math.abs(shift) < 200 ? shift : 0)
    this.climber.setAltitude(this.camScore)

    const { value, unit } = formatAltitude(altitudeFor(this.camScore))
    this.el.altValue.textContent = value
    this.el.altUnit.textContent = unit

    this.el.vignette.style.opacity = String(Math.min(0.85, Math.max(0, (this.camScore - 180) / 420)))
    this.el.vignette.style.background =
      'radial-gradient(ellipse at 50% 48%, transparent 34%, rgba(2,4,10,.55) 74%, rgba(2,4,10,.92) 100%)'

    for (const a of this.ambients) {
      if (!a.classList.contains('passed') && this.camScore >= Number(a.dataset.score)) a.classList.add('passed')
    }

    if (this.phase === 'round') this.tickClock(dt)
    if (this.phase !== 'title') this.renderPips()
    requestAnimationFrame(this.frame)
  }

  tickClock(dt) {
    // dt is capped at 50ms upstream, so a long gap between frames costs the
    // player one frame's worth of clock, not the gap.
    this.timeLeft = Math.max(0, this.timeLeft - dt * 1000)
    const left = this.timeLeft
    const secs = Math.ceil(left / 1000)
    if (secs !== this.lastTick) {
      this.lastTick = secs
      this.el.timerNum.textContent = String(secs)
      if (secs <= 5 && secs > 0) sound('tick')
    }
    const urgency = left < 6000 ? 1 - left / 6000 : 0
    document.documentElement.style.setProperty('--urgency', urgency.toFixed(2))
    this.el.timer.classList.toggle('danger', urgency > 0.8)
    if (left <= 0) this.timeout()
  }

  // ---------- summary ----------

  renderSummary() {
    const total = this.score
    const band = bandFor(total)
    const alt = altitudeFor(total)
    const s = this.el.summary
    const dist = distributionFor(this.questions)
    const pct = betterThan(dist, total)
    const best = this.history?.best ?? total

    s.innerHTML =
      `<div class="sum-verdict" style="color:var(--tier-${band.tier})">${escapeHtml(band.verdict)}</div>` +
      `<div class="sum-final">${total}<small> / ${MAX_DAY_SCORE}</small></div>` +
      `<div class="sum-alt">you reached ${altitudeText(alt)} — ${escapeHtml(landmarkFor(total).label)}</div>` +
      this.climbLogHtml() +
      this.distributionHtml(dist, total, pct) +
      `<div class="sum-actions">
         <button id="sum-copy" type="button">COPY RESULT</button>
         <button id="sum-again" type="button" class="ghost">ENDLESS ∞</button>
       </div>` +
      `<div class="sum-note" id="sum-note"></div>`
    s.hidden = false

    const note = $('sum-note')
    const bestLine = best > total ? ` · your best is ${best}` : total > 0 && best === total && (this.history?.runs?.length ?? 0) > 1 ? ' · a new best' : ''
    if (this.mode === 'daily') {
      const ms = nextResetAt() - new Date()
      const hrs = Math.floor(ms / 3_600_000)
      const mins = Math.floor((ms % 3_600_000) / 60_000)
      note.textContent = `next climb in ${hrs}h ${mins}m — or keep going in Endless${bestLine}.`
    } else note.textContent = `endless run. the daily is still waiting${bestLine}.`

    $('sum-copy').addEventListener('click', () => this.copyResult(total, band, pct))
    $('sum-again').addEventListener('click', () => {
      this.el.summary.hidden = true
      this.start('endless')
    })
  }

  // Seven columns; each round's icon rises to its tier's height. The mirror
  // of the dive log: higher is rarer.
  climbLogHtml() {
    const cols = this.results
      .map((r, i) => {
        const tier = r.tier ? TIERS[r.tier.id] : null
        const h = tier ? tier.climb : 0.03
        const colour = tier ? `var(--tier-${tier.id})` : 'var(--tier-miss)'
        const icon = tier
          ? iconSvg(tier.id, 19)
          : `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5" stroke-dasharray="2.8 4"/></svg>`
        const title = `Round ${i + 1}: ${r.text || 'nothing'}, ${r.points} pts`
        return (
          `<div class="log-col" title="${escapeHtml(title)}">` +
          `<div class="log-line" style="height:calc(${(h * 100).toFixed(1)}% - 8px);background:linear-gradient(0deg, transparent, ${colour})"></div>` +
          `<div class="log-icon" style="bottom:${(h * 100).toFixed(1)}%;animation-delay:${90 * i}ms;filter:drop-shadow(0 0 5px ${colour})">${icon}</div>` +
          `<span class="log-n">${i + 1}</span></div>`
        )
      })
      .join('')
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map(
        (k) =>
          `<div class="log-rule" style="bottom:${k * 100}%;opacity:${k === 0 ? 1 : 0.5}"></div>` +
          `<span class="log-tick" style="bottom:${k * 100}%">${k === 0 ? '0' : Math.round(k * 100)}</span>`
      )
      .join('')
    const answers = this.results
      .map((r, i) => `<span><i>${i + 1}</i> ${escapeHtml(r.text || '—')}</span>`)
      .join('')
    return (
      `<div class="log"><p class="fathom"><span>climb log</span><span class="fathom-sub">higher = rarer</span></p>` +
      `<div class="log-grid">${grid}<div class="log-cols">${cols}</div></div>` +
      `<div class="log-answers">${answers}</div></div>`
    )
  }

  // The crowd: a smoothed density over 0..700, the part you beat lit up, a
  // marker where you landed. Same drawing as the dive game's, so the read is
  // familiar to anyone who has played it.
  distributionHtml(dist, score, pct) {
    const raw = dist.buckets
    const k = [0.06, 0.24, 0.4, 0.24, 0.06]
    const sm = raw.map((_, i) => {
      let n = 0
      let a = 0
      for (let j = -2; j <= 2; j++) {
        const idx = i + j
        if (idx < 0 || idx >= raw.length) continue
        n += raw[idx] * k[j + 2]
        a += k[j + 2]
      }
      return a > 0 ? n / a : 0
    })
    const peak = Math.max(...sm)
    if (!(peak > 0)) return ''
    const W = 320
    const BASE = 78
    const pts = [[0, BASE]]
    sm.forEach((v, i) => pts.push([((i + 0.5) / sm.length) * W, BASE - (v / peak) * 68]))
    pts.push([W, BASE])
    const x = (Math.min(score, MAX_DAY_SCORE) / MAX_DAY_SCORE) * W
    let y = BASE
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      if (x >= x0 && x <= x1) {
        y = y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0))
        break
      }
    }
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    const area = `${d} L ${W} ${BASE} L 0 ${BASE} Z`
    const labelX = Math.min(Math.max(x, 14), W - 14)
    const ticks = [100, 200, 300, 400, 500, 600]
      .map((v) => {
        const tx = (v / MAX_DAY_SCORE) * W
        const near = Math.abs(tx - x) < 18
        return (
          `<line x1="${tx}" y1="${BASE}" x2="${tx}" y2="${BASE + 3.5}" stroke="var(--drift)" stroke-opacity=".5"/>` +
          (near ? '' : `<text x="${tx}" y="90" text-anchor="middle" font-size="9" fill="var(--drift)" opacity=".55">${v}</text>`)
        )
      })
      .join('')
    return (
      `<div class="dist">` +
      `<svg viewBox="0 0 ${W} 96" role="img" aria-label="Score distribution of ${escapeHtml(dist.label)}; your score beats ${pct}% of them">` +
      `<defs><linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="var(--cyan)" stop-opacity=".45"/><stop offset="100%" stop-color="var(--cyan)" stop-opacity=".02"/>` +
      `</linearGradient><clipPath id="pc-beaten"><rect x="0" y="0" width="${x.toFixed(1)}" height="96"/></clipPath></defs>` +
      `<path d="${area}" fill="url(#pc-fill)" opacity=".28"/>` +
      `<path d="${area}" fill="url(#pc-fill)" clip-path="url(#pc-beaten)"/>` +
      `<path d="${d}" fill="none" stroke="var(--cyan)" stroke-width="1.4" stroke-opacity=".75"/>` +
      `<line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" stroke="var(--hair)"/>` +
      ticks +
      `<line x1="${x.toFixed(1)}" y1="${(Math.min(y, 74) - 3).toFixed(1)}" x2="${x.toFixed(1)}" y2="${BASE}" stroke="var(--pink)" stroke-width="1.2"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="var(--pink)"/>` +
      `<text x="${labelX.toFixed(1)}" y="90" text-anchor="middle" font-size="9" letter-spacing=".12em" fill="var(--pink)">YOU</text>` +
      `<text x="0" y="90" font-size="9" fill="var(--drift)" opacity=".6">0</text>` +
      `<text x="${W}" y="90" text-anchor="end" font-size="9" fill="var(--drift)" opacity=".6">${MAX_DAY_SCORE}</text>` +
      `</svg>` +
      `<p class="dist-cap">higher than ${pct}% of ${escapeHtml(dist.label)}</p>` +
      (dist.modeled ? `<p class="dist-sub">expected spread for today's seven — real climbs will replace it</p>` : '') +
      `</div>`
    )
  }

  copyResult(total, band, pct) {
    const glyphs = this.results.map((r) => (r.tier ? TIERS[r.tier.id].emoji : '⬛')).join('')
    const label = this.mode === 'daily' ? `Climb #${dayNumber()}` : 'Endless Climb'
    const text =
      `The Daily Climb — ${label}\n${glyphs}\n` +
      `${total}/${MAX_DAY_SCORE} · ${altitudeText(altitudeFor(total))} · ${band.verdict}` +
      (typeof pct === 'number' ? `\nhigher than ${pct}% of climbers` : '')
    const btn = $('sum-copy')
    const done = (ok) => {
      btn.textContent = ok ? 'COPIED ✓' : 'COPY FAILED'
      setTimeout(() => (btn.textContent = 'COPY RESULT'), 1600)
    }
    navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)) ?? done(false)
    sound('ui')
  }
}

const TIER_RGB = {
  dust: '143,163,196', tooclever: '255,159,67', flocker: '77,227,255',
  rare: '255,82,82', farout: '157,123,255', astronomical: '255,209,102',
}
function tierRgb(id) {
  return TIER_RGB[id] ?? '232,241,255'
}
