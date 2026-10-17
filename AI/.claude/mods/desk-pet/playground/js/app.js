'use strict'
/* The page: settings, the clock and the conversation state, and drawing both hosts each frame. */
;(() => {
  const $ = id => document.getElementById(id)
  const STORE_KEY = 'desk-pet-playground-v6'
  // Characters streamed per 100 ms tick, for the mocks' token stream.
  const STREAM_CHARS = { thinking: 120, tool: 60, writing: 170 }
  const ROAM_CELLS_PER_SECOND = 3
  const CLOSE_WIDTH = 340
  const LIMITS = {
    claude: { cols: [4, 48], rows: [1, 12], fps: [1, 60] },
    opencode: { cols: [4, 48], rows: [1, 12], fps: [1, 60] },
  }
  const ALIGNS = [
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
    { key: 'roam', label: 'Roam when idle' },
  ]
  const LINE_HEIGHTS = [
    { key: 1, label: 'WezTerm · Ghostty 1.0' },
    { key: 1.28, label: 'Kaku 1.28' },
  ]
  const BACKDROPS = ['#0A0A0A', '#0A0D12', '#1E1E2E', '#24273A']
  // The sizes a character offers, as its keys; a size sets only these fields.
  const SIZES = [
    { key: 'hosts', label: 'Hosts' },
    { key: 'larger', label: 'Larger' },
  ]
  const SIZE_FIELDS = ['cols', 'rows', 'encoder']
  const WORKING = state => state !== 'idle' && state !== 'done'
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

  const sizeOf = (of, key, host) => Object.fromEntries(SIZE_FIELDS.filter(name => of[key]?.[host]?.[name] !== undefined).map(name => [name, of[key][host][name]]))
  const startingConfig = (of, host) => ({ ...Pet.HOSTS[host].defaults, ...of.hosts?.[host] })

  const defaults = () => ({
    character: Pet.CHARACTERS[0].id,
    grid: false,
    term: { cols: 100, fontSize: 16, lineHeight: 1.28, backdrop: '#0A0A0A' },
    hosts: Object.fromEntries(Pet.HOST_KEYS.map(host => [host, startingConfig(Pet.CHARACTERS[0], host)])),
  })

  function load() {
    const base = defaults()
    let saved = {}
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') ?? {}
    } catch {}
    const settings = { ...base, ...saved, term: { ...base.term, ...saved.term }, hosts: {} }
    for (const host of Pet.HOST_KEYS) {
      settings.hosts[host] = { ...base.hosts[host], ...saved.hosts?.[host] }
      if (!Pet.ENCODERS[settings.hosts[host].encoder]) settings.hosts[host].encoder = base.hosts[host].encoder
    }
    if (!Pet.CHARACTERS.some(character => character.id === settings.character)) settings.character = base.character
    return settings
  }

  const settings = load()
  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings))
    } catch {}
  }

  const live = {
    state: 'idle',
    prev: 'idle',
    since: 0,
    clock: 0,
    playing: true,
    turn: null,
    stream: [],
    streamClock: 0,
    roam: { x: 0, dir: 1 },
    shown: {},
    dirty: true,
    latest: {},
  }
  let cell = { cw: 9.6, ch: 24 }
  const character = () => Pet.characterOf(settings.character)
  const paintScreen = Object.fromEntries(Pet.HOST_KEYS.map(host => [host, Pet.painter($(`screen-${host}`))]))
  const paintClose = Object.fromEntries(Pet.HOST_KEYS.map(host => [host, Pet.painter($(`close-${host}`))]))

  const changed = () => {
    save()
    live.dirty = true
  }

  // ---- controls ----------------------------------------------------------------------------

  function button(label, { className, title, onClick } = {}) {
    const element = document.createElement('button')
    element.type = 'button'
    element.textContent = label
    if (className) element.className = className
    if (title) element.title = title
    if (onClick) element.addEventListener('click', onClick)
    return element
  }

  function segmented(host, options, current, onPick) {
    host.replaceChildren(
      ...options.map(({ key, label, title }) => {
        const element = button(label, { title })
        element.classList.toggle('on', key === current)
        element.addEventListener('click', () => {
          for (const child of host.children) child.classList.toggle('on', child === element)
          onPick(key)
        })
        return element
      }),
    )
  }

  function stepper(host, { get, set, min, max, step = 1 }) {
    const value = document.createElement('span')
    const minus = button('−', { onClick: () => update(get() - step) })
    const plus = button('+', { onClick: () => update(get() + step) })
    const show = () => {
      value.textContent = get()
      minus.disabled = get() <= min
      plus.disabled = get() >= max
    }
    const update = next => {
      set(clamp(next, min, max))
      show()
      changed()
    }
    host.replaceChildren(minus, value, plus)
    show()
  }

  function buildHostCard(host) {
    const card = document.querySelector(`.card.host[data-host="${host}"]`)
    const field = name => card.querySelector(`[data-field="${name}"]`)
    const config = settings.hosts[host]
    const limits = LIMITS[host]
    const sizes = SIZES.filter(({ key }) => character()[key]?.[host]).map(({ key, label }) => {
      const { cols, rows } = { ...config, ...sizeOf(character(), key, host) }
      return { key, label: `${label} · ${cols} × ${rows}` }
    })
    const showSize = () => {
      const now = sizes.find(({ key }) => Object.entries(sizeOf(character(), key, host)).every(([name, value]) => config[name] === value))
      for (const [index, child] of [...field('size').children].entries()) child.classList.toggle('on', sizes[index] === now)
    }
    field('size').closest('.row').hidden = sizes.length < 2
    segmented(field('size'), sizes, null, key => {
      Object.assign(config, sizeOf(character(), key, host))
      buildHostCard(host)
      changed()
    })
    showSize()
    for (const name of ['cols', 'rows', 'fps']) {
      const set = value => {
        config[name] = value
        showSize()
      }
      stepper(field(name), { get: () => config[name], set, min: limits[name][0], max: limits[name][1] })
    }
    const note = card.querySelector('[data-role="encoderNote"]')
    const showNote = () => (note.textContent = Pet.ENCODERS[config.encoder].note)
    const encoders = Pet.ENCODER_KEYS.map(key => ({ key, label: Pet.ENCODERS[key].label }))
    segmented(field('encoder'), encoders, config.encoder, key => {
      config.encoder = key
      showNote()
      showSize()
      changed()
    })
    showNote()
    if (field('align')) {
      segmented(field('align'), ALIGNS, config.align, key => {
        config.align = key
        changed()
      })
    }
  }

  function buildTerminalCard() {
    const term = settings.term
    stepper($('termCols'), { get: () => term.cols, set: value => (term.cols = value), min: 60, max: 160, step: 2 })
    stepper($('termFont'), {
      get: () => term.fontSize,
      set: value => {
        term.fontSize = value
        measure()
      },
      min: 11,
      max: 22,
    })
    const range = $('lineHeight')
    const setLineHeight = value => {
      term.lineHeight = value
      range.value = value
      $('lineHeightOut').textContent = value.toFixed(2)
      for (const child of $('lineHeights').children) child.classList.toggle('on', Number(child.dataset.key) === value)
      measure()
      changed()
    }
    segmented($('lineHeights'), LINE_HEIGHTS, term.lineHeight, setLineHeight)
    LINE_HEIGHTS.forEach(({ key }, index) => ($('lineHeights').children[index].dataset.key = key))
    range.value = term.lineHeight
    $('lineHeightOut').textContent = term.lineHeight.toFixed(2)
    range.oninput = () => setLineHeight(Number(range.value))

    const picker = document.createElement('input')
    picker.type = 'color'
    picker.title = 'Any background'
    const swatches = BACKDROPS.map(color => {
      const swatch = button('', { title: color, onClick: () => setBackdrop(color) })
      swatch.style.background = color
      swatch.dataset.color = color
      return swatch
    })
    const setBackdrop = color => {
      term.backdrop = color.toUpperCase()
      picker.value = color
      for (const swatch of swatches) swatch.classList.toggle('on', swatch.dataset.color === term.backdrop)
      document.querySelectorAll('.glass, .closebox').forEach(element => (element.style.background = term.backdrop))
      changed()
    }
    picker.oninput = () => setBackdrop(picker.value)
    $('backdrops').replaceChildren(...swatches, picker)
    setBackdrop(term.backdrop)
  }

  function buildControls() {
    Pet.HOST_KEYS.forEach(buildHostCard)
    buildTerminalCard()
    $('grid').checked = settings.grid
  }

  function buildCharacterPicker() {
    const select = $('character')
    select.replaceChildren(
      ...Pet.CHARACTERS.map(({ id, name }) => {
        const option = document.createElement('option')
        option.value = id
        option.textContent = name
        return option
      }),
    )
    select.value = settings.character
    select.onchange = () => {
      settings.character = select.value
      for (const host of Pet.HOST_KEYS) Object.assign(settings.hosts[host], startingConfig(character(), host))
      buildControls()
      showCharacter()
      setState(live.state)
      changed()
    }
  }

  const showCharacter = () => ($('blurb').textContent = character().blurb ?? '')

  function measure() {
    cell = Pet.measureCell(settings.term.fontSize, settings.term.lineHeight)
    const { cw, ch } = cell
    const half = ch / 2 / cw
    $('cellNote').textContent = `A cell is ${cw.toFixed(1)} × ${ch.toFixed(1)} px, so a half-block pixel is 1 : ${half.toFixed(2)} (taller than wide above 1.00).`
    live.dirty = true
  }

  // ---- state and the turn -------------------------------------------------------------------

  function buildStates() {
    $('states').replaceChildren(
      ...Pet.STATES.map(({ key, label, tone }, index) => {
        const chip = button('', { className: 'chip', onClick: () => setState(key) })
        chip.dataset.key = key
        chip.style.setProperty('--chip', tone)
        const dot = document.createElement('span')
        dot.className = 'dot'
        const kbd = document.createElement('kbd')
        kbd.textContent = index + 1
        chip.append(dot, label, kbd)
        return chip
      }),
    )
    const total = Pet.TURN.reduce((sum, [, seconds]) => sum + seconds, 0)
    $('segments').replaceChildren(
      ...Pet.TURN.map(([key, seconds]) => {
        const segment = document.createElement('span')
        segment.style.flex = `${seconds / total} 0 0`
        segment.style.background = Pet.STATE[key].tone
        segment.title = Pet.STATE[key].label
        return segment
      }),
    )
  }

  // Picking the current state again restarts it, which replays a one-shot animation.
  function setState(key, { fromTurn = false } = {}) {
    if (!fromTurn) stopTurn()
    if (key !== live.state) live.prev = live.state
    live.state = key
    live.since = live.clock
    live.dirty = true
    const state = Pet.STATE[key]
    for (const chip of $('states').children) chip.classList.toggle('on', chip.dataset.key === key)
    document.documentElement.style.setProperty('--tone', state.tone)
    $('nowDot').style.background = state.tone
    $('nowLabel').textContent = state.label
    $('nowNote').innerHTML = `<b>Claude Code</b> ${state.claude} · <b>OpenCode</b> ${state.opencode}`
  }

  const TURN_SECONDS = Pet.TURN.reduce((sum, [, seconds]) => sum + seconds, 0)

  function startTurn() {
    live.turn = { index: 0, at: live.clock, start: live.clock }
    live.playing = true
    setState(Pet.TURN[0][0], { fromTurn: true })
    syncTransport()
  }

  function stopTurn() {
    live.turn = null
    syncTransport()
  }

  function advanceTurn() {
    const turn = live.turn
    while (live.turn && live.clock - turn.at >= Pet.TURN[turn.index][1]) {
      turn.at += Pet.TURN[turn.index][1]
      turn.index++
      if (turn.index >= Pet.TURN.length) {
        stopTurn()
        break
      }
      setState(Pet.TURN[turn.index][0], { fromTurn: true })
      live.since = turn.at
    }
  }

  function syncTransport() {
    $('pause').textContent = live.playing ? 'Pause' : 'Play'
    $('turn').textContent = live.turn ? 'Stop the turn' : 'Play a turn'
    $('turn').classList.toggle('on', Boolean(live.turn))
    document.querySelector('.turnline').classList.toggle('on', Boolean(live.turn))
    if (!live.turn) $('playhead').style.left = '0%'
  }

  // ---- the clock ------------------------------------------------------------------------------

  function advance(dt) {
    live.clock += dt
    advanceTurn()
    while (live.clock - live.streamClock >= 0.1) {
      live.streamClock += 0.1
      const base = STREAM_CHARS[live.state] ?? 0
      const chars = base ? Math.round(base * (0.6 + 0.8 * Math.random())) : 0
      live.stream = [...live.stream, chars].slice(-Pet.RIBBON.STREAM_HISTORY)
    }
    const max = roamLimit()
    if (settings.hosts.claude.align === 'roam' && live.state === 'idle' && max > 0) {
      live.roam.x += live.roam.dir * ROAM_CELLS_PER_SECOND * dt
      if (live.roam.x >= max) live.roam.dir = -1
      if (live.roam.x <= 0) live.roam.dir = 1
    }
    live.roam.x = clamp(live.roam.x, 0, max)
  }

  const roamLimit = () => Math.max(0, settings.term.cols - 1 - settings.hosts.claude.cols)

  function placement() {
    const { align } = settings.hosts.claude
    const max = roamLimit()
    if (align === 'right') return { x: max, facing: -1, moving: false }
    if (align === 'roam') return { x: Math.round(live.roam.x), facing: live.roam.dir, moving: live.state === 'idle' && max > 0 }
    return { x: 0, facing: 1, moving: false }
  }

  // ---- drawing ------------------------------------------------------------------------------

  function petFrame(host, frameIndex) {
    const config = settings.hosts[host]
    const encoder = Pet.ENCODERS[config.encoder]
    const grid = Pet.grid(config.cols * encoder.px[0], config.rows * encoder.px[1])
    const sinceIndex = Math.floor(live.since * config.fps)
    // OpenCode's mock always sets the pet at the right, so it looks left, into the line.
    const where = host === 'claude' ? placement() : { x: 0, facing: -1, moving: false }
    character().draw(grid, {
      host,
      state: live.state,
      prev: live.prev,
      t: Math.max(0, frameIndex - sinceIndex) / config.fps,
      clock: frameIndex / config.fps,
      facing: where.facing,
      moving: where.moving,
      encoder: config.encoder,
      cols: config.cols,
      rows: config.rows,
    })
    return { grid, cells: Pet.encode(config.encoder, grid, config.cols, config.rows), where }
  }

  function drawHost(host, frameIndex) {
    const config = settings.hosts[host]
    const { term } = settings
    const { grid, cells, where } = petFrame(host, frameIndex)
    const args = { cols: term.cols, pet: cells, petX: where.x, working: WORKING(live.state), ms: (frameIndex / config.fps) * 1000, stream: live.stream, backdrop: term.backdrop }
    const { screen, petBox } = host === 'claude' ? Pet.claudeScreen(args) : Pet.opencodeScreen(args)
    paintScreen[host](screen, { ...cell, fontSize: term.fontSize, backdrop: term.backdrop })

    const footprint = $(`footprint-${host}`)
    footprint.classList.toggle('on', settings.grid)
    Object.assign(footprint.style, {
      left: `${(petBox.x / screen.cols) * 100}%`,
      top: `${(petBox.y / screen.rows) * 100}%`,
      width: `${(petBox.cols / screen.cols) * 100}%`,
      height: `${(petBox.rows / screen.rows) * 100}%`,
    })

    drawCloseup(host, cells)
    const encoder = Pet.ENCODERS[config.encoder]
    $(`meta-${host}`).innerHTML = [
      `<span><b>${config.cols}×${config.rows}</b> cells</span>`,
      `<span><b>${grid.w}×${grid.h}</b> px</span>`,
      `<span>${encoder.label.toLowerCase()}</span>`,
      `<span>${config.fps} fps</span>`,
      `<span>frame ${frameIndex - Math.floor(live.since * config.fps)}</span>`,
    ].join('')
    live.latest[host] = { grid, cells }
  }

  function drawCloseup(host, cells) {
    const config = settings.hosts[host]
    const [pw, ph] = Pet.ENCODERS[config.encoder].px
    const scale = Math.max(1, Math.floor(CLOSE_WIDTH / (config.cols * cell.cw)))
    const screen = Pet.screen(config.cols, config.rows)
    screen.paste(0, 0, cells)
    const canvas = $(`close-${host}`)
    const { context, X, Y } = paintClose[host](screen, {
      cw: cell.cw * scale,
      ch: cell.ch * scale,
      fontSize: settings.term.fontSize * scale,
      backdrop: settings.term.backdrop,
      force: true,
    })
    if (!settings.grid) return
    const lines = (count, per, at, draw) => {
      for (let i = 1; i < count * per; i++) {
        context.fillStyle = i % per === 0 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)'
        draw(at(i / per))
      }
    }
    lines(config.cols, pw, X, x => context.fillRect(x, 0, 1, canvas.height))
    lines(config.rows, ph, Y, y => context.fillRect(0, y, canvas.width, 1))
  }

  function render() {
    for (const host of Pet.HOST_KEYS) {
      const frameIndex = Math.floor(live.clock * settings.hosts[host].fps)
      if (!live.dirty && live.shown[host] === frameIndex) continue
      live.shown[host] = frameIndex
      drawHost(host, frameIndex)
    }
    live.dirty = false
    if (live.turn) $('playhead').style.left = `${clamp((live.clock - live.turn.start) / TURN_SECONDS, 0, 1) * 100}%`
  }

  let lastNow = performance.now()
  function loop(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000)
    lastNow = now
    if (live.playing) advance(dt)
    render()
    requestAnimationFrame(loop)
  }

  // ---- export -------------------------------------------------------------------------------

  // A shell command that prints the frame in truecolour, to check it in a real terminal.
  function toPrintf(cells) {
    const rgb = hex => Pet.hexToRgb(hex).join(';')
    const lines = cells.map(row => {
      let out = ''
      let open = ''
      for (const { ch, fg, bg } of row) {
        const code = `${fg ? `\\033[38;2;${rgb(fg)}m` : '\\033[39m'}${bg ? `\\033[48;2;${rgb(bg)}m` : '\\033[49m'}`
        if (code !== open) out += code
        open = code
        out += ch
      }
      return `${out}\\033[0m`
    })
    return `printf '${lines.join('\\n')}\\n'\n`
  }

  async function copy(text, element) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    const label = element.textContent
    element.textContent = 'Copied'
    element.classList.add('flash')
    setTimeout(() => {
      element.textContent = label
      element.classList.remove('flash')
    }, 900)
  }

  function wireCopy() {
    document.querySelectorAll('[data-copy]').forEach(element => {
      const host = element.closest('[data-host]').dataset.host
      element.addEventListener('click', () => {
        const latest = live.latest[host]
        if (!latest) return
        copy(element.dataset.copy === 'pixels' ? Pet.gridToText(latest.grid) : toPrintf(latest.cells), element)
      })
    })
  }

  // ---- start --------------------------------------------------------------------------------

  function togglePause() {
    live.playing = !live.playing
    syncTransport()
  }

  function step() {
    live.playing = false
    advance(1 / Math.max(...Pet.HOST_KEYS.map(host => settings.hosts[host].fps)))
    syncTransport()
  }

  function wireKeys() {
    $('pause').onclick = togglePause
    $('step').onclick = step
    $('turn').onclick = () => (live.turn ? stopTurn() : startTurn())
    $('grid').onchange = () => {
      settings.grid = $('grid').checked
      changed()
    }
    document.addEventListener('keydown', event => {
      if (event.target.closest('input, select, textarea') || event.metaKey || event.ctrlKey || event.altKey) return
      const index = Number(event.key) - 1
      if (Pet.STATES[index]) setState(Pet.STATES[index].key)
      else if (event.key === ' ') togglePause()
      else if (event.key === '.') step()
      else if (event.key === 't') $('turn').click()
      else return
      event.preventDefault()
    })
  }

  async function start() {
    await document.fonts?.ready
    buildCharacterPicker()
    buildStates()
    buildControls()
    showCharacter()
    wireCopy()
    wireKeys()
    measure()
    setState('idle')
    syncTransport()
    requestAnimationFrame(loop)
  }

  start()
})()
