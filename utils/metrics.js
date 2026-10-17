// Ширини символів шрифту годинника для власного розбиття тексту на рядки.
// Кожен символ міряється один раз (getTextLayout) і запам'ятовується: у пам'яті програми
// й у файлі metrics.json, тож наступні запуски редактора нічого не міряють.

import * as hmUI from '@zos/ui'
import { readFileSync, writeFileSync, statSync } from '@zos/fs'

const FILE = 'metrics.json'

function shared() {
  try {
    const app = getApp()
    if (app && app._options) {
      if (!app._options.globalData) app._options.globalData = {}
      return app._options.globalData
    }
  } catch (e) {}
  if (!globalThis.__notes) globalThis.__notes = {}
  return globalThis.__notes
}

function loadFile() {
  try {
    if (!statSync({ path: FILE })) return {}
    const raw = readFileSync({ path: FILE, options: { encoding: 'utf8' } })
    const data = JSON.parse(raw)
    return data && data.v === 1 && data.sizes && typeof data.sizes === 'object' ? data.sizes : {}
  } catch (e) {
    return {}
  }
}

function widthOfText(text, size) {
  try {
    const r = hmUI.getTextLayout(text, { text_size: size, text_width: 2000, wrapped: 0 })
    if (r && typeof r.width === 'number' && r.width > 0) return r.width
  } catch (e) {}
  return -1
}

export function createMeter(size) {
  const g = shared()
  if (!g.widths) g.widths = loadFile()
  const key = String(size)
  if (!g.widths[key] || typeof g.widths[key] !== 'object') g.widths[key] = {}
  const table = g.widths[key]
  let base = -1
  let dirty = false

  function estimate(ch) {
    if (ch === ' ') return Math.round(size * 0.3)
    if (/[.,:;'!|ilі]/.test(ch)) return Math.round(size * 0.3)
    return Math.round(size * 0.56)
  }

  return {
    // Ширина символу: n + символ + n мінус nn — так враховано й пробіл, і відступи гліфа.
    width(ch) {
      const known = table[ch]
      if (known !== undefined) return known
      if (base < 0) base = widthOfText('nn', size)
      const m = base > 0 ? widthOfText('n' + ch + 'n', size) : -1
      let w = m > 0 ? m - base : -1
      if (!(w > 0) || w > size * 2) w = estimate(ch)
      table[ch] = w
      dirty = true
      return w
    },

    save() {
      if (!dirty) return
      dirty = false
      try {
        writeFileSync({ path: FILE, data: JSON.stringify({ v: 1, sizes: g.widths }), options: { encoding: 'utf8' } })
      } catch (e) {}
    }
  }
}
