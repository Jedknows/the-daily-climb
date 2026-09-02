// The sky. Everything you see behind the cards is drawn here, procedurally,
// from one number: how high the camera is in score-space (0 to 700).
//
// Drawing it rather than shipping parallax strips buys three things. The
// gradient can shift continuously across ten orders of magnitude instead of
// cutting between fixed tiles; the whole background costs a few KB instead of
// a few hundred; and the sky at score 300 can be genuinely different from the
// sky at 299 — the moment you cross the Karman line, the air stops scattering
// and the stars come out, on the exact frame you earn it.
//
// The pixel look is real, not a filter: the frame is rendered to a buffer at
// 1/PX scale and blown up with smoothing off, so every edge lands on the grid.

import { MAX_DAY_SCORE, cameraAnchor } from './rules.js'

const PX = 3 // buffer downscale — the size of one "pixel"

// Sky keyframes: [score, horizonColour, zenithColour], interpolated in RGB.
// Dense across 0-150 on purpose: that is the range most runs live in, and a
// ten-point answer has to visibly change the light.
const SKY = [
  [0, [184, 216, 240], [110, 168, 220]],
  [25, [166, 204, 236], [80, 140, 205]],
  [55, [140, 186, 228], [50, 105, 175]],
  [85, [100, 150, 205], [28, 66, 125]],
  [110, [62, 105, 160], [14, 36, 78]],
  [130, [34, 64, 105], [6, 18, 44]],
  [150, [18, 38, 66], [3, 8, 24]],
  [250, [9, 20, 42], [2, 4, 14]],
  [350, [6, 12, 28], [1, 3, 10]],
  [450, [5, 9, 24], [1, 2, 8]],
  [560, [12, 7, 32], [5, 2, 22]],
  [640, [28, 12, 52], [10, 4, 32]],
  [700, [48, 18, 70], [16, 6, 40]],
]

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
// Smooth 0->1 ramp between two scores; the workhorse for "fade this layer in
// as we pass through its slice of the sky".
const band = (v, a, b) => clamp((v - a) / (b - a), 0, 1)

function skyColours(score) {
  let lo = SKY[0]
  let hi = SKY[SKY.length - 1]
  for (let i = 0; i < SKY.length - 1; i++) {
    if (score >= SKY[i][0] && score <= SKY[i + 1][0]) {
      lo = SKY[i]
      hi = SKY[i + 1]
      break
    }
  }
  const t = hi[0] === lo[0] ? 0 : (score - lo[0]) / (hi[0] - lo[0])
  const mix = (a, b) => [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]
  return { horizon: mix(lo[1], hi[1]), zenith: mix(lo[2], hi[2]) }
}

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// Deterministic noise so the star field and cloud deck are identical on every
// device and every reload — the sky is part of the daily, not a lottery.
function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Sky {
  constructor(canvas, worldPx) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.worldPx = worldPx
    // Buffer pixels per point of score. worldPx is quoted in SCREEN pixels to
    // match the DOM world column; everything drawn here is in buffer space,
    // which is PX times smaller. Mixing the two scrolls the sky at 3x.
    this.wpx = worldPx / PX
    this.w = 0
    this.h = 0
    this.time = 0
    this.buildFields()
    this.resize()
  }

  buildFields() {
    const rand = mulberry(0xc11b)

    // Stars live in a wrapping band of "star space" 2000 units tall; three
    // depths scroll at different rates so the field has parallax.
    this.stars = []
    for (let i = 0; i < 420; i++) {
      const depth = i < 200 ? 0.06 : i < 340 ? 0.13 : 0.22
      this.stars.push({
        x: rand(),
        y: rand() * 2000,
        depth,
        size: rand() < 0.87 ? 1 : 2,
        bright: 0.42 + rand() * 0.58,
        twinkle: rand() * 6.28,
        // A few stars get colour; most stay white so the coloured ones read.
        hue: rand() < 0.14 ? (rand() < 0.5 ? [180, 226, 255] : [255, 214, 170]) : null,
      })
    }

    // Cloud deck. Real cumulus sit in a band, not sprinkled evenly up the
    // sky, so these are authored across scores 12-62 — you punch up through
    // the deck inside the first round or two rather than swimming in it.
    this.clouds = []
    for (let i = 0; i < 16; i++) {
      const far = rand() < 0.45
      // Wide and flat: a row of puffs with a couple stacked on top, which
      // reads as cumulus instead of a clump of circles.
      const n = 5 + ((rand() * 3) | 0)
      const puffs = []
      for (let k = 0; k < n; k++) {
        puffs.push({
          dx: (k / (n - 1) - 0.5) * 52,
          dy: rand() < 0.28 ? -4 - rand() * 3 : 0,
          r: 4.5 + rand() * 4.5,
        })
      }
      this.clouds.push({
        score: 12 + (i / 16) * 48 + rand() * 4,
        x: rand(),
        scale: (far ? 0.42 : 0.72) + rand() * 0.4,
        layer: far ? 0.42 : 0.8,
        far,
        puffs,
      })
    }

    // Distant bodies, each pinned to the altitude where it becomes the thing
    // you are looking at.
    this.bodies = [
      { score: 350, x: 0.74, r: 26, kind: 'moon', span: 90 },
      { score: 440, x: 0.26, r: 15, kind: 'planet', col: [214, 168, 122], ring: false, span: 60 },
      { score: 452, x: 0.72, r: 19, kind: 'planet', col: [226, 200, 150], ring: true, span: 60 },
      { score: 466, x: 0.34, r: 11, kind: 'planet', col: [110, 160, 220], ring: false, span: 60 },
    ]
  }

  resize() {
    const dpr = 1 // the buffer IS the resolution; PX does the scaling
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.w = w
    this.h = h
    this.bw = Math.max(1, Math.ceil(w / PX))
    this.bh = Math.max(1, Math.ceil(h / PX))
    this.canvas.width = this.bw
    this.canvas.height = this.bh
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'
    this.ctx.imageSmoothingEnabled = false
    void dpr
  }

  // score: camera altitude in points. dt: seconds since last frame.
  draw(score, dt) {
    this.time += dt
    const { ctx, bw, bh } = this
    const s = clamp(score, -6, MAX_DAY_SCORE + 40)

    const { horizon, zenith } = skyColours(s)
    const g = ctx.createLinearGradient(0, 0, 0, bh)
    g.addColorStop(0, rgb(zenith))
    g.addColorStop(1, rgb(horizon))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, bw, bh)

    this.drawGalaxy(s)
    this.drawStars(s)
    this.drawBodies(s)
    this.drawAurora(s)
    this.drawSun(s)
    this.drawGround(s)
    this.drawClouds(s)
  }

  // The Milky Way band, then the core itself — the last thing you see.
  drawGalaxy(s) {
    const a = band(s, 440, 570)
    if (a <= 0) return
    const { ctx, bw, bh } = this
    ctx.save()
    ctx.globalAlpha = a * 0.5
    // A soft diagonal band of dust.
    const bandG = ctx.createLinearGradient(0, bh * 0.1, bw, bh * 0.9)
    bandG.addColorStop(0, 'rgba(80,60,150,0)')
    bandG.addColorStop(0.42, 'rgba(126,96,200,.55)')
    bandG.addColorStop(0.58, 'rgba(180,140,230,.42)')
    bandG.addColorStop(1, 'rgba(60,40,120,0)')
    ctx.fillStyle = bandG
    ctx.beginPath()
    ctx.moveTo(0, bh * 0.16)
    ctx.lineTo(bw, bh * 0.62)
    ctx.lineTo(bw, bh * 0.96)
    ctx.lineTo(0, bh * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    const core = band(s, 640, 700)
    if (core > 0) {
      const cx = bw * 0.5
      const cy = bh * (0.42 - core * 0.06)
      const r = (12 + core * 62) * (1 + 0.04 * Math.sin(this.time * 1.6))
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      cg.addColorStop(0, `rgba(255,236,190,${0.92 * core})`)
      cg.addColorStop(0.22, `rgba(255,196,120,${0.55 * core})`)
      cg.addColorStop(0.55, `rgba(190,110,220,${0.28 * core})`)
      cg.addColorStop(1, 'rgba(80,30,120,0)')
      ctx.fillStyle = cg
      ctx.fillRect(0, 0, this.bw, this.bh)
    }
  }

  drawStars(s) {
    // Stars are scattered by daylight low down and emerge as the air thins:
    // the first ones by the stratosphere, the full field at the Karman line.
    const a = band(s, 60, 150)
    if (a <= 0) return
    const { ctx, bw, bh } = this
    for (const st of this.stars) {
      const y = (((st.y - s * this.wpx * st.depth) % 2000) + 2000) % 2000
      const sy = (y / 2000) * (bh + 40) - 20
      if (sy < -2 || sy > bh + 2) continue
      const tw = 0.72 + 0.28 * Math.sin(this.time * 1.7 + st.twinkle)
      const alpha = a * st.bright * tw
      if (alpha < 0.04) continue
      ctx.fillStyle = st.hue
        ? `rgba(${st.hue[0]},${st.hue[1]},${st.hue[2]},${alpha})`
        : `rgba(255,255,255,${alpha})`
      ctx.fillRect(Math.round(st.x * bw), Math.round(sy), st.size, st.size)
    }
  }

  drawBodies(s) {
    const { ctx, bw, bh } = this
    for (const b of this.bodies) {
      // Each body fades in below its altitude and out above it, so the sky
      // is never cluttered with everything at once.
      const d = Math.abs(s - b.score)
      if (d > b.span) continue
      const a = 1 - d / b.span
      const cx = b.x * bw
      const cy = bh * 0.34 + (s - b.score) * 0.55
      if (cy < -b.r * 2 || cy > bh + b.r * 2) continue
      ctx.save()
      ctx.globalAlpha = a
      if (b.kind === 'moon') {
        ctx.fillStyle = '#d9dde6'
        this.disc(cx, cy, b.r)
        ctx.fillStyle = '#b6bcc9'
        this.disc(cx - b.r * 0.3, cy - b.r * 0.25, b.r * 0.22)
        this.disc(cx + b.r * 0.35, cy + b.r * 0.15, b.r * 0.16)
        this.disc(cx + b.r * 0.05, cy + b.r * 0.45, b.r * 0.12)
      } else {
        if (b.ring) {
          ctx.strokeStyle = `rgba(226,206,168,${a * 0.75})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.ellipse(cx, cy, b.r * 1.85, b.r * 0.42, -0.32, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = rgb(b.col)
        this.disc(cx, cy, b.r)
        ctx.fillStyle = `rgba(0,0,0,.18)`
        this.disc(cx + b.r * 0.35, cy + b.r * 0.1, b.r * 0.78)
      }
      ctx.restore()
    }
  }

  // A pixel-grid disc: stepped rows, no antialiasing, so it matches the rest.
  disc(cx, cy, r) {
    const ctx = this.ctx
    const R = Math.max(1, Math.round(r))
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)))
      if (half <= 0) continue
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1)
    }
  }

  drawAurora(s) {
    const a = band(s, 150, 200) * (1 - band(s, 255, 320))
    if (a <= 0.01) return
    const { ctx, bw, bh } = this
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let r = 0; r < 3; r++) {
      const phase = this.time * (0.22 + r * 0.07) + r * 2.1
      const baseY = bh * (0.5 + r * 0.09) + (s - 205) * 1.1
      if (baseY < -60 || baseY > bh + 90) continue
      ctx.globalAlpha = a * (0.3 - r * 0.07)
      const grad = ctx.createLinearGradient(0, baseY - 46, 0, baseY + 16)
      grad.addColorStop(0, 'rgba(80,255,190,0)')
      grad.addColorStop(0.55, r === 1 ? 'rgba(140,110,255,.9)' : 'rgba(90,255,180,.9)')
      grad.addColorStop(1, 'rgba(40,200,255,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(0, baseY + 16)
      for (let x = 0; x <= bw; x += 4) {
        const k = x / bw
        const wob = Math.sin(k * 7 + phase) * 13 + Math.sin(k * 17 - phase * 1.4) * 6
        ctx.lineTo(x, baseY + wob)
      }
      ctx.lineTo(bw, baseY + 16)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  drawSun(s) {
    const { ctx, bw, bh } = this
    // The Sun climbs the frame as you do, and hardens: a soft warm blur in
    // thick air, a hard white disc with a corona once there's no air left.
    const y = bh * 0.19 + s * this.wpx * 0.1
    if (y > bh + 80) return
    const x = bw * 0.82
    const hard = band(s, 95, 160)
    const r = 15 - hard * 5

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const glowR = r * (3.4 - hard * 1.6)
    const gg = ctx.createRadialGradient(x, y, 0, x, y, glowR)
    gg.addColorStop(0, `rgba(255,246,214,${0.4 - hard * 0.14})`)
    gg.addColorStop(0.35, `rgba(255,214,140,${0.16 - hard * 0.08})`)
    gg.addColorStop(1, 'rgba(255,190,90,0)')
    ctx.fillStyle = gg
    ctx.fillRect(0, 0, bw, bh)
    ctx.restore()

    ctx.fillStyle = hard > 0.5 ? '#fffdf2' : '#ffe9a8'
    this.disc(x, y, r)

    // Vacuum rays — only once the atmosphere is gone.
    if (hard > 0.4) {
      ctx.save()
      ctx.globalAlpha = (hard - 0.4) * 1.2
      ctx.strokeStyle = 'rgba(255,250,225,.5)'
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + this.time * 0.05
        const len = r * (2.1 + 0.5 * Math.sin(this.time * 1.3 + i))
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(ang) * r * 1.25, y + Math.sin(ang) * r * 1.25)
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Below the clouds it is a horizon; above them it becomes a planet you are
  // leaving. The handover happens across the stratosphere.
  drawGround(s) {
    const { ctx, bw, bh } = this
    const curve = band(s, 70, 150)
    // Anchored so the pad sits under the climber's feet at score 0 (the DOM
    // places the player at 55% of the viewport) and recedes at full parallax.
    const groundY = bh * cameraAnchor(s) + 7 + s * this.wpx

    if (curve < 1) {
      const a = 1 - curve
      const gy = Math.round(groundY)
      if (gy < bh + 40) {
        ctx.save()
        ctx.globalAlpha = a

        // Far ridgeline, hazed toward the sky colour and lagging the near
        // ground so the horizon has depth rather than reading as a decal.
        const ry = Math.round(bh * cameraAnchor(s) + 7 + s * this.wpx * 0.82)
        ctx.fillStyle = '#6d86a8'
        for (let x = 0; x < bw; x++) {
          const h = 7 + Math.sin(x * 0.031) * 5 + Math.sin(x * 0.011 + 1.7) * 4
          ctx.fillRect(x, ry - Math.round(h), 1, Math.round(h) + 2)
        }
        // Near treeline.
        ctx.fillStyle = '#27412f'
        for (let x = 0; x < bw; x++) {
          const h = 3 + Math.sin(x * 0.07 + 0.4) * 2.2 + Math.sin(x * 0.19) * 1.4
          ctx.fillRect(x, gy - Math.round(Math.max(0, h)), 1, Math.round(h) + 3)
        }
        ctx.fillStyle = '#1c3324'
        ctx.fillRect(0, gy, bw, bh - gy + 2)
        ctx.fillStyle = '#33543c'
        ctx.fillRect(0, gy, bw, 1)

        // The pad the climb starts from, dead centre under the player.
        const px0 = Math.round(bw * 0.5)
        ctx.fillStyle = '#3d4f6e'
        ctx.fillRect(px0 - 13, gy - 3, 26, 4)
        ctx.fillStyle = '#55688c'
        ctx.fillRect(px0 - 13, gy - 4, 26, 1)
        ctx.fillStyle = '#2b3a54'
        ctx.fillRect(px0 - 11, gy - 15, 2, 12)
        ctx.fillRect(px0 + 9, gy - 15, 2, 12)
        ctx.fillRect(px0 - 11, gy - 15, 22, 1)
        ctx.restore()
      }
    }

    if (curve > 0) {
      // The limb: a huge circle whose cap sits along the bottom of the frame
      // as you break into space, then shrinks and sinks away as you head
      // for the Moon. Its top edge is placed directly (a fraction of the
      // viewport) — deriving it from the radius is how it ended up below the
      // screen at every altitude and never showed at all.
      const shrink = band(s, 130, 330)
      const R = bw * (5.5 - shrink * 4.6)
      const top = bh * (0.68 + shrink * 0.36)
      const cx = bw / 2
      const cy = top + R
      const alpha = curve * (1 - band(s, 300, 380))
      if (alpha > 0.01 && top < bh) {
        ctx.save()
        ctx.globalAlpha = alpha
        // Atmosphere halo, drawn first so the planet edge sits on top of it.
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const halo = Math.max(14, Math.min(60, R * 0.03))
        const hg = ctx.createRadialGradient(cx, cy, R - 1, cx, cy, R + halo)
        hg.addColorStop(0, 'rgba(120,200,255,.55)')
        hg.addColorStop(0.35, 'rgba(90,180,255,.28)')
        hg.addColorStop(1, 'rgba(60,140,255,0)')
        ctx.fillStyle = hg
        ctx.fillRect(0, 0, bw, bh)
        ctx.restore()

        // Ocean, with a brighter rim so the edge reads against black.
        ctx.fillStyle = '#4aa3e0'
        this.disc(cx, cy, R)
        ctx.fillStyle = '#17427a'
        this.disc(cx, cy, R - 2)

        // Continents and cloud streaks: sized to the SCREEN, not the planet
        // (the radius is huge on purpose so the edge bows only slightly),
        // placed against the local edge and clipped inside the disc so they
        // can never poke above the horizon.
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R - 2, 0, Math.PI * 2)
        ctx.clip()
        const edgeY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)))
        const land = [
          [0.12, 46, 9, 5], [0.31, 70, 12, 7], [0.5, 38, 8, 9], [0.66, 84, 13, 6], [0.87, 52, 10, 8],
        ]
        ctx.fillStyle = '#1d5c37'
        for (const [fx, w, h, dy] of land) {
          const x = fx * bw
          const y = edgeY(x) + dy + h / 2
          ctx.beginPath()
          ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(255,255,255,.34)'
        for (const [fx, w] of [[0.2, 30], [0.42, 22], [0.58, 34], [0.78, 26], [0.95, 18]]) {
          const x = fx * bw
          ctx.fillRect(Math.round(x - w / 2), Math.round(edgeY(x) + 3), w, 2)
        }
        ctx.restore()
        ctx.restore()
      }
    }
  }

  drawClouds(s) {
    const { ctx, bw, bh } = this
    const fade = 1 - band(s, 50, 92)
    if (fade <= 0) return
    for (const c of this.clouds) {
      const sy = bh * cameraAnchor(s) + (s - c.score) * this.wpx * c.layer
      if (sy < -60 || sy > bh + 60) continue
      const drift = Math.sin(this.time * 0.04 + c.score) * (c.far ? 4 : 8)
      const cx = c.x * bw + drift
      ctx.save()
      // Distant clouds sit back in the haze; near ones stay bright and solid.
      ctx.globalAlpha = fade * (c.far ? 0.4 : 0.9)
      for (const p of c.puffs) {
        ctx.fillStyle = c.far ? '#dce9f7' : '#ffffff'
        this.disc(cx + p.dx * c.scale, sy + p.dy * c.scale, p.r * c.scale)
      }
      // One shaded row along the underside gives the deck a light direction.
      if (!c.far) {
        ctx.fillStyle = 'rgba(168,194,224,.9)'
        for (const p of c.puffs) {
          this.disc(cx + p.dx * c.scale, sy + (p.dy + p.r * 0.52) * c.scale, p.r * c.scale * 0.46)
        }
      }
      ctx.restore()
    }
  }
}
