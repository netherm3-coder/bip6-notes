// Перегляд нотатки + кнопки редагування та видалення.

import * as hmUI from '@zos/ui'
import { push, back } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { createModal, MODAL_CONFIRM } from '@zos/interaction'
import { createStore } from '../utils/store'
import { formatStamp } from '../utils/time'
import { COLOR, STATUS_BAR_H } from '../utils/constants'
import { statusBar, toast, parseParams, textHeight, splitChunks } from '../utils/ui'

const PAD_X = 22
const TITLE_SIZE = 32
const BODY_SIZE = 26
const CHUNK = 500

Page({
  onInit(params) {
    const p = parseParams(params)
    this.id = Number(p.id) || 0
    this.navigating = false
    this.confirmAt = 0
    this.store = createStore()
  },

  build() {
    const { width: W } = getDeviceInfo()
    statusBar(true)
    const note = this.store.get(this.id)
    const textW = W - PAD_X * 2
    let y = STATUS_BAR_H + 8

    if (!note) {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 30,
        y: y + 40,
        w: W - 60,
        h: 80,
        text: 'Нотатку не знайдено',
        text_size: 28,
        color: COLOR.TEXT_DIM,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.WRAP
      })
      this.button(y + 160, W, 'Назад', COLOR.NEUTRAL, COLOR.NEUTRAL_PRESS, () => back())
      return
    }

    const title = note.title || 'Без назви'
    const titleH = textHeight(title, TITLE_SIZE, textW) + 6
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: PAD_X,
      y,
      w: textW,
      h: titleH,
      text: title,
      text_size: TITLE_SIZE,
      color: note.title ? COLOR.TEXT : COLOR.TEXT_DIM,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.TOP,
      text_style: hmUI.text_style.WRAP
    })
    y += titleH + 4

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: PAD_X,
      y,
      w: textW,
      h: 28,
      text: 'Змінено ' + formatStamp(note.updated),
      text_size: 20,
      color: COLOR.TEXT_DIM,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })
    y += 28 + 10
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: PAD_X, y, w: textW, h: 2, radius: 1, color: COLOR.LINE })
    y += 2 + 12

    const chunks = note.body ? splitChunks(note.body, CHUNK) : []
    if (!chunks.length) {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: PAD_X,
        y,
        w: textW,
        h: 70,
        text: 'Тексту ще немає',
        text_size: 24,
        color: COLOR.TEXT_DIM,
        align_h: hmUI.align.LEFT,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP
      })
      y += 70
    } else {
      chunks.forEach((chunk) => {
        const text = chunk === '' ? ' ' : chunk
        const h = textHeight(text, BODY_SIZE, textW) + 4
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: PAD_X,
          y,
          w: textW,
          h,
          text,
          text_size: BODY_SIZE,
          color: COLOR.TEXT_SOFT,
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.TOP,
          text_style: hmUI.text_style.WRAP
        })
        y += h
      })
    }
    y += 22

    y = this.button(y, W, 'Редагувати текст', COLOR.ACCENT, COLOR.ACCENT_PRESS, () =>
      this.open('page/edit', { id: note.id, field: 'body' })
    )
    y = this.button(y, W, 'Змінити заголовок', COLOR.NEUTRAL, COLOR.NEUTRAL_PRESS, () =>
      this.open('page/edit', { id: note.id, field: 'title' })
    )
    y = this.button(y, W, 'Видалити', COLOR.DANGER, COLOR.DANGER_PRESS, () => this.askDelete())

    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: y + 40, w: W, h: 2, radius: 0, color: COLOR.BG })
  },

  button(y, W, text, normal, pressed, onClick) {
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 40,
      y,
      w: W - 80,
      h: 62,
      radius: 31,
      normal_color: normal,
      press_color: pressed,
      text,
      text_size: 26,
      color: COLOR.TEXT,
      click_func: onClick
    })
    return y + 62 + 12
  },

  open(url, params) {
    if (this.navigating) return
    this.navigating = true
    setTimeout(() => {
      this.navigating = false
    }, 1500)
    push({ url, params: JSON.stringify(params) })
  },

  remove() {
    this.store.remove(this.id)
    back()
  },

  askDelete() {
    try {
      const dialog = createModal({
        content: 'Видалити нотатку?',
        autoHide: true,
        show: true,
        onClick: (keyObj) => {
          if (keyObj && keyObj.type === MODAL_CONFIRM) this.remove()
        }
      })
      if (dialog && typeof dialog.show === 'function') dialog.show(true)
    } catch (e) {
      // Запасний варіант без діалогу: друге натискання протягом 4 с.
      const now = Date.now()
      if (now - this.confirmAt < 4000) this.remove()
      else {
        this.confirmAt = now
        toast('Натисни ще раз, щоб видалити')
      }
    }
  }
})
