// Логіка редагування тексту без UI: регістр, пробіли, видалення.
// Курсор завжди в кінці тексту.

import { hasCase } from './layouts'

function isWordChar(ch) {
  return !!ch && (hasCase(ch) || (ch >= '0' && ch <= '9'))
}

export class TextEditor {
  constructor(opts) {
    const o = opts || {}
    this.text = o.text || ''
    this.maxLen = o.maxLen || 4000
    this.multiline = o.multiline !== false
    this.now = o.now || (() => Date.now())
    this.shift = 'off' // off | once | lock
    this.lastShiftTap = 0
    this.lastSpaceAt = 0
    this.autoShift()
  }

  isUpper() {
    return this.shift !== 'off'
  }

  autoShift() {
    if (this.shift === 'lock') return
    const t = this.text
    const start = t.length === 0 || /[.!?]\s+$/.test(t) || /\n\s*$/.test(t)
    this.shift = start ? 'once' : 'off'
  }

  tapShift() {
    const now = this.now()
    if (this.shift === 'lock') this.shift = 'off'
    else if (now - this.lastShiftTap < 400) this.shift = 'lock'
    else this.shift = this.shift === 'once' ? 'off' : 'once'
    this.lastShiftTap = now
  }

  // Повертає 'ok' | 'limit' | 'nonl'
  insert(raw) {
    if (raw === '\n' && !this.multiline) return 'nonl'
    if (this.text.length + raw.length > this.maxLen) return 'limit'
    const ch = hasCase(raw) && this.shift !== 'off' ? raw.toUpperCase() : raw
    this.text += ch
    this.lastSpaceAt = 0
    if (hasCase(raw) && this.shift === 'once') this.shift = 'off'
    if (raw === '\n') this.autoShift()
    return 'ok'
  }

  // Подвійний пробіл після слова ставить крапку.
  space() {
    const now = this.now()
    const t = this.text
    if (
      this.lastSpaceAt &&
      now - this.lastSpaceAt < 700 &&
      t.endsWith(' ') &&
      isWordChar(t.charAt(t.length - 2))
    ) {
      this.text = t.slice(0, -1) + '. '
      this.lastSpaceAt = 0
      this.autoShift()
      return 'ok'
    }
    if (this.text.length + 1 > this.maxLen) return 'limit'
    this.text += ' '
    this.lastSpaceAt = now
    this.autoShift()
    return 'ok'
  }

  backspace() {
    const t = this.text
    if (!t.length) return false
    const code = t.charCodeAt(t.length - 1)
    const cut = code >= 0xdc00 && code <= 0xdfff && t.length > 1 ? 2 : 1
    this.text = t.slice(0, -cut)
    this.lastSpaceAt = 0
    if (this.shift !== 'lock') this.autoShift()
    return true
  }

  deleteWord() {
    const t = this.text.replace(/\s+$/, '')
    const i = t.search(/\S+$/)
    const next = i >= 0 ? t.slice(0, i) : ''
    const changed = next !== this.text
    this.text = next
    this.lastSpaceAt = 0
    if (this.shift !== 'lock') this.autoShift()
    return changed
  }
}
