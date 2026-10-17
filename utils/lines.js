// Розбиття тексту на рядки екрана — власне, а не віджета: так відомо, у якому рядку
// й де саме курсор, можна гортати по рядках і ставити курсор дотиком.
// Кожен рядок показується окремим віджетом без переносу, тож розбиття = те, що на екрані.

// widthOf(ch) — ширина символу в пікселях; maxW — ширина рядка.
export function createLayout(widthOf, maxW) {
  // ключ — сам текст абзацу; без прототипу, щоб абзац «constructor» не зламав кеш
  let cache = Object.create(null)
  let cached = 0

  // Абзац без \n → пласкі пари [початок, кінець, …] відносно абзацу.
  function wrap(p) {
    const out = []
    let lineStart = 0
    let x = 0
    let lastBreak = -1
    for (let i = 0; i < p.length; i++) {
      const ch = p[i]
      const w = widthOf(ch)
      // пробіл ніколи не переносимо на новий рядок — він лишається в кінці попереднього
      if (ch !== ' ' && x + w > maxW && i > lineStart) {
        const cut = lastBreak > lineStart ? lastBreak : i
        out.push(lineStart, cut)
        lineStart = cut
        x = 0
        for (let k = cut; k < i; k++) x += widthOf(p[k])
        lastBreak = -1
      }
      x += w
      if (ch === ' ') lastBreak = i + 1
    }
    out.push(lineStart, p.length)
    return out
  }

  function wrapCached(p) {
    let r = cache[p]
    if (!r) {
      if (cached > 300) {
        cache = Object.create(null)
        cached = 0
      }
      r = wrap(p)
      cache[p] = r
      cached++
    }
    return r
  }

  return {
    // Увесь текст → [{ start, end }]: end не включно; для рядка перед \n end — позиція \n.
    lines(text) {
      const lines = []
      const paras = String(text).split('\n')
      let offset = 0
      for (let i = 0; i < paras.length; i++) {
        const rel = wrapCached(paras[i])
        for (let k = 0; k < rel.length; k += 2) lines.push({ start: offset + rel[k], end: offset + rel[k + 1], soft: k + 2 < rel.length })
        offset += paras[i].length + 1
      }
      return lines
    },

    // Відстань від початку рядка до позиції pos.
    xOf(text, line, pos) {
      let x = 0
      const end = Math.min(pos, line.end)
      for (let i = line.start; i < end; i++) x += widthOf(text[i])
      return x
    },

    // Позиція в рядку, найближча до x (дотик або рух курсора вгору-вниз).
    posAt(text, line, x) {
      let acc = 0
      for (let i = line.start; i < line.end; i++) {
        const w = widthOf(text[i])
        if (x < acc + w / 2) return i
        acc += w
      }
      // кінець перенесеного рядка — перед його пробілом, щоб курсор лишився в цьому рядку
      if (line.soft && line.end > line.start && text[line.end - 1] === ' ') return line.end - 1
      return line.end
    }
  }
}

// Рядок, у якому стоїть курсор (на межі перенесення — на початку наступного рядка).
export function rowOf(lines, pos) {
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid].start <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}
