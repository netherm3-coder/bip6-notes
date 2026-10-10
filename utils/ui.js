import * as hmUI from '@zos/ui'
import * as interaction from '@zos/interaction'

export function statusBar(visible) {
  try {
    if (typeof hmUI.setStatusBarVisible === 'function') hmUI.setStatusBarVisible(visible)
  } catch (e) {}
}

export function toast(text) {
  try {
    if (typeof interaction.showToast === 'function') {
      interaction.showToast({ content: text })
      return
    }
    if (typeof hmUI.showToast === 'function') hmUI.showToast({ text })
  } catch (e) {
    console.log('toast: ' + text)
  }
}

export function parseParams(params) {
  if (!params) return {}
  if (typeof params === 'object') return params
  try {
    return JSON.parse(params) || {}
  } catch (e) {
    return {}
  }
}

// Однорядковий фрагмент тексту для списку.
export function oneLine(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) : t
}

// Оцінка, якщо getTextLayout недоступний: середня ширина символу ~0.55 кегля.
function estimate(text, size, width) {
  const perRow = Math.max(1, Math.floor(width / (size * 0.55)))
  let rows = 0
  String(text).split('\n').forEach((line) => {
    rows += Math.max(1, Math.ceil(line.length / perRow))
  })
  return { rows, height: Math.ceil(rows * size * 1.3) }
}

export function measure(text, size, width) {
  try {
    const r = hmUI.getTextLayout(text, { text_size: size, text_width: width, wrapped: 1 })
    if (r && r.height > 0) {
      return { rows: typeof r.rows === 'number' && r.rows > 0 ? r.rows : 0, height: r.height }
    }
  } catch (e) {}
  return estimate(text, size, width)
}

export function textHeight(text, size, width) {
  return measure(text || ' ', size, width).height
}

// Висота одного рядка для заданого кегля.
export function lineHeight(size, width) {
  const one = measure('Ag', size, width)
  const two = measure('Ag\nAg', size, width)
  const step = two.height - one.height
  return step > 0 ? step : one.height
}

function rowsOf(text, size, width, lineH) {
  const m = measure(text, size, width)
  return m.rows > 0 ? m.rows : Math.round(m.height / lineH)
}

// Хвіст тексту, що вміщується в maxRows рядків (для поля введення).
export function fitTail(text, size, width, maxRows, lineH) {
  // Міряємо лише кінець тексту, щоб довгі нотатки не гальмували набір.
  const windowLen = maxRows * 48
  if (text.length <= windowLen && rowsOf(text, size, width, lineH) <= maxRows) return text
  const windowStart = Math.max(0, text.length - windowLen)
  let lo = windowStart + 1
  let hi = text.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rowsOf('…' + text.slice(mid), size, width, lineH) <= maxRows) hi = mid
    else lo = mid + 1
  }
  // Не витрачати цілий рядок на «…», якщо хвіст починається з нового рядка.
  return '…' + text.slice(lo).replace(/^\n+/, '')
}

// Довгий текст ділиться на шматки, щоб жоден віджет TEXT не був надто високим.
export function splitChunks(text, maxLen) {
  const out = []
  String(text).split('\n').forEach((para) => {
    let rest = para
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(' ', maxLen)
      if (cut < maxLen * 0.6) cut = maxLen
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut).replace(/^ /, '')
    }
    out.push(rest)
  })
  // Порожні абзаци лишаються як відступи, але не більше двох поспіль.
  const merged = []
  let blank = 0
  out.forEach((p) => {
    if (p.trim() === '') {
      blank += 1
      if (blank <= 1) merged.push('')
    } else {
      blank = 0
      merged.push(p)
    }
  })
  while (merged.length && merged[merged.length - 1] === '') merged.pop()
  return merged
}
