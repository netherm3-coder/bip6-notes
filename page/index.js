// Список нотаток: найновіші зверху.

import * as hmUI from '@zos/ui'
import { push } from '@zos/router'
import { getScrollTop } from '@zos/page'
import { getDeviceInfo } from '@zos/device'
import { createStore } from '../utils/store'
import { formatStamp } from '../utils/time'
import { COLOR, STATUS_BAR_H, MAX_LIST_ROWS } from '../utils/constants'
import { statusBar, oneLine } from '../utils/ui'

const ROW_H = 92
const ROW_GAP = 10

function scrollTop() {
  try {
    return getScrollTop() || 0
  } catch (e) {
    return 0
  }
}

Page({
  onInit() {
    this.navigating = false
    this.press = null
  },

  build() {
    const { width: W } = getDeviceInfo()
    statusBar(true)
    const store = createStore()
    const notes = store.list()

    let y = STATUS_BAR_H + 8
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 24,
      y,
      w: W - 48,
      h: 64,
      radius: 32,
      normal_color: COLOR.ACCENT,
      press_color: COLOR.ACCENT_PRESS,
      text: '+ Нова нотатка',
      text_size: 28,
      color: COLOR.TEXT,
      click_func: () => this.open('page/edit', { mode: 'new' })
    })
    y += 64 + 16

    if (!notes.length) {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 30,
        y: y + 30,
        w: W - 60,
        h: 140,
        text: 'Нотаток поки немає.\nНатисни «+ Нова нотатка».',
        text_size: 24,
        color: COLOR.TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP
      })
      return
    }

    notes.slice(0, MAX_LIST_ROWS).forEach((note) => {
      this.row(note, y, W)
      y += ROW_H + ROW_GAP
    })

    if (notes.length > MAX_LIST_ROWS) {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 30,
        y: y + 4,
        w: W - 60,
        h: 60,
        text: 'Показано ' + MAX_LIST_ROWS + ' з ' + notes.length + '.\nСтарші видаляй, щоб звільнити місце.',
        text_size: 20,
        color: COLOR.TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP
      })
      y += 70
    }

    // Відступ знизу, щоб останній рядок не ховався за заокругленими кутами.
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: y + 40, w: W, h: 2, radius: 0, color: COLOR.BG })
  },

  row(note, y, W) {
    const x = 16
    const w = W - 32
    const bg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x, y, w, h: ROW_H, radius: 20, color: COLOR.CARD })
    const title = hmUI.createWidget(hmUI.widget.TEXT, {
      x: x + 18,
      y: y + 10,
      w: w - 36,
      h: 40,
      text: note.title || oneLine(note.body, 40) || 'Без назви',
      text_size: 28,
      color: note.title ? COLOR.TEXT : COLOR.TEXT_SOFT,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })
    const preview = note.title ? oneLine(note.body, 60) : ''
    const sub = hmUI.createWidget(hmUI.widget.TEXT, {
      x: x + 18,
      y: y + 52,
      w: w - 36,
      h: 30,
      text: formatStamp(note.updated) + (preview ? ' · ' + preview : ''),
      text_size: 20,
      color: COLOR.TEXT_DIM,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })

    const paint = (color) => {
      try {
        bg.setProperty(hmUI.prop.MORE, { x, y, w, h: ROW_H, radius: 20, color })
      } catch (e) {}
    }
    const down = () => {
      this.press = { id: note.id, top: scrollTop(), t: Date.now() }
      paint(COLOR.CARD_PRESS)
      setTimeout(() => paint(COLOR.CARD), 350)
    }
    const up = () => {
      const p = this.press
      this.press = null
      if (!p || p.id !== note.id) return
      // Якщо сторінку прокрутили — це був свайп, а не натискання.
      if (Math.abs(scrollTop() - p.top) > 6) return
      if (Date.now() - p.t > 1500) return
      this.open('page/view', { id: note.id })
    }
    ;[bg, title, sub].forEach((wd) => {
      try {
        wd.addEventListener(hmUI.event.CLICK_DOWN, down)
        wd.addEventListener(hmUI.event.CLICK_UP, up)
      } catch (e) {}
    })
  },

  open(url, params) {
    if (this.navigating) return
    this.navigating = true
    setTimeout(() => {
      this.navigating = false
    }, 1500)
    push({ url, params: JSON.stringify(params) })
  }
})
