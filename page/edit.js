// Редактор заголовка або тексту нотатки з власною клавіатурою.
// Параметри: { mode: 'new' } — новий запис (спершу заголовок),
//            { id, field: 'title' | 'body', flow?: 'new', cursor? } — редагування (cursor — де поставити курсор).
// Курсор: затиснути пробіл і вести пальцем (вліво-вправо — по символах, вгору-вниз — по рядках)
// або торкнутися тексту. Текст гортається пальцем угору-вниз; праворуч — смуга прокрутки.
// Зміни зберігаються кнопкою ✓, а також при будь-якому виході зі сторінки.

import * as hmUI from '@zos/ui'
import { back, replace } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT, GESTURE_UP, GESTURE_DOWN } from '@zos/interaction'
import { setPageBrightTime } from '@zos/display'
import { createStore } from '../utils/store'
import { createMeter } from '../utils/metrics'
import { createLayout, rowOf } from '../utils/lines'
import { COLOR, LIMITS } from '../utils/constants'
import { statusBar, toast, parseParams, lineHeight } from '../utils/ui'
import { TextEditor } from '../keyboard/editor'
import { mountKeyboard } from '../keyboard/keyboard'

const KB_TOP = 180
const TEXT_SIZE = 26
const TEXT_X = 18
const TEXT_Y = 38
const BAR_W = 4
const TAP_MOVE = 10
const TAP_MS = 700

function cleanTitle(t) {
  return t.replace(/\s+/g, ' ').trim()
}

function cleanBody(t) {
  return t.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '')
}

function setProps(widget, props) {
  if (!widget) return
  try {
    widget.setProperty(hmUI.prop.MORE, props)
  } catch (e) {}
}

function setVisible(widget, visible) {
  if (!widget) return
  try {
    widget.setProperty(hmUI.prop.VISIBLE, visible)
  } catch (e) {}
}

Page({
  onInit(params) {
    const p = parseParams(params)
    this.store = createStore()
    this.committed = false
    this.gestureHooked = false
    this.keyboard = null
    this.editor = null
    this.meter = null
    this.rows = []
    this.rowText = []
    this.lines = []
    this.layText = null
    this.topRow = 0
    this.wantX = null
    this.drag = null
    this.isNewTitle = p.mode === 'new'
    this.flow = p.flow === 'new' ? 'new' : ''
    this.id = Number(p.id) || 0
    this.field = this.isNewTitle ? 'title' : p.field === 'title' ? 'title' : 'body'
    this.startCursor = typeof p.cursor === 'number' ? p.cursor : null

    const note = this.id ? this.store.get(this.id) : null
    this.missing = !this.isNewTitle && !note
    this.original = note ? note[this.field] || '' : ''
  },

  build() {
    const { width: W, height: H } = getDeviceInfo()
    this.W = W

    if (this.missing) {
      statusBar(true)
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 30,
        y: 120,
        w: W - 60,
        h: 100,
        text: 'Нотатку не знайдено',
        text_size: 28,
        color: COLOR.TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.WRAP
      })
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: 70,
        y: 250,
        w: W - 140,
        h: 64,
        radius: 32,
        normal_color: COLOR.NEUTRAL,
        press_color: COLOR.NEUTRAL_PRESS,
        text: 'Назад',
        text_size: 26,
        color: COLOR.TEXT,
        click_func: () => back()
      })
      this.committed = true
      return
    }

    statusBar(false)
    try {
      setPageBrightTime({ brightTime: 60000 })
    } catch (e) {}
    try {
      // Свайпи на клавіатурі й тексті не мають закривати редактор чи гортати сторінку.
      onGesture({ callback: (e) => e === GESTURE_RIGHT || e === GESTURE_LEFT || e === GESTURE_UP || e === GESTURE_DOWN })
      this.gestureHooked = true
    } catch (e) {}

    const isTitle = this.field === 'title'
    this.limit = isTitle ? LIMITS.TITLE : LIMITS.BODY
    this.editor = new TextEditor({
      text: this.original,
      maxLen: this.limit,
      multiline: !isTitle,
      cursor: this.startCursor === null ? undefined : this.startCursor
    })

    this.caption = this.isNewTitle
      ? 'Нова нотатка: заголовок'
      : this.flow === 'new'
        ? 'Текст нотатки'
        : isTitle
          ? 'Заголовок'
          : 'Текст'
    this.captionWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 60,
      y: 6,
      w: W - 120,
      h: 28,
      text: this.caption,
      text_size: 20,
      color: COLOR.TEXT_DIM,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })

    // Текст: власне розбиття на рядки, кожен рядок — окремий віджет без переносу.
    this.textW = W - TEXT_X - 26
    this.lineH = lineHeight(TEXT_SIZE, this.textW)
    this.maxRows = Math.max(1, Math.floor((KB_TOP - TEXT_Y - 4) / this.lineH))
    this.meter = createMeter(TEXT_SIZE)
    this.layout = createLayout((ch) => this.meter.width(ch), this.textW - 6)
    for (let i = 0; i < this.maxRows; i++) {
      this.rows.push(
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: TEXT_X,
          y: TEXT_Y + i * this.lineH,
          w: this.textW + 8,
          h: this.lineH,
          text: '',
          text_size: TEXT_SIZE,
          color: COLOR.TEXT,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.NONE
        })
      )
      this.rowText.push('')
    }
    this.cursorRect = { x: TEXT_X, y: TEXT_Y, w: 3, h: this.lineH - 8, radius: 1, color: COLOR.ACCENT }
    this.cursorWidget = hmUI.createWidget(hmUI.widget.FILL_RECT, this.cursorRect)
    this.barX = W - 20
    this.trackH = this.maxRows * this.lineH
    this.track = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: this.barX, y: TEXT_Y, w: BAR_W, h: this.trackH, radius: 2, color: COLOR.LINE })
    this.thumb = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: this.barX, y: TEXT_Y, w: BAR_W, h: 20, radius: 2, color: COLOR.TEXT_DIM })
    this.barShown = true
    // відкрили з місцем курсора (з перегляду) — цей рядок угорі, щоб було видно, що далі
    if (this.startCursor !== null) this.topRow = rowOf(this.relayout(), this.editor.cursor)
    this.render(true)

    this.keyboard = mountKeyboard({
      top: KB_TOP,
      width: W,
      height: H,
      editor: this.editor,
      lang: this.store.getLang(),
      doneIcon: this.isNewTitle ? 'kb/next.png' : 'kb/done.png',
      onText: () => {
        this.wantX = null
        this.render(true)
      },
      onCursor: (m) => this.moveCursor(m),
      onArea: (type, p) => this.touch(type, p),
      onDone: () => this.commit(true),
      onLang: (lang) => this.store.setLang(lang),
      onLimit: () => toast('Досягнуто ліміту символів'),
      onNoNewline: () => toast('У заголовку — один рядок')
    })
  },

  relayout() {
    const text = this.editor.text
    if (text !== this.layText) {
      this.lines = this.layout.lines(text)
      this.layText = text
    }
    return this.lines
  },

  // Показати рядки з topRow; follow — прокрутити так, щоб було видно курсор.
  render(follow) {
    if (!this.editor || !this.rows.length) return
    const text = this.editor.text
    const lines = this.relayout()
    const cursor = this.editor.cursor
    const crow = rowOf(lines, cursor)
    if (follow) {
      if (crow < this.topRow) this.topRow = crow
      else if (crow >= this.topRow + this.maxRows) this.topRow = crow - this.maxRows + 1
    }
    const maxTop = Math.max(0, lines.length - this.maxRows)
    this.topRow = Math.max(0, Math.min(maxTop, this.topRow))

    for (let i = 0; i < this.maxRows; i++) {
      const li = this.topRow + i
      const t = li < lines.length ? text.slice(lines[li].start, lines[li].end) : ''
      if (t !== this.rowText[i]) {
        this.rowText[i] = t
        setProps(this.rows[i], { x: TEXT_X, y: TEXT_Y + i * this.lineH, w: this.textW + 8, h: this.lineH, text: t })
      }
    }

    const vis = crow - this.topRow
    if (vis >= 0 && vis < this.maxRows) {
      const x = Math.min(this.textW, this.layout.xOf(text, lines[crow], cursor))
      this.cursorRect = Object.assign({}, this.cursorRect, { x: TEXT_X + x - 1, y: TEXT_Y + vis * this.lineH + 4 })
      setProps(this.cursorWidget, this.cursorRect)
      setVisible(this.cursorWidget, true)
    } else {
      setVisible(this.cursorWidget, false)
    }

    // смуга прокрутки — лише коли текст не вміщується
    const total = lines.length
    const showBar = total > this.maxRows
    if (showBar !== this.barShown) {
      setVisible(this.track, showBar)
      setVisible(this.thumb, showBar)
      this.barShown = showBar
    }
    if (showBar) {
      const h = Math.max(18, Math.round((this.trackH * this.maxRows) / total))
      const y = TEXT_Y + Math.round(((this.trackH - h) * this.topRow) / Math.max(1, total - this.maxRows))
      setProps(this.thumb, { x: this.barX, y, w: BAR_W, h, radius: 2, color: COLOR.TEXT_DIM })
    }

    // лічильник — коли до ліміту лишається мало
    const near = text.length > this.limit * 0.9
    const caption = near ? this.caption + ' · ' + text.length + '/' + this.limit : this.caption
    if (caption !== this.shownCaption) {
      this.shownCaption = caption
      setProps(this.captionWidget, { x: 60, y: 6, w: this.W - 120, h: 28, text: caption })
    }
  },

  // Курсор пробілом: dx — символи, dy — рядки (горизонталь зберігається між рядками).
  moveCursor(m) {
    const ed = this.editor
    if (m.dy) {
      const lines = this.relayout()
      const text = ed.text
      const crow = rowOf(lines, ed.cursor)
      if (this.wantX === null) this.wantX = this.layout.xOf(text, lines[crow], ed.cursor)
      const target = Math.max(0, Math.min(lines.length - 1, crow + m.dy))
      if (target !== crow) ed.setCursor(this.layout.posAt(text, lines[target], this.wantX))
      else ed.setCursor(m.dy < 0 ? 0 : text.length)
    }
    if (m.dx) {
      ed.moveCursor(m.dx)
      this.wantX = null
    }
    this.render(true)
  },

  // Дотики по тексту: провести — гортати, торкнутися — поставити курсор.
  touch(type, p) {
    if (type === 'down') {
      this.drag = { x0: p.x, y0: p.y, top0: this.topRow, t0: Date.now(), moved: false }
      return
    }
    const d = this.drag
    if (!d) return
    if (type === 'move') {
      if (Math.abs(p.y - d.y0) > TAP_MOVE || Math.abs(p.x - d.x0) > TAP_MOVE) d.moved = true
      if (!d.moved) return
      const top = d.top0 + Math.round((d.y0 - p.y) / this.lineH)
      if (top !== this.topRow) {
        this.topRow = top
        this.render(false)
      }
      return
    }
    this.drag = null
    if (!d.moved && Date.now() - d.t0 < TAP_MS) this.tapAt(p || { x: d.x0, y: d.y0 })
  },

  tapAt(p) {
    const lines = this.relayout()
    const text = this.editor.text
    const row = this.topRow + Math.floor((p.y - TEXT_Y) / this.lineH)
    if (row < 0) return
    const pos = row >= lines.length ? text.length : this.layout.posAt(text, lines[row], p.x - TEXT_X)
    this.editor.setCursor(pos)
    this.wantX = null
    this.render(true)
    if (this.keyboard) this.keyboard.refresh()
  },

  commit(navigate) {
    if (this.committed) return
    this.committed = true
    const raw = this.editor ? this.editor.text : this.original
    const text = this.field === 'title' ? cleanTitle(raw) : cleanBody(raw)

    if (this.isNewTitle) {
      if (!navigate && !text) return
      const note = this.store.create(text, '')
      if (navigate) {
        replace({ url: 'page/edit', params: JSON.stringify({ id: note.id, field: 'body', flow: 'new' }) })
      }
      return
    }

    if (text !== this.original) this.store.update(this.id, { [this.field]: text })

    if (this.flow === 'new') {
      const note = this.store.get(this.id)
      if (note && !note.title && !note.body) {
        this.store.remove(this.id)
        if (navigate) back()
        return
      }
      if (navigate) replace({ url: 'page/view', params: JSON.stringify({ id: this.id }) })
      return
    }
    if (navigate) back()
  },

  onDestroy() {
    if (this.gestureHooked) {
      try {
        offGesture()
      } catch (e) {}
    }
    if (this.keyboard) this.keyboard.destroy()
    if (this.meter) this.meter.save()
    this.commit(false)
  }
})
