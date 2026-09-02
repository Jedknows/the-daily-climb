// Tier icons: six pixel-art symbols drawn as SVG rects on a 16x16 grid, so
// they scale to any size without blurring and cost nothing to load. Each is
// the sky-side counterpart of the dive game's creatures — the Too Clever one
// keeps its meaning (bait: the shiny thing everyone bites) as a carrot on a
// string.
const NS = 'http://www.w3.org/2000/svg'

const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`

export const ICONS = {
  // A loose puff of dust, drifting apart.
  dust:
    R(5, 6, 6, 4, '#a9b8d1') + R(4, 7, 8, 2, '#c9d5e8') + R(3, 9, 3, 2, '#8fa3c4') +
    R(10, 9, 3, 2, '#8fa3c4') + R(2, 12, 2, 1, '#6f84a6') + R(12, 12, 2, 1, '#6f84a6') +
    R(7, 4, 2, 2, '#c9d5e8') + R(6, 11, 4, 1, '#8fa3c4'),

  // A carrot dangling on a string: the bait everyone reaches for.
  tooclever:
    R(7, 0, 2, 5, '#c9d5e8') + R(7, 5, 2, 1, '#8fa3c4') +
    R(6, 6, 4, 2, '#5fd35f') + R(5, 6, 1, 1, '#5fd35f') + R(10, 6, 1, 1, '#5fd35f') +
    R(6, 8, 4, 3, '#ff9f43') + R(6, 11, 3, 2, '#ff9f43') + R(7, 13, 2, 2, '#ff9f43') +
    R(7, 15, 1, 1, '#e0801f') + R(6, 9, 1, 3, '#ffb35c') + R(9, 10, 1, 2, '#e0801f'),

  // A small bird, mid-flap, in flock cyan.
  flocker:
    R(3, 6, 3, 1, '#4de3ff') + R(2, 7, 4, 1, '#4de3ff') + R(10, 6, 3, 1, '#4de3ff') +
    R(10, 7, 4, 1, '#4de3ff') + R(6, 7, 4, 3, '#7deaff') + R(5, 8, 6, 2, '#4de3ff') +
    R(6, 10, 4, 1, '#2fb8d6') + R(11, 8, 2, 1, '#2fb8d6') + R(9, 8, 1, 1, '#05070f') +
    R(12, 9, 2, 1, '#ff9f43'),

  // A comet with a long tail.
  rare:
    R(1, 12, 3, 1, '#ff7bac') + R(2, 10, 3, 1, '#ff5252') + R(3, 8, 4, 1, '#ff7bac') +
    R(5, 6, 3, 1, '#ff5252') + R(4, 11, 3, 1, '#ff5252') + R(6, 9, 3, 1, '#ff5252') +
    R(9, 4, 5, 5, '#ff5252') + R(10, 3, 3, 1, '#ff5252') + R(10, 9, 3, 1, '#ff5252') +
    R(10, 5, 2, 2, '#ffe1e1') + R(12, 6, 1, 1, '#ff9f9f'),

  // A satellite with two solar panels.
  farout:
    R(0, 6, 4, 4, '#9d7bff') + R(1, 7, 2, 2, '#bfa7ff') + R(12, 6, 4, 4, '#9d7bff') +
    R(13, 7, 2, 2, '#bfa7ff') + R(4, 7, 2, 2, '#c9d5e8') + R(10, 7, 2, 2, '#c9d5e8') +
    R(6, 5, 4, 6, '#e8f1ff') + R(7, 6, 2, 2, '#9d7bff') + R(7, 11, 2, 2, '#c9d5e8') +
    R(6, 13, 4, 1, '#9d7bff') + R(7, 2, 2, 3, '#c9d5e8') + R(7, 1, 2, 1, '#ff5d8f'),

  // A gold star with a sparkle.
  astronomical:
    R(7, 1, 2, 3, '#ffd166') + R(6, 4, 4, 2, '#ffd166') + R(2, 6, 12, 2, '#ffd166') +
    R(3, 8, 10, 1, '#ffd166') + R(4, 9, 8, 1, '#ffd166') + R(4, 10, 3, 2, '#ffd166') +
    R(9, 10, 3, 2, '#ffd166') + R(3, 12, 3, 2, '#ffd166') + R(10, 12, 3, 2, '#ffd166') +
    R(7, 6, 2, 2, '#fff4cc') + R(13, 2, 1, 1, '#fff4cc') + R(12, 3, 1, 1, '#ffd166') +
    R(14, 3, 1, 1, '#ffd166') + R(13, 4, 1, 1, '#fff4cc') + R(2, 13, 1, 1, '#fff4cc'),
}

export function iconSvg(tierId, size = 16) {
  const body = ICONS[tierId] ?? ''
  return (
    `<svg xmlns="${NS}" viewBox="0 0 16 16" width="${size}" height="${size}" ` +
    `shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`
  )
}
