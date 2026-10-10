// Редактор заголовка або тексту нотатки з власною клавіатурою.
// Параметри: { mode: 'new' } — новий запис (спершу заголовок),
//            { id, field: 'title' | 'body', flow?: 'new' } — редагування.
// Зміни зберігаються кнопкою ✓, а також при будь-якому виході зі сторінки.

import * as hmUI from '@zos/ui'
import { back, replace } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT } from '@zos/interaction'
import { setPageBrightTime } from '@zos/display'
import { createStore } from '../utils/store'
import { COLOR, LIMITS } from '../utils/constants'
import { statusBar, toast, parseParams, fitTail, lineHeight } from '../utils/ui'
import { TextEditor } from '../keyboard/editor'
import { mountKeyboard } from '../keyboard/keyboard'

const KB_TOP = 154
const TEXT_SIZE = 26
const TEXT_X = 18
const TEXT_Y = 38

function cleanTitle(t) {
  return t.replace(/\s+/g, ' ').trim()
}

function cleanBody(t) {
  return t.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '')
}

Page({
  onInit(params) {
    const p = parseParams(params)
    this.store = createStore()
    this.committed = false
    this.gestureHooked = false
    this.keyboard = null
    this.editor = null
    this.textWidget = null
    this.isNewTitle = p.mode === 'new'
    this.flow = p.flow === 'new' ? 'new' : ''
    this.id = Number(p.id) || 0
    this.field = this.isNewTitle ? 'title' : p.field === 'title' ? 'title' : 'body'

    const note = this.id ? this.store.get(this.id) : null
    this.missing = !this.isNewTitle && !note
    this.original = note ? note[this.field] || '' : ''
  },

  build() {
    const { width: W, height: H } = getDeviceInfo()

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
      setPageBrightTime({ brightTime: 45000 })
    } catch (e) {}
    try {
      // Свайпи вбік на клавіатурі не мають закривати редактор.
      onGesture({ callback: (e) => e === GESTURE_RIGHT || e === GESTURE_LEFT })
      this.gestureHooked = true
    } catch (e) {}

    const isTitle = this.field === 'title'
    this.editor = new TextEditor({
      text: this.original,
      maxLen: isTitle ? LIMITS.TITLE : LIMITS.BODY,
      multiline: !isTitle
    })

    const caption = this.isNewTitle
      ? 'Нова нотатка: заголовок'
      : this.flow === 'new'
        ? 'Текст нотатки'
        : isTitle
          ? 'Заголовок'
          : 'Текст'

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 60,
      y: 6,
      w: W - 120,
      h: 28,
      text: caption,
      text_size: 20,
      color: COLOR.TEXT_DIM,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })

    this.textW = W - TEXT_X * 2
    this.lineH = lineHeight(TEXT_SIZE, this.textW)
    this.maxRows = Math.max(1, Math.floor((KB_TOP - TEXT_Y - 4) / this.lineH))
    this.textWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: TEXT_X,
      y: TEXT_Y,
      w: this.textW,
      h: KB_TOP - TEXT_Y - 4,
      text: '',
      text_size: TEXT_SIZE,
      color: COLOR.TEXT,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.TOP,
      text_style: hmUI.text_style.WRAP
    })
    this.renderText()

    this.keyboard = mountKeyboard({
      top: KB_TOP,
      width: W,
      height: H,
      editor: this.editor,
      lang: this.store.getLang(),
      doneIcon: this.isNewTitle ? 'kb/next.png' : 'kb/done.png',
      onText: () => this.renderText(),
      onDone: () => this.commit(true),
      onLang: (lang) => this.store.setLang(lang),
      onLimit: () => toast('Досягнуто ліміту символів'),
      onNoNewline: () => toast('У заголовку — один рядок')
    })
  },

  renderText() {
    if (!this.textWidget) return
    const shown = fitTail(this.editor.text + '|', TEXT_SIZE, this.textW, this.maxRows, this.lineH)
    try {
      this.textWidget.setProperty(hmUI.prop.MORE, {
        x: TEXT_X,
        y: TEXT_Y,
        w: this.textW,
        h: KB_TOP - TEXT_Y - 4,
        text: shown
      })
    } catch (e) {}
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
    this.commit(false)
  }
})
