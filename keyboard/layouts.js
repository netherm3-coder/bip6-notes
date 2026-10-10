// Розкладки клавіатури. '\n' — клавіша нового рядка (показується іконкою).

export const LAYOUTS = {
  uk: [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ї'],
    ['ф', 'і', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'є'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', "'", ',']
  ],
  en: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']
  ],
  sym: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '/', ':', ';', '(', ')', '"', '?', '!', '@'],
    ['.', ',', '+', '=', '%', '*', '#', '&', '_', '\n']
  ]
}

// Довге натискання: альтернативний символ.
export const ALTS = {
  'г': 'ґ',
  ',': '.',
  '.': '?',
  "'": '"'
}

export const LANG_NAMES = {
  uk: 'УКР',
  en: 'ENG'
}

export const MAX_KEYS_PER_ROW = 12

export function hasCase(ch) {
  return ch.toLowerCase() !== ch.toUpperCase()
}

export function altFor(ch) {
  const lower = ch.toLowerCase()
  const alt = ALTS[lower]
  if (!alt) return ''
  return ch !== lower ? alt.toUpperCase() : alt
}
