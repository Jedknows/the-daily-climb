// Particle overlay. A second canvas at device resolution sits over the pixel
// sky so sparks and rings stay crisp instead of inheriting the 3x chunk.
//
// Four families, each the sky's answer to something the dive game does with
// water: sparks rise where bubbles rose, bursts and rings are the same in
// any medium, and puffs are the grey nothing a rejected guess leaves behind.

const rand = (a, b) => a + Math.random() * (b - a)

export class Fx {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.sparks = []
    this.bursts = []
    this.hoops = []
    this.resize()
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = this.canvas.clientWidth || window.innerWidth
    this.h = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // A drifting ember that rises and fades. `y` is a screen coordinate; the
  // caller passes a world-tracking function when it should scroll with the
  // scene (see `track`).
  spark(x, y, r = 2, colour = '255,214,140', track = null) {
    if (this.sparks.length > 120) return
    this.sparks.push({
      x: x + rand(-3, 3), y, r, vy: -(14 + rand(0, 18)), wob: rand(0, 9),
      life: 3.2, t: 0, colour, track, y0: y, cam0: track ? track() : 0,
    })
  }

  // Grey, slow, and short-lived: what a guess that went nowhere looks like.
  puff(x, y) {
    this.spark(x, y, rand(1.4, 3.2), '143,163,196')
    const p = this.sparks[this.sparks.length - 1]
    if (p) p.vy = -(5 + rand(0, 6))
  }

  // Radial burst of `n` dots in one colour. `power` scales speed 0..1.
  burst(x, y, colour, n, power) {
    for (let i = 0; i < n && this.bursts.length < 260; i++) {
      const a = Math.random() * Math.PI * 2
      const s = (30 + rand(0, 130)) * power
      this.bursts.push({
        x, y, vx: Math.cos(a) * s, vy: (Math.sin(a) * s) / 2,
        r: 1.5 + rand(0, 2.5), life: 0.6 + rand(0, 0.8), t: 0, colour,
      })
    }
  }

  // Expanding hoops — the "something notable just happened here" mark.
  rings(x, y, n, colour = '255,82,82') {
    for (let i = 0; i < n && this.hoops.length < 30; i++) {
      const a = Math.random() * Math.PI * 2
      const s = rand(6, 60)
      this.hoops.push({
        x, y, vx: Math.cos(a) * s, vy: (Math.sin(a) * s) / 2,
        r: rand(12, 44), life: rand(1.2, 2.2), t: 0, colour,
      })
    }
  }

  // Cheap "everything is gold now" celebration shower.
  gild(x, y) {
    const cols = ['255,209,102', '255,233,168', '255,93,143', '77,227,255']
    for (let i = 0; i < 12; i++) {
      this.bursts.push({
        x: x + rand(-18, 18), y: y + rand(-18, 18), vx: rand(-24, 24), vy: rand(-8, 20) / 2,
        r: 1.6 + rand(0, 2.6), life: 0.5 + rand(0, 0.7), t: 0,
        colour: cols[(Math.random() * 4) | 0],
      })
    }
  }

  step(dt, camShift = 0) {
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i]
      p.t += dt
      p.y += p.vy * dt + camShift
      p.x += Math.sin(p.t * 3 + p.wob) * 12 * dt
      const k = p.t / p.life
      if (k >= 1 || p.y < -10 || p.y > h + 10) {
        this.sparks.splice(i, 1)
        continue
      }
      ctx.fillStyle = `rgba(${p.colour},${(1 - k) * 0.85})`
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.r, p.r)
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const p = this.bursts[i]
      p.t += dt
      p.x += p.vx * dt
      p.y += p.vy * dt + camShift
      p.vx *= 1 - 1.6 * dt
      p.vy = p.vy * (1 - 1.6 * dt) - 6 * dt // a hint of lift, this being the sky
      const k = p.t / p.life
      if (k >= 1) {
        this.bursts.splice(i, 1)
        continue
      }
      ctx.fillStyle = `rgba(${p.colour},${1 - k})`
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.r, p.r)
    }

    for (let i = this.hoops.length - 1; i >= 0; i--) {
      const p = this.hoops[i]
      p.t += dt
      p.x += p.vx * dt
      p.y += p.vy * dt + camShift
      const k = p.t / p.life
      if (k >= 1) {
        this.hoops.splice(i, 1)
        continue
      }
      ctx.strokeStyle = `rgba(${p.colour},${(1 - k) * 0.7})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.r * (0.4 + k), p.r * (0.4 + k) * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}
