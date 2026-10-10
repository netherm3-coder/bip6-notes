// Підвантажується перед Zeus CLI (node -r) під час `npm run qr`:
// - коли `zeus preview` малює QR у терміналі, зберігає його картинкою qr.png
//   і друкує посилання;
// - якщо Zeus просить вхід (токена немає або він застарів), не відкриває
//   браузер, а завершується з кодом 42 — скрипт qr.js запустить npm run login.

const Module = require('module')
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')

const ZEUS_DIR = process.env.ZEUS_DIR || ''
const OUT = process.env.QR_OUT || path.resolve('qr.png')
const MARK = process.env.QR_MARK || ''
const LOGIN_REQUIRED = 42

// ---------- PNG без залежностей ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function writePng(file, modules, scale, border) {
  const n = modules.length
  const size = (n + border * 2) * scale
  const raw = Buffer.alloc((size + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1)
    raw[row] = 0
    const my = Math.floor(y / scale) - border
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - border
      const dark = my >= 0 && my < n && mx >= 0 && mx < n && modules[my][mx] === true
      raw[row + 1 + x] = dark ? 0 : 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 8 біт
  ihdr[9] = 0 // відтінки сірого
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0))
    ])
  )
}

// ---------- перехоплення ----------

function patchQr(qt, file) {
  const vendor = path.join(path.dirname(file), '..', 'vendor', 'QRCode')
  const QRCode = require(vendor)
  const ECL = require(path.join(vendor, 'QRErrorCorrectLevel'))
  const original = qt.generate
  qt.generate = function (input) {
    const result = original.apply(this, arguments)
    try {
      if (MARK) fs.writeFileSync(MARK, String(input))
    } catch (e) {}
    try {
      const q = new QRCode(-1, ECL.M)
      q.addData(String(input))
      q.make()
      writePng(OUT, q.modules, 12, 4)
      console.log('\n✅ QR збережено у файл qr.png (список файлів ліворуч, у корені проєкту).')
      console.log('   Посилання в QR: ' + input)
      console.log('   Zepp → Профіль → Режим розробника → значок сканера вгорі праворуч → наведи на QR.')
      console.log('   QR має термін дії (дата вище). Якщо не спрацює — npm run qr ще раз.\n')
    } catch (e) {
      console.log('(qr.png не збережено: ' + e.message + ' — скануй QR із термінала)')
    }
    return result
  }
}

function patchLogin(exp) {
  exp.login = function () {
    console.log('\n⚠️  Потрібен вхід у Zepp (або попередній уже недійсний).')
    process.exit(LOGIN_REQUIRED)
    return new Promise(() => {})
  }
}

const targets = {}
try {
  if (ZEUS_DIR) {
    targets[require.resolve('qrcode-terminal', { paths: [ZEUS_DIR] })] = patchQr
    targets[path.join(ZEUS_DIR, 'private-modules/zeppos-app-utils/dist/modules/login.js')] = patchLogin
  }
} catch (e) {}

let pending = Object.keys(targets).length
const done = {}
const originalLoad = Module._load

Module._load = function (request, parent, isMain) {
  const exp = originalLoad.apply(this, arguments)
  if (pending > 0) {
    let file = ''
    try {
      file = Module._resolveFilename(request, parent, isMain)
    } catch (e) {
      return exp
    }
    const fn = targets[file]
    if (fn && !done[file]) {
      done[file] = true
      pending -= 1
      try {
        fn(exp, file)
      } catch (e) {}
    }
  }
  return exp
}
