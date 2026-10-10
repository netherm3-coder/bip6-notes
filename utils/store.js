// Сховище нотаток: один JSON-файл у папці /data програми на годиннику.
// Запис іде через тимчасовий файл і перейменування, щоб збій посеред запису
// не зіпсував усі нотатки.

import { readFileSync, writeFileSync, renameSync, rmSync, statSync } from '@zos/fs'

const FILE = 'notes.json'
const TMP = 'notes.tmp'

function emptyDb() {
  return { v: 1, seq: 0, lang: 'uk', notes: [] }
}

function readJson(path) {
  try {
    if (!statSync({ path })) return null
    const raw = readFileSync({ path, options: { encoding: 'utf8' } })
    if (typeof raw !== 'string' || !raw.length) return null
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.notes)) return data
  } catch (e) {
    console.log('notes: read failed ' + path + ' ' + e)
  }
  return null
}

function normalize(db) {
  const out = emptyDb()
  out.lang = db.lang === 'en' ? 'en' : 'uk'
  let maxId = 0
  db.notes.forEach((n) => {
    if (!n || typeof n !== 'object') return
    const id = Number(n.id)
    if (!(id > 0)) return
    const created = Number(n.created) || Date.now()
    out.notes.push({
      id,
      title: typeof n.title === 'string' ? n.title : '',
      body: typeof n.body === 'string' ? n.body : '',
      created,
      updated: Number(n.updated) || created
    })
    if (id > maxId) maxId = id
  })
  out.seq = Math.max(Number(db.seq) || 0, maxId)
  return out
}

export function loadDb() {
  const raw = readJson(FILE) || readJson(TMP)
  return raw ? normalize(raw) : emptyDb()
}

export function saveDb(db) {
  const data = JSON.stringify(db)
  try {
    writeFileSync({ path: TMP, data, options: { encoding: 'utf8' } })
    if (renameSync({ oldPath: TMP, newPath: FILE }) === 0) return true
    // Деякі файлові системи не перезаписують файл при перейменуванні.
    rmSync({ path: FILE })
    if (renameSync({ oldPath: TMP, newPath: FILE }) === 0) return true
  } catch (e) {
    console.log('notes: atomic save failed ' + e)
  }
  try {
    writeFileSync({ path: FILE, data, options: { encoding: 'utf8' } })
    return true
  } catch (e) {
    console.log('notes: save failed ' + e)
    return false
  }
}

export function createStore() {
  const db = loadDb()
  const find = (id) => db.notes.find((n) => n.id === Number(id)) || null

  return {
    list() {
      return db.notes.slice().sort((a, b) => b.updated - a.updated || b.id - a.id)
    },
    count() {
      return db.notes.length
    },
    get(id) {
      return find(id)
    },
    create(title, body) {
      const now = Date.now()
      db.seq += 1
      const note = { id: db.seq, title: title || '', body: body || '', created: now, updated: now }
      db.notes.push(note)
      saveDb(db)
      return note
    },
    update(id, patch) {
      const note = find(id)
      if (!note) return null
      if (typeof patch.title === 'string') note.title = patch.title
      if (typeof patch.body === 'string') note.body = patch.body
      note.updated = Date.now()
      saveDb(db)
      return note
    },
    remove(id) {
      const i = db.notes.findIndex((n) => n.id === Number(id))
      if (i < 0) return false
      db.notes.splice(i, 1)
      saveDb(db)
      return true
    },
    getLang() {
      return db.lang === 'en' ? 'en' : 'uk'
    },
    setLang(lang) {
      const next = lang === 'en' ? 'en' : 'uk'
      if (db.lang === next) return
      db.lang = next
      saveDb(db)
    }
  }
}
