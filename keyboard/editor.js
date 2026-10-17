// Логіка редагування тексту без UI: курсор, регістр, пробіли, видалення.
// cursor — позиція в тексті (0…text.length); вставка й видалення — біля курсора.

import { hasCase } from './layouts'

function isWordChar(ch) {
  return !!ch && (hasCase(ch) || (ch >= '0' && ch <= '9'))
}

function isLow(code) {
  return code >= 0xdc00 && code <= 0xdfff
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
    this.cursor = this.text.length
    if (typeof o.cursor === 'number') this.setCursor(o.cursor)
    this.autoShift()
  }

  before() {
    return this.text.slice(0, this.cursor)
  }

  after() {
    return this.text.slice(this.cursor)
  }

  isUpper() {
    return this.shift !== 'off'
  }

  // Велика літера на початку тексту, речення чи рядка — за текстом перед курсором.
  autoShift() {
    if (this.shift === 'lock') return
    const t = this.before()
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

  put(s) {
    this.text = this.before() + s + this.after()
    this.cursor += s.length
  }

  // Повертає 'ok' | 'limit' | 'nonl'
  insert(raw) {
    if (raw === '\n' && !this.multiline) return 'nonl'
    if (this.text.length + raw.length > this.maxLen) return 'limit'
    const ch = hasCase(raw) && this.shift !== 'off' ? raw.toUpperCase() : raw
    this.put(ch)
    this.lastSpaceAt = 0
    if (hasCase(raw) && this.shift === 'once') this.shift = 'off'
    if (raw === '\n') this.autoShift()
    return 'ok'
  }

  // Подвійний пробіл після слова ставить крапку.
  space() {
    const now = this.now()
    const t = this.before()
    if (this.lastSpaceAt && now - this.lastSpaceAt < 700 && t.endsWith(' ') && isWordChar(t.charAt(t.length - 2))) {
      this.text = t.slice(0, -1) + '. ' + this.after()
      this.cursor += 1
      this.lastSpaceAt = 0
      this.autoShift()
      return 'ok'
    }
    if (this.text.length + 1 > this.maxLen) return 'limit'
    this.put(' ')
    this.lastSpaceAt = now
    this.autoShift()
    return 'ok'
  }

  backspace() {
    if (this.cursor <= 0) return false
    const t = this.before()
    const cut = isLow(t.charCodeAt(t.length - 1)) && t.length > 1 ? 2 : 1
    this.text = t.slice(0, -cut) + this.after()
    this.cursor -= cut
    this.lastSpaceAt = 0
    if (this.shift !== 'lock') this.autoShift()
    return true
  }

  deleteWord() {
    const t = this.before().replace(/\s+$/, '')
    const i = t.search(/\S+$/)
    const next = i >= 0 ? t.slice(0, i) : ''
    const changed = next.length !== this.cursor
    this.text = next + this.after()
    this.cursor = next.length
    this.lastSpaceAt = 0
    if (this.shift !== 'lock') this.autoShift()
    return changed
  }

  // Курсор у позицію pos (не посеред емодзі з двох половинок).
  setCursor(pos) {
    let p = Math.max(0, Math.min(this.text.length, Math.round(Number(pos) || 0)))
    if (p > 0 && p < this.text.length && isLow(this.text.charCodeAt(p))) p -= 1
    const moved = p !== this.cursor
    this.cursor = p
    if (moved) {
      this.lastSpaceAt = 0
      if (this.shift !== 'lock') this.autoShift()
    }
    return moved
  }

  // На n символів уперед (n > 0) або назад (n < 0).
  moveCursor(n) {
    let p = this.cursor
    const step = n > 0 ? 1 : -1
    for (let k = 0; k < Math.abs(n); k++) {
      const next = p + step
      if (next < 0 || next > this.text.length) break
      p = next
      if (p > 0 && p < this.text.length && isLow(this.text.charCodeAt(p))) p += step
    }
    return this.setCursor(p)
  }
}
