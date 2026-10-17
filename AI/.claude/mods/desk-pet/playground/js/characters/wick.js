'use strict'
/* Wick, a round candle-drop slime in full-colour octant pixel art.
 *
 * Its body is a fixed orange with a dark outline, after Codex pets, and its whole face is two eyes.
 * The flame on its head and its props take the stage's colour, so the state reads at a glance.
 * A grid 14 or more pixels tall gets the full pet, a 14 × 9 mochi. One 10 to 13 tall gets the small
 * pet, the full one redrawn at about half its size on a 10 × 6 body, keeping its outline, shading,
 * glinting eyes, flames and props. Anything shorter gets the mini, an 8 × 3 body at the scale of
 * Claude Code's Clawd. Both hosts pack the full pet's 24 × 16 pixels into 12 × 4 cells of octants;
 * `larger` draws the same pixels as 24 × 8 cells of half blocks, as the hosts did before. */
;(() => {
  const INK = {
    o: '#4A1E12', // outline
    b: '#E8845A', // body
    l: '#F6A47A', // lit edge
    h: '#FFE6D2', // shine
    s: '#BF5B3A', // shade
    e: '#2A100A', // eyes
    w: '#FFFFFF', // eye glints
  }
  // Vira Deepforest, everything but the body above: its yellow for the candle, its text colour for the paper.
  // Idle has no stage colour of its own, so its flame burns like a candle's.
  const CANDLE = '#FFCB6B'
  const PAPER = '#CAE5D5'
  const SLEEP_AFTER = 14
  const BLINK_EVERY = 3.7
  const BLINK_FOR = 0.15

  // ---- the rigs -------------------------------------------------------------------------------
  // Body row widths from the top, outline included; `eyes` is the row the eyes start on. Every
  // width is even, so the body stays centred on the line between two pixels.

  const FULL = {
    outline: true,
    eyeWidth: 2,
    eyeGap: 4,
    centre: 9,
    // Shine pixels, [x from the row's left edge, y from the top], on bodies this many rows tall.
    shine: { min: 7, at: [[2, 1], [3, 1], [1, 2]] },
    shapes: {
      rest: { widths: [6, 10, 12, 14, 14, 14, 14, 14, 14, 12], eyes: 4 },
      squash: { widths: [8, 12, 14, 16, 16, 16, 16, 14], eyes: 3 },
      flat: { widths: [10, 14, 16, 18, 18, 16], eyes: 2 },
      stretch: { widths: [4, 8, 10, 12, 12, 12, 12, 12, 12, 12, 10], eyes: 5 },
    },
    // Keys: e eye, w glint. `left`/`right` override `rows` when the eyes differ; `out` widens a
    // pair outwards for three-pixel eyes; `dy` moves them from the eye row.
    eyes: {
      open: { rows: ['we', 'ee', 'ee'] },
      blink: { rows: ['..', '..', 'ee'], dy: 0 },
      wide: { rows: ['we', 'ee', 'ee', 'ee'], dy: -1 },
      focus: { rows: ['we', 'ee'], dy: 1 },
      happy: { rows: ['.e.', 'e.e'], out: 1, dy: 1 },
      squint: { left: ['e.', '.e', 'e.'], right: ['.e', 'e.', '.e'] },
    },
    // Flames sit centred on the head. Keys: d deep, t tone, b bright, w core.
    flames: {
      big: [
        ['.t..', '.tt.', '.tbt', 'tbbt', 'tbwt', '.tt.'],
        ['..t.', '.tt.', 'tbt.', 'tbbt', 'twbt', '.tt.'],
        ['.t..', '..t.', '.tbt', 'tbbt', 'tbwt', '.tt.'],
      ],
      normal: [
        ['.t..', '.tt.', 'tbbt', 'tbwt', '.tt.'],
        ['..t.', '.tt.', 'tbbt', 'twbt', '.tt.'],
        ['.t..', '..t.', 'tbtt', 'tbwt', '.tt.'],
      ],
      small: [
        ['.t..', '.tb.', '.wt.'],
        ['..t.', '.bt.', '.tw.'],
      ],
      ember: [['.d..', '.dd.'], ['..d.', '.dd.']],
    },
  }

  const SMALL = {
    outline: true,
    eyeWidth: 2,
    eyeGap: 2,
    centre: 7,
    shine: { min: 5, at: [[2, 1], [3, 1]] },
    shapes: {
      rest: { widths: [8, 10, 10, 10, 10, 8], eyes: 2 },
      squash: { widths: [8, 12, 12, 12, 10], eyes: 1 },
      flat: { widths: [10, 14, 14, 12], eyes: 1 },
      stretch: { widths: [4, 6, 8, 10, 10, 10, 8], eyes: 3 },
    },
    eyes: {
      open: { rows: ['we', 'ee'] },
      blink: { rows: ['..', 'ee'], dy: 0 },
      wide: { rows: ['we', 'ee', 'ee'], dy: -1 },
      focus: { rows: ['we'], dy: 1 },
      happy: { rows: ['.e.', 'e.e'], out: 1, dy: 1 },
      squint: { left: ['e.', '.e', 'e.'], right: ['.e', 'e.', '.e'] },
    },
    flames: {
      big: [
        ['t.', 't.', 'bw', 'tt'],
        ['.t', '.t', 'wb', 'tt'],
        ['.t', 't.', 'bw', 'tt'],
      ],
      normal: [
        ['t.', 'bw', 'tt'],
        ['.t', 'wb', 'tt'],
        ['t.', 'wb', 'tt'],
      ],
      small: [
        ['t.', 'bw'],
        ['.t', 'wb'],
      ],
      ember: [['d.', 'dd'], ['.d', 'dd']],
    },
  }

  const MINI = {
    outline: false,
    eyeWidth: 1,
    eyeGap: 2,
    centre: 5,
    // Four pixels is the whole strip, so the flame burns in the crown of the head and a hop
    // swaps in the shorter `air` body.
    shapes: {
      rest: { widths: [6, 8, 8, 8], eyes: 1 },
      air: { widths: [6, 8, 8], eyes: 1 },
      squash: { widths: [8, 10, 10], eyes: 1 },
      flat: { widths: [8, 10, 10], eyes: 1 },
      stretch: { widths: [4, 6, 6, 6], eyes: 1 },
    },
    eyes: {
      open: { rows: ['e', 'e'] },
      blink: { rows: ['.', 'e'] },
      wide: { rows: ['e', 'e'] },
      focus: { rows: ['.', 'e'] },
      happy: { rows: ['e', '.'] },
      squint: { rows: ['.', 'e'] },
    },
    flames: {
      big: [['tb'], ['bt']],
      normal: [['tb'], ['bt']],
      small: [['tt'], ['tt']],
      ember: [['dd'], ['dd']],
    },
  }

  const SPRITES = {
    cloud: ['..ff.ff.', '.ffffffff', 'ffffffffff', 'ffffffffff', '.ffffffff.', '...ff....'],
    sparkle: ['.b.', 'bwb', '.b.'],
    bang: ['bt', 'bt', 'bt', 'bt', 'tt', '..', 'tt'],
    z: ['ttt', '..t', '.t.', 'ttt'],
    gear: [
      ['..t..', '.ttt.', 'ttdtt', '.ttt.', '..t..'],
      ['.t.t.', 'ttttt', '.tdt.', 'ttttt', '.t.t.'],
    ],
    gearMini: [['.t.', 'tdt', '.t.'], ['t.t', '.d.', 't.t']],
    page: ['PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP', 'PPPPPPP'],
    squeezeLeft: ['t.', '.t', 't.'],
    squeezeRight: ['.t', 't.', '.t'],
    // The small pet's props, each the full one at about half its size.
    cloudSmall: ['.ff.ff.', 'fffffff', 'fffffff', '.fffff.', '...f...'],
    bangSmall: ['b', 'b', 't', '.', 't'],
    zSmall: ['ttt', '.t.', 'ttt'],
    pageSmall: ['PPPPP', 'PPPPP', 'PPPPP', 'PPPPP', 'PPPPP', 'PPPPP'],
  }

  // ---- drawing helpers --------------------------------------------------------------------------

  const blinking = clock => clock % BLINK_EVERY < BLINK_FOR
  const cycle = (t, period, count) => Math.floor(t / period) % count

  const tones = tone => ({
    t: tone,
    d: Pet.mix(tone, '#000000', 0.45),
    f: Pet.mix(tone, '#FFFFFF', 0.35),
    b: Pet.mix(tone, '#FFFFFF', 0.5),
    w: Pet.mix(tone, '#FFFFFF', 0.85),
    W: '#FFFFFF',
    P: PAPER,
  })

  // The grid in the pet's own coordinates, where it always faces right. Facing left mirrors
  // everything but glyph sprites (Z, !), which keep their reading direction.
  function viewOf(grid, facing) {
    const mirrored = facing < 0
    const view = {
      set: (x, y, color) => color && grid.set(mirrored ? grid.w - 1 - Math.round(x) : Math.round(x), y, color),
      stamp(rows, x, y, palette, { glyph = false } = {}) {
        rows.forEach((row, dy) => {
          const w = row.length
          ;[...row].forEach((key, dx) => {
            if (key === '.') return
            view.set(x + (glyph && mirrored ? w - 1 - dx : dx), y + dy, palette[key])
          })
        })
      },
    }
    return view
  }

  // The outline, lit edge, shade and shine all come from the silhouette, so every shape is shaded
  // the same way: light from the top left.
  function paintBody(view, rig, pose, ground) {
    const shape = (pose.lift && rig.shapes.air) || rig.shapes[pose.shape] || rig.shapes.rest
    const { widths } = shape
    const bottom = ground - Math.round(pose.lift ?? 0)
    const top = bottom - widths.length + 1
    const mid = rig.centre + Math.round(pose.dx ?? 0)
    const span = y => {
      const w = widths[y - top]
      return w ? [mid - w / 2, mid + w / 2 - 1] : null
    }
    const inside = (x, y) => {
      const row = span(y)
      return !!row && x >= row[0] && x <= row[1]
    }
    const rim = (x, y) => inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))

    for (let y = top; y <= bottom; y++) {
      const [a, z] = span(y)
      for (let x = a; x <= z; x++) {
        let key = 'b'
        if (rig.outline) {
          if (rim(x, y)) key = 'o'
          else if (rim(x, y + 1) || (rim(x + 1, y) && y > top + 2)) key = 's'
          else if (rim(x, y - 1) || rim(x - 1, y)) key = 'l'
        } else if (y === bottom && widths.length > 1 && (x === a || x === z)) key = 's'
        view.set(x, y, INK[key])
      }
    }
    if (rig.shine && widths.length >= rig.shine.min) {
      for (const [dx, dy] of rig.shine.at) view.set(span(top + dy)[0] + dx, top + dy, INK.h)
    } else if (!rig.outline && widths.length >= 3) {
      view.set(span(top + 1)[0], top + 1, INK.l)
    }
    return { top, bottom, mid, eyes: top + shape.eyes, width: Math.max(...widths), span }
  }

  function paintEyes(view, rig, body, look, clock) {
    let kind = look.eyes ?? 'open'
    if ((kind === 'open' || kind === 'wide') && blinking(clock)) kind = 'blink'
    const eyes = rig.eyes[kind] ?? rig.eyes.open
    const [gx, gy] = look.gaze ?? [0, 0]
    const y = Math.min(body.eyes + gy + (eyes.dy ?? 0), rig.outline ? Infinity : body.bottom - 1)
    const out = eyes.out ?? 0
    const left = body.mid - rig.eyeGap / 2 - rig.eyeWidth + gx - out
    const right = body.mid + rig.eyeGap / 2 + gx
    // Eyes stay off the bottom row. An outlined body keeps its outline there, so the eyes lose
    // their lower rows; without an outline, an eye there would read as a gap between two legs, so
    // short bodies trim the eyes, keeping one pixel of each so the pet never goes blank.
    const fit = rows => {
      const room = Math.max(0, body.bottom - y)
      if (rows.length <= room) return rows
      if (rig.outline) return rows.slice(0, room)
      const kept = rows.slice(0, room)
      return kept.some(row => row.includes('e')) ? kept : [rows.find(row => row.includes('e'))].slice(0, room)
    }
    view.stamp(fit(eyes.left ?? eyes.rows), left, y, INK)
    view.stamp(fit(eyes.right ?? eyes.rows), right, y, INK)
  }

  function paintFlame(view, rig, body, flame, colors, clock) {
    if (!flame) return
    const frames = rig.flames[flame.size ?? 'normal']
    const rows = frames[cycle(clock, flame.speed ?? 0.18, frames.length)]
    const w = rows[0].length
    const sink = rig.outline ? 1 : rows.length
    view.stamp(rows, body.mid - w / 2 + (flame.dx ?? 0), body.top - rows.length + sink, colors)
  }

  // A hop at phase p, 0-1: crouch, spring up stretched, hang, fall, land.
  function hop(p, height) {
    if (height <= 0) return { shape: p < 0.5 ? 'squash' : 'rest', lift: 0 }
    if (p < 0.14) return { shape: 'squash', lift: 0 }
    if (p < 0.26) return { shape: 'stretch', lift: 0 }
    if (p < 0.8) {
      const u = (p - 0.26) / 0.54
      return { shape: 'rest', lift: Math.max(1, Math.round(height * 4 * u * (1 - u))) }
    }
    if (p < 0.9) return { shape: 'rest', lift: 0 }
    return { shape: 'squash', lift: 0 }
  }

  // ---- what each state does ---------------------------------------------------------------------
  // Each returns a pose: { shape, lift, dx, look: { eyes, gaze }, flame, back?(), front?(body) }.

  function sleepPose(c) {
    const since = c.t - SLEEP_AFTER
    return {
      shape: since % 3 < 1.5 ? 'rest' : 'squash',
      look: { eyes: 'blink' },
      flame: { size: 'ember', speed: 0.6 },
      front(body) {
        const palette = { t: Pet.mix(CANDLE, PAPER, 0.5) }
        for (let i = 0; i < 3; i++) {
          if (since < i * 0.9) continue
          const age = ((since - i * 0.9) / 2.7) % 1
          if (c.big) {
            const x = Math.round(body.mid + 6 + age * 6)
            const y = Math.round(body.top - 1 - age * 6)
            if (age < 0.25) c.view.set(x + 1, y + 2, palette.t)
            else c.view.stamp(SPRITES.z, x, y, palette, { glyph: true })
          } else if (c.small) {
            const x = Math.round(body.mid + 5 + age * 5)
            const y = Math.round(body.top - 1 - age * 5)
            if (age < 0.25) c.view.set(x + 1, y + 1, palette.t)
            else c.view.stamp(SPRITES.zSmall, x, y, palette, { glyph: true })
          } else {
            c.view.set(Math.round(c.gw - 6 + age * 5), Math.round(2 - age * 2.4), palette.t)
          }
        }
      },
    }
  }

  const ACTS = {
    idle(c) {
      const { t, moving, room } = c
      if (moving) {
        const step = hop((t / 0.6) % 1, Math.min(2, room))
        return { ...step, look: { gaze: [1, 0] }, flame: { size: step.lift ? 'small' : 'normal' } }
      }
      if (t >= SLEEP_AFTER) return sleepPose(c)
      const loop = t % 9
      const pose = { shape: loop % 2.4 < 0.3 ? 'squash' : 'rest', look: {}, flame: { size: 'normal' } }
      if (loop > 2.4 && loop < 3.1) pose.look.gaze = [-1, 0]
      if (loop >= 3.1 && loop < 3.8) pose.look.gaze = [1, 0]
      if (loop >= 4.6 && loop < 5.4) {
        Object.assign(pose, hop((loop - 4.6) / 0.8, Math.min(3, room)))
        if (pose.lift) pose.look.eyes = 'happy'
        pose.flame = { size: pose.lift ? 'small' : 'normal' }
      }
      if (loop >= 6.6 && loop < 7.6) pose.look.eyes = 'happy'
      return pose
    },

    // Bounces on the spot and watches three dots fill in.
    waiting(c) {
      const { t, view, big, small, colors } = c
      const p = (t / 0.7) % 1
      return {
        shape: p < 0.18 ? 'squash' : 'rest',
        look: { gaze: [1, 0] },
        flame: { size: 'normal', speed: 0.14 },
        front(body) {
          const lit = cycle(t, 0.35, 4)
          for (let i = 0; i < 3; i++) {
            const color = i < lit ? colors.t : colors.d
            if (big) view.stamp(['tt', 'tt'], body.mid + 8 + i * 3, c.ground - 1, { t: color })
            else if (small) view.set(body.mid + 6 + i * 2, c.ground, color)
            else view.set(c.gw - 5 + i * 2, c.ground, color)
          }
        },
      }
    },

    // Looks up at a thought cloud that pulses with dots.
    thinking(c) {
      const { t, view, big, small, colors } = c
      const sway = cycle(t, 0.8, 2) ? 1 : 0
      return {
        shape: 'rest',
        dx: 0,
        look: { gaze: [sway, -1] },
        flame: { size: 'big', speed: 0.16 },
        front(body) {
          if (big) {
            view.set(body.mid + 6, body.top + 1, colors.f)
            view.stamp(['ff', 'ff'], body.mid + 7, body.top - 2, colors)
            const x = c.gw - 10
            view.stamp(SPRITES.cloud, x, 0, colors)
            const dot = cycle(t, 0.3, 4)
            for (let i = 0; i < 3; i++) view.set(x + 3 + i * 2, 2, i < dot ? colors.d : colors.f)
          } else if (small) {
            view.set(body.mid + 6, body.top + 1, colors.f)
            const x = c.gw - 7
            view.stamp(SPRITES.cloudSmall, x, 0, colors)
            const dot = cycle(t, 0.3, 4)
            for (let i = 0; i < 3; i++) view.set(x + 1 + i * 2, 2, i < dot ? colors.d : colors.f)
          } else {
            const step = cycle(t, 0.3, 4)
            const spots = [[c.gw - 7, 3], [c.gw - 5, 2], [c.gw - 3, 1], [c.gw - 1, 0]]
            spots.forEach(([x, y], i) => i <= step && view.set(x, y, i === step ? colors.b : colors.t))
          }
        },
      }
    },

    // Hops in rhythm while a gear spins beside it, with a spark on each landing.
    tool(c) {
      const { t, view, big, small, colors, room } = c
      const p = (t / 0.5) % 1
      const step = hop(p, Math.min(big ? 2 : 1, room))
      const landing = p > 0.88 || p < 0.1
      return {
        ...step,
        look: { eyes: 'focus', gaze: [1, 0] },
        flame: { size: 'normal', speed: 0.1 },
        front(body) {
          const turn = cycle(t, 0.12, 2)
          if (big) {
            const x = body.mid + 9
            view.stamp(SPRITES.gear[turn], x, c.ground - 6, colors)
            if (landing) {
              view.stamp(SPRITES.sparkle, x - 2, c.ground - 2, colors)
              view.set(x + 5, c.ground, colors.b)
            }
          } else if (small) {
            const x = body.mid + 6
            view.stamp(SPRITES.gearMini[turn], x, c.ground - 4, colors)
            if (landing) {
              view.set(x - 1, c.ground, colors.w)
              view.set(x + 3, c.ground, colors.b)
            }
          } else {
            view.stamp(SPRITES.gearMini[turn], c.gw - 5, 1, colors)
            if (landing) view.set(c.gw - 1, 0, colors.w)
          }
        },
      }
    },

    // Watches a page fill with lines in the stage colour, nodding along.
    writing(c) {
      const { t, view, big, small, colors } = c
      const nod = cycle(t, 0.4, 2)
      return {
        shape: nod ? 'rest' : 'squash',
        look: { eyes: 'focus', gaze: [1, 1] },
        flame: { size: 'normal', speed: 0.15 },
        front(body) {
          // Inks `written` pixels of the page's lines, one line every other row.
          const ink = (x, y, lines, written) =>
            lines.forEach((length, i) => {
              const inked = Math.min(length, Math.max(0, written))
              written -= length
              for (let k = 0; k < inked; k++) view.set(x + 1 + k, y + 1 + i * 2, colors.d)
            })
          if (big) {
            const [x, y] = [c.gw - 8, c.ground - 8]
            view.stamp(SPRITES.page, x, y, colors)
            ink(x, y, [5, 4, 5, 3], Math.floor(t * 8) % 22)
          } else if (small) {
            const [x, y] = [c.gw - 5, c.ground - 6]
            view.stamp(SPRITES.pageSmall, x, y, colors)
            ink(x, y, [3, 2, 3], Math.floor(t * 4) % 11)
          } else {
            const written = Math.floor(t * 10) % 12
            for (let k = 0; k < Math.min(6, written); k++) view.set(c.gw - 6 + k, 1, colors.t)
            for (let k = 0; k < Math.max(0, written - 6); k++) view.set(c.gw - 6 + k, 3, colors.t)
          }
        },
      }
    },

    // Stands up tall with wide eyes under a flashing "!", and shuffles now and then.
    approval(c) {
      const { t, view, big, small, colors } = c
      const loop = t % 1.6
      const shake = loop < 0.4 ? (cycle(loop, 0.08, 2) ? 1 : -1) : 0
      return {
        shape: 'stretch',
        dx: shake,
        look: { eyes: 'wide' },
        flame: { size: 'big', speed: 0.1 },
        front(body) {
          const on = cycle(t, 0.4, 2) === 0
          const palette = on ? colors : { t: colors.d, b: colors.t }
          if (big) view.stamp(SPRITES.bang, body.mid + 7, Math.max(0, body.top - 1), palette, { glyph: true })
          else if (small) view.stamp(SPRITES.bangSmall, body.mid + 6, Math.max(0, body.top - 1), palette, { glyph: true })
          else {
            view.set(c.gw - 4, 0, palette.t)
            view.set(c.gw - 4, 1, palette.t)
            view.set(c.gw - 4, 3, palette.t)
          }
        },
      }
    },

    // Squeezed from both sides, flatter and flatter, then springs back.
    compacting(c) {
      const { t, view, big, small, colors } = c
      const p = (t / 1.4) % 1
      const shape = p < 0.25 ? 'rest' : p < 0.5 ? 'squash' : p < 0.85 ? 'flat' : 'stretch'
      return {
        shape,
        look: { eyes: 'squint' },
        flame: { size: 'small', speed: 0.12 },
        front(body) {
          const push = Math.round(Math.min(1, p / 0.85) * 2)
          const w = body.width
          if (big || small) {
            const y = c.ground - (big ? 4 : 3)
            view.stamp(SPRITES.squeezeLeft, body.mid - w / 2 - 3 + push, y, colors)
            view.stamp(SPRITES.squeezeRight, body.mid + w / 2 + 1 - push, y, colors)
          } else {
            view.set(body.mid + w / 2 + 1, c.ground - 1, colors.t)
            view.set(body.mid + w / 2 + 2 - (push ? 1 : 0), c.ground, colors.t)
          }
        },
      }
    },

    // A happy jump with sparkles, then a pleased bob.
    done(c) {
      const { t, view, big, small, colors, room, gw } = c
      const jumping = t < 0.9
      const step = jumping ? hop(t / 0.9, Math.min(big ? 3 : 1, room)) : { shape: cycle(t, 0.5, 2) ? 'rest' : 'squash', lift: 0 }
      return {
        ...step,
        look: { eyes: 'happy' },
        flame: { size: step.lift ? 'small' : 'big', speed: 0.15 },
        front(body) {
          const spots = big
            ? [[body.mid + 8, 2, 0.15], [body.mid + 11, 7, 0.3], [body.mid - 7, 3, 0.45], [gw - 2, 1, 0.6], [body.mid + 9, 11, 0.75]]
            : small
              ? [[body.mid + 5, 1, 0.15], [body.mid + 8, 5, 0.3], [body.mid - 6, 1, 0.45], [gw - 2, 1, 0.6], [body.mid + 7, 8, 0.75]]
              : [[gw - 7, 0, 0.1], [gw - 5, 2, 0.25], [gw - 3, 0, 0.4], [gw - 1, 2, 0.55]]
          for (const [x, y, at] of spots) {
            const age = t - at
            if (age < 0 || age > 2.4) continue
            const twinkle = cycle(age, 0.15, 2)
            if ((big || small) && twinkle && age < 1.8) view.stamp(SPRITES.sparkle, x - 1, y - 1, colors)
            else view.set(x, y, twinkle ? colors.W : colors.b)
          }
        },
      }
    },
  }

  Pet.defineCharacter({
    id: 'wick',
    name: 'Wick',
    blurb: 'A round candle-drop slime. The flame on its head and its props take the stage colour.',
    // What both hosts draw; their parity tests read it. An octant packs 2 × 4 pixels into a cell
    // where a half block packs 1 × 2, so the full pet is half the size each way and each pixel
    // keeps its shape. A cell still holds two colours, so cells with more merge them.
    hosts: {
      claude: { cols: 12, rows: 4, encoder: 'octant', align: 'right' },
      opencode: { cols: 12, rows: 4, encoder: 'octant', align: 'right' },
    },
    // The same pixels in half blocks, every colour kept, at twice the size.
    larger: {
      claude: { cols: 24, rows: 8, encoder: 'half' },
      opencode: { cols: 24, rows: 8, encoder: 'half' },
    },
    draw(grid, frame) {
      const big = grid.h >= 14
      const small = !big && grid.h >= 10
      const rig = big ? FULL : small ? SMALL : MINI
      const state = Pet.STATE[frame.state] ? frame.state : 'idle'
      const tone = state === 'idle' ? CANDLE : Pet.STATE[state].tone
      const restHeight = rig.outline ? rig.shapes.rest.widths.length + rig.flames.normal[0].length - 1 : rig.shapes.air.widths.length
      const c = {
        ...frame,
        big,
        small,
        ground: grid.h - 1,
        gw: grid.w,
        room: Math.max(0, grid.h - restHeight),
        view: viewOf(grid, frame.facing),
        colors: tones(tone),
      }
      const pose = ACTS[state](c)
      pose.back?.()
      const body = paintBody(c.view, rig, pose, c.ground)
      paintEyes(c.view, rig, body, pose.look ?? {}, frame.clock)
      paintFlame(c.view, rig, body, pose.flame, c.colors, frame.clock)
      pose.front?.(body)
    },
  })
})()
