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

// Текст для перегляду — шматками з позицією початку в тексті нотатки:
// абзац, а довгий абзац — по реченнях (до maxLen символів). Торкнешся шматка —
// редактор відкриється з курсором на його початку.
// Порожні рядки лишаються відступом (не більше одного поспіль).
export function textChunks(text, maxLen) {
  const out = []
  const t = String(text)
  let offset = 0
  let blank = 0
  t.split('\n').forEach((para) => {
    const paraStart = offset
    offset += para.length + 1
    if (!para.trim()) {
      blank += 1
      if (blank === 1 && out.length) out.push({ text: '', start: paraStart })
      return
    }
    blank = 0
    let pos = 0
    while (pos < para.length) {
      while (pos < para.length && para[pos] === ' ') pos++
      if (pos >= para.length) break
      let end = para.length
      if (end - pos > maxLen) {
        const piece = para.slice(pos, pos + maxLen)
        let cut = -1
        // кінець речення в другій половині шматка, інакше — останній пробіл
        for (let i = piece.length - 1; i >= Math.floor(maxLen * 0.35); i--) {
          if (piece[i] === ' ' && /[.!?…]/.test(piece[i - 1])) {
            cut = i
            break
          }
        }
        if (cut < 0) {
          const sp = piece.lastIndexOf(' ')
          cut = sp >= Math.floor(maxLen * 0.5) ? sp : maxLen
        }
        end = pos + cut
      }
      out.push({ text: para.slice(pos, end).replace(/\s+$/, ''), start: paraStart + pos })
      pos = end
    }
  })
  while (out.length && out[out.length - 1].text === '') out.pop()
  return out
}
