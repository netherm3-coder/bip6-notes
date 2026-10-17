// Екранна клавіатура УКР/ENG/символи для Bip 6.
// Символ вводиться при відпусканні пальця: поки палець на екрані, над ним
// показується збільшена літера, і можна довести палець до сусідньої клавіші.
// Пробіл: затиснути (або повести вбік) — уся клавіатура стає тачпадом для курсора:
// вліво-вправо — по символах, вгору-вниз — по рядках; відпустив — пробіл не ставиться.
// Дотики вище клавіатури (по тексту) передаються в opts.onArea.

import * as hmUI from '@zos/ui'
import { LAYOUTS, LANG_NAMES, MAX_KEYS_PER_ROW, altFor, hasCase } from './layouts'
import { COLOR } from '../utils/constants'

const LONG_PRESS_MS = 450
const DUP_WINDOW_MS = 120
const WATCHDOG_MS = 3000
// курсор пробілом
const CURSOR_HOLD_MS = LONG_PRESS_MS // утримати пробіл стільки — і можна вести курсор
const SLIDE_PX = 18 // або одразу повести вбік на стільки (менше — це тремтіння пальця при звичайному пробілі)
const STEP_X = 14 // пікселів на один символ
const STEP_Y = 36 // пікселів на один рядок
const CURSOR_WATCHDOG_MS = 10000
const ICON = 32
const SIDE = 3
const CTRL_SIDE = 16
const CTRL_GAP = 4
const GAP_X = 3
const GAP_Y = 6
const BOTTOM = 12
const LETTER_SIZE = 28

function later(fn, ms) {
  try {
    return setTimeout(fn, ms)
  } catch (e) {
    return null
  }
}

function cancel(t) {
  if (t === null || t === undefined) return
  try {
    clearTimeout(t)
  } catch (e) {}
}

export function mountKeyboard(opts) {
  const W = opts.width
  const H = opts.height
  const top = opts.top
  const editor = opts.editor
  const rowH = Math.floor((H - BOTTOM - top) / 4)
  const ui = hmUI

  const st = {
    lang: opts.lang === 'en' ? 'en' : 'uk',
    layer: 'alpha', // alpha | sym
    doneIcon: opts.doneIcon || 'kb/done.png',
    keys: [],
    upper: null,
    pressed: false,
    key: null,
    alt: false,
    action: '', // '' | 'back' | 'cursor'
    area: false, // дотик почався на тексті, а не на клавіатурі
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
    cx: 0,
    cy: 0,
    last: 0,
    longTimer: null,
    watchdog: null
  }

  // ---------- геометрія ----------

  function letterRows() {
    if (st.layer === 'sym') return LAYOUTS.sym
    return LAYOUTS[st.lang]
  }

  function buildKeys() {
    const keys = []
    letterRows().forEach((chars, r) => {
      const n = chars.length
      const cellW = (W - SIDE * 2) / n
      const y = top + r * rowH
      chars.forEach((ch, i) => {
        const x = SIDE + i * cellW
        const vx = Math.round(x + GAP_X / 2)
        const vw = Math.round(x + cellW - GAP_X / 2) - vx
        keys.push({
          kind: ch === '\n' ? 'enter' : 'char',
          ch,
          row: r,
          col: i,
          vx,
          vy: y + GAP_Y / 2,
          vw,
          vh: rowH - GAP_Y,
          hx: i === 0 ? 0 : x,
          hy: r === 0 ? y - 10 : y,
          hw: i === 0 ? x + cellW : i === n - 1 ? W - x : cellW,
          hh: r === 0 ? rowH + 10 : rowH
        })
      })
    })

    const y = top + 3 * rowH
    const fixed = [
      ['shift', 46],
      ['sym', 54],
      ['lang', 46],
      ['space', 0],
      ['back', 54],
      ['done', 56]
    ]
    const used = fixed.reduce((s, f) => s + f[1], 0) + CTRL_GAP * (fixed.length - 1)
    const spaceW = W - CTRL_SIDE * 2 - used
    let x = CTRL_SIDE
    fixed.forEach((f, i) => {
      const w = f[0] === 'space' ? spaceW : f[1]
      keys.push({
        kind: f[0],
        ch: f[0] === 'space' ? ' ' : '',
        row: 3,
        col: i,
        vx: x,
        vy: y + GAP_Y / 2,
        vw: w,
        vh: rowH - GAP_Y,
        hx: i === 0 ? 0 : x - CTRL_GAP / 2,
        hy: y,
        hw: i === 0 ? x + w + CTRL_GAP / 2 : i === fixed.length - 1 ? W - (x - CTRL_GAP / 2) : w + CTRL_GAP,
        hh: H - y
      })
      x += w + CTRL_GAP
    })
    return keys
  }

  function hitTest(p) {
    if (!p || p.y < top - 12 || p.y > H + 4) return null
    const keys = st.keys
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (p.x >= k.hx && p.x < k.hx + k.hw && p.y >= k.hy && p.y < k.hy + k.hh) return k
    }
    return null
  }

  // ---------- віджети ----------

  const pools = []
  for (let r = 0; r < 3; r++) {
    const row = []
    for (let i = 0; i < MAX_KEYS_PER_ROW; i++) {
      const bg = ui.createWidget(ui.widget.FILL_RECT, {
        x: 0,
        y: top + r * rowH,
        w: 10,
        h: 10,
        radius: 8,
        color: COLOR.KEY
      })
      const label = ui.createWidget(ui.widget.TEXT, {
        x: 0,
        y: top + r * rowH,
        w: 10,
        h: 10,
        text: '',
        text_size: LETTER_SIZE,
        color: COLOR.TEXT,
        align_h: ui.align.CENTER_H,
        align_v: ui.align.CENTER_V,
        text_style: ui.text_style.NONE
      })
      row.push({ bg, label, key: null })
    }
    pools.push(row)
  }

  const hints = []
  for (let i = 0; i < 4; i++) {
    hints.push(
      ui.createWidget(ui.widget.TEXT, {
        x: 0,
        y: 0,
        w: 14,
        h: 18,
        text: '',
        text_size: 15,
        color: COLOR.KEY_HINT,
        align_h: ui.align.RIGHT,
        align_v: ui.align.TOP,
        text_style: ui.text_style.NONE
      })
    )
  }

  const enterIcon = ui.createWidget(ui.widget.IMG, { x: 0, y: 0, w: ICON, h: ICON, src: 'kb/enter.png' })

  const ctrl = {}
  ;['shift', 'sym', 'lang', 'space', 'back', 'done'].forEach((kind) => {
    const bg = ui.createWidget(ui.widget.FILL_RECT, {
      x: 0,
      y: top + 3 * rowH,
      w: 10,
      h: 10,
      radius: 10,
      color: kind === 'done' ? COLOR.ACCENT : COLOR.KEY_FN
    })
    let label = null
    let icon = null
    if (kind === 'sym' || kind === 'space') {
      label = ui.createWidget(ui.widget.TEXT, {
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        text: '',
        text_size: kind === 'sym' ? 22 : 18,
        color: kind === 'sym' ? COLOR.TEXT : COLOR.TEXT_DIM,
        align_h: ui.align.CENTER_H,
        align_v: ui.align.CENTER_V,
        text_style: ui.text_style.NONE
      })
    } else {
      icon = ui.createWidget(ui.widget.IMG, { x: 0, y: 0, w: ICON, h: ICON, src: 'kb/shift.png' })
    }
    ctrl[kind] = { bg, label, icon, key: null }
  })

  const bubble = ui.createWidget(ui.widget.FILL_RECT, { x: 0, y: 0, w: 60, h: 70, radius: 14, color: COLOR.BUBBLE })
  const bubbleText = ui.createWidget(ui.widget.TEXT, {
    x: 0,
    y: 0,
    w: 60,
    h: 70,
    text: '',
    text_size: 46,
    color: COLOR.TEXT,
    align_h: ui.align.CENTER_H,
    align_v: ui.align.CENTER_V,
    text_style: ui.text_style.NONE
  })
  show(bubble, false)
  show(bubbleText, false)

  // Прозорий шар на весь екран ловить дотики (координати = екранні).
  const overlay = ui.createWidget(ui.widget.TEXT, { x: 0, y: 0, w: W, h: H, text: ' ', text_size: 10, color: COLOR.BG })

  function show(wd, visible) {
    try {
      wd.setProperty(ui.prop.VISIBLE, visible)
    } catch (e) {}
  }

  function place(wd, props) {
    try {
      wd.setProperty(ui.prop.MORE, props)
    } catch (e) {}
  }

  function keyBg(k, color) {
    const target = k.row < 3 ? (pools[k.row][k.col] || {}).bg : (ctrl[k.kind] || {}).bg
    if (target) place(target, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, radius: k.row < 3 ? 8 : 10, color })
  }

  function baseColor(k) {
    if (k.kind === 'done') return COLOR.ACCENT
    if (k.row === 3 || k.kind === 'enter') return COLOR.KEY_FN
    return COLOR.KEY
  }

  function labelFor(k) {
    if (k.kind !== 'char') return ''
    if (st.layer === 'alpha' && st.upper && hasCase(k.ch)) return k.ch.toUpperCase()
    return k.ch
  }

  function shiftIcon() {
    if (st.layer === 'sym' || editor.shift === 'off') return 'kb/shift.png'
    return editor.shift === 'lock' ? 'kb/shift_lock.png' : 'kb/shift_on.png'
  }

  function refreshLabels() {
    st.upper = editor.isUpper()
    st.shiftState = editor.shift
    st.keys.forEach((k) => {
      if (k.row < 3 && k.kind === 'char') {
        const cell = pools[k.row][k.col]
        place(cell.label, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, text: labelFor(k) })
      }
    })
    const s = ctrl.shift
    place(s.icon, { x: s.key.vx + Math.round((s.key.vw - ICON) / 2), y: s.key.vy + Math.round((s.key.vh - ICON) / 2), w: ICON, h: ICON, src: shiftIcon() })
  }

  function relayout() {
    st.keys = buildKeys()
    const used = [{}, {}, {}]
    let hintIdx = 0
    let enterKey = null

    st.keys.forEach((k) => {
      if (k.row < 3) {
        const cell = pools[k.row][k.col]
        cell.key = k
        used[k.row][k.col] = true
        place(cell.bg, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, radius: 8, color: baseColor(k) })
        place(cell.label, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, text: labelFor(k) })
        show(cell.bg, true)
        show(cell.label, true)
        if (k.kind === 'enter') enterKey = k
        const alt = k.kind === 'char' && st.layer === 'alpha' ? altFor(k.ch) : ''
        if (alt && hintIdx < hints.length) {
          const h = hints[hintIdx++]
          place(h, { x: k.vx + k.vw - 15, y: k.vy + 2, w: 13, h: 18, text: alt })
          show(h, true)
        }
      } else {
        const c = ctrl[k.kind]
        c.key = k
        place(c.bg, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, radius: 10, color: baseColor(k) })
        if (c.label) place(c.label, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, text: ctrlText(k.kind) })
        if (c.icon) {
          place(c.icon, {
            x: k.vx + Math.round((k.vw - ICON) / 2),
            y: k.vy + Math.round((k.vh - ICON) / 2),
            w: ICON,
            h: ICON,
            src: ctrlIcon(k.kind)
          })
        }
      }
    })

    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < MAX_KEYS_PER_ROW; i++) {
        if (!used[r][i]) {
          show(pools[r][i].bg, false)
          show(pools[r][i].label, false)
          pools[r][i].key = null
        }
      }
    }
    for (let i = hintIdx; i < hints.length; i++) show(hints[i], false)

    if (enterKey) {
      place(enterIcon, {
        x: enterKey.vx + Math.round((enterKey.vw - ICON) / 2),
        y: enterKey.vy + Math.round((enterKey.vh - ICON) / 2),
        w: ICON,
        h: ICON,
        src: 'kb/enter.png'
      })
      show(enterIcon, true)
    } else {
      show(enterIcon, false)
    }
    refreshLabels()
  }

  function ctrlText(kind) {
    if (kind === 'sym') return st.layer === 'sym' ? (st.lang === 'uk' ? 'АБВ' : 'ABC') : '123'
    if (kind === 'space') return LANG_NAMES[st.lang]
    return ''
  }

  function ctrlIcon(kind) {
    if (kind === 'shift') return shiftIcon()
    if (kind === 'lang') return 'kb/globe.png'
    if (kind === 'back') return 'kb/back.png'
    if (kind === 'done') return st.doneIcon
    return 'kb/done.png'
  }

  // ---------- збільшена літера ----------

  function showBubble(k, text) {
    const w = Math.max(56, k.vw + 26)
    const h = 70
    let x = Math.round(k.vx + k.vw / 2 - w / 2)
    x = Math.max(4, Math.min(W - w - 4, x))
    const y = Math.max(2, k.vy - h - 6)
    place(bubble, { x, y, w, h, radius: 14, color: COLOR.BUBBLE })
    place(bubbleText, { x, y, w, h, text })
    show(bubble, true)
    show(bubbleText, true)
  }

  function hideBubble() {
    show(bubble, false)
    show(bubbleText, false)
  }

  function charOf(k, alt) {
    const base = alt ? altFor(k.ch) || k.ch : k.ch
    if (st.layer === 'alpha' && st.upper && hasCase(base)) return base.toUpperCase()
    return base
  }

  // ---------- обробка дотиків ----------

  function setKey(k) {
    if (st.key && st.key !== k) keyBg(st.key, baseColor(st.key))
    st.key = k
    st.alt = false
    cancel(st.longTimer)
    st.longTimer = null
    if (!k) {
      hideBubble()
      return
    }
    if (k.kind === 'char') {
      showBubble(k, charOf(k, false))
      keyBg(k, COLOR.KEY_PRESS)
      if (st.layer === 'alpha' && altFor(k.ch)) {
        st.longTimer = later(() => {
          if (st.pressed && st.key === k) {
            st.alt = true
            showBubble(k, charOf(k, true))
          }
        }, LONG_PRESS_MS)
      }
    } else {
      hideBubble()
      keyBg(k, COLOR.KEY_PRESS)
    }
  }

  function endPress() {
    st.pressed = false
    cancel(st.longTimer)
    cancel(st.watchdog)
    st.longTimer = null
    st.watchdog = null
    hideBubble()
    if (st.key) keyBg(st.key, baseColor(st.key))
  }

  function armWatchdog() {
    cancel(st.watchdog)
    st.watchdog = later(
      () => {
        if (st.pressed) {
          if (st.action === 'cursor') exitCursor()
          endPress()
          st.key = null
          st.area = false
        }
      },
      st.action === 'cursor' ? CURSOR_WATCHDOG_MS : WATCHDOG_MS
    )
  }

  // ---------- курсор пробілом ----------

  function spaceLook(on) {
    const c = ctrl.space
    if (!c || !c.key) return
    const k = c.key
    place(c.bg, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, radius: 10, color: on ? COLOR.ACCENT : baseColor(k) })
    place(c.label, { x: k.vx, y: k.vy, w: k.vw, h: k.vh, text: on ? '<   >' : ctrlText('space'), color: on ? COLOR.TEXT : COLOR.TEXT_DIM })
  }

  function enterCursor(anchor) {
    if (st.action === 'cursor') return
    st.action = 'cursor'
    st.cx = anchor.x
    st.cy = anchor.y
    cancel(st.longTimer)
    st.longTimer = null
    hideBubble()
    spaceLook(true)
    armWatchdog()
  }

  function exitCursor() {
    st.action = ''
    spaceLook(false)
  }

  function cursorMove(p) {
    if (!p || (p.x === 0 && p.y === 0)) return
    const dx = Math.trunc((p.x - st.cx) / STEP_X)
    const dy = Math.trunc((p.y - st.cy) / STEP_Y)
    if (!dx && !dy) return
    st.cx += dx * STEP_X
    st.cy += dy * STEP_Y
    if (opts.onCursor) opts.onCursor({ dx, dy })
    else if (dx && editor.moveCursor(dx) && opts.onText) opts.onText(editor.text)
    if (editor.shift !== st.shiftState) refreshLabels()
  }

  function onDown(p) {
    const now = Date.now()
    if (st.pressed && now - st.last < DUP_WINDOW_MS) {
      onMove(p)
      return
    }
    if (st.pressed) {
      if (st.action === 'cursor') exitCursor()
      endPress()
    }
    st.pressed = true
    st.last = now
    st.action = ''
    st.area = false
    armWatchdog()
    // Дотик по тексту над клавіатурою — гортання або курсор (вирішує сторінка).
    if (p && p.y < top - 12 && opts.onArea) {
      st.area = true
      setKey(null)
      opts.onArea('down', p)
      return
    }
    setKey(hitTest(p))
    const k = st.key
    if (k && k.kind === 'back') {
      st.action = 'back'
      if (editor.backspace()) changed()
      st.longTimer = later(() => {
        if (st.pressed && st.key === k && editor.deleteWord()) changed()
      }, LONG_PRESS_MS + 150)
    }
    if (k && k.kind === 'space' && p) {
      st.sx = st.px = p.x
      st.sy = st.py = p.y
      st.longTimer = later(() => {
        // від того місця, де палець зараз, — щоб курсор не стрибнув
        if (st.pressed && st.key === k && st.action === '') enterCursor({ x: st.px, y: st.py })
      }, CURSOR_HOLD_MS)
    }
  }

  function onMove(p) {
    if (!st.pressed) return
    st.last = Date.now()
    armWatchdog()
    if (st.area) {
      if (p && !(p.x === 0 && p.y === 0)) opts.onArea('move', p)
      return
    }
    if (st.action === 'cursor') {
      cursorMove(p)
      return
    }
    if (st.action === 'back') return
    if (!p || (p.x === 0 && p.y === 0)) return
    st.px = p.x
    st.py = p.y
    // повели пальцем по пробілу вбік — одразу курсор, без очікування
    if (st.key && st.key.kind === 'space' && Math.abs(p.x - st.sx) > SLIDE_PX) {
      enterCursor({ x: st.sx, y: st.sy })
      cursorMove(p)
      return
    }
    const k = hitTest(p)
    if (k !== st.key) setKey(k)
  }

  function onUp(p) {
    if (!st.pressed) return
    let k = st.key
    // (0,0) трактуємо як «координат немає» — тоді лишається натиснута клавіша.
    const valid = p && !(p.x === 0 && p.y === 0)
    if (st.area) {
      st.area = false
      endPress()
      st.key = null
      opts.onArea('up', valid ? p : null)
      return
    }
    if (st.action === 'cursor') {
      if (valid) cursorMove(p)
      exitCursor()
      endPress()
      st.key = null
      return
    }
    if (valid && st.action !== 'back') {
      const atUp = hitTest(p)
      if (atUp !== k) {
        k = atUp
        st.alt = false
      }
    }
    const alt = st.alt
    endPress()
    st.key = null
    if (!k || st.action === 'back') return
    activate(k, alt)
  }

  function changed() {
    if (editor.shift !== st.shiftState) refreshLabels()
    if (opts.onText) opts.onText(editor.text)
  }

  function report(res) {
    if (res === 'limit' && opts.onLimit) opts.onLimit()
    if (res === 'nonl' && opts.onNoNewline) opts.onNoNewline()
  }

  function activate(k, alt) {
    switch (k.kind) {
      case 'char': {
        const base = alt ? altFor(k.ch) || k.ch : k.ch
        report(editor.insert(base))
        changed()
        break
      }
      case 'enter':
        report(editor.insert('\n'))
        changed()
        break
      case 'space':
        report(editor.space())
        changed()
        break
      case 'shift':
        if (st.layer === 'alpha') {
          editor.tapShift()
          refreshLabels()
        }
        break
      case 'sym':
        st.layer = st.layer === 'sym' ? 'alpha' : 'sym'
        relayout()
        break
      case 'lang':
        st.lang = st.lang === 'uk' ? 'en' : 'uk'
        st.layer = 'alpha'
        relayout()
        if (opts.onLang) opts.onLang(st.lang)
        break
      case 'done':
        if (opts.onDone) opts.onDone()
        break
      default:
        break
    }
  }

  // Координати подій: від шару-перехоплювача — екранні; від клавіші можуть
  // бути відносними до клавіші, тоді переводимо в екранні.
  function absFrom(info, rect) {
    if (!info || typeof info.x !== 'number' || typeof info.y !== 'number') return null
    if (rect && info.y < top - 20) return { x: info.x + rect.vx, y: info.y + rect.vy }
    return { x: info.x, y: info.y }
  }

  function listen(wd, rectOf) {
    try {
      wd.addEventListener(ui.event.CLICK_DOWN, (info) => onDown(absFrom(info, rectOf())))
      wd.addEventListener(ui.event.MOVE, (info) => onMove(absFrom(info, rectOf())))
      wd.addEventListener(ui.event.CLICK_UP, (info) => onUp(absFrom(info, rectOf())))
    } catch (e) {}
  }

  listen(overlay, () => null)
  // Запасний шлях, якщо прозорий шар не отримує дотиків.
  pools.forEach((row) =>
    row.forEach((cell) => {
      listen(cell.bg, () => cell.key)
      listen(cell.label, () => cell.key)
    })
  )
  Object.keys(ctrl).forEach((kind) => {
    const c = ctrl[kind]
    listen(c.bg, () => c.key)
    if (c.label) listen(c.label, () => c.key)
    if (c.icon) listen(c.icon, () => c.key)
  })

  relayout()

  return {
    getLang: () => st.lang,
    // Після зміни курсора ззовні (дотик до тексту): оновити велику/малу на клавішах.
    refresh() {
      if (editor.shift !== st.shiftState) refreshLabels()
    },
    setDoneIcon(src) {
      st.doneIcon = src
      relayout()
    },
    destroy() {
      cancel(st.longTimer)
      cancel(st.watchdog)
    },
    // Для тестів: координати центру клавіші
    _keys: () => st.keys,
    _state: () => st
  }
}
