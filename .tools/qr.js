#!/usr/bin/env node
// npm run qr — зібрати програму, завантажити на сервер Zepp і отримати QR
// для встановлення через «Режим розробника» в Zepp app.

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { zeusDir, isLoggedIn, deviceNameFor } = require('./zepp-common')
const { login } = require('./zepp-login')

const LOGIN_REQUIRED = 42
const project = path.resolve(__dirname, '..')
const qrFile = path.join(project, 'qr.png')
const mark = path.join(os.tmpdir(), 'bip6-notes-qr-' + process.pid + '.txt')
const dir = zeusDir()

if (!dir) {
  console.log('Zeus CLI не встановлено. Виконай: npm install -g @zeppos/zeus-cli@1')
  process.exit(1)
}

function clean() {
  ;[qrFile, mark].forEach((f) => {
    try {
      fs.rmSync(f, { force: true })
    } catch (e) {}
  })
}

function preview() {
  clean()
  const args = ['-r', path.join(__dirname, 'qr-hook.js'), path.join(dir, 'bin', 'main.js'), 'preview']
  const name = deviceNameFor(project)
  if (name) args.push('--target', name)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: project,
      stdio: 'inherit',
      env: Object.assign({}, process.env, { ZEUS_DIR: dir, QR_OUT: qrFile, QR_MARK: mark })
    })
    child.on('exit', (code) => resolve(code === null ? 1 : code))
  })
}

;(async () => {
  if (!isLoggedIn()) {
    console.log('Спершу вхід у Zepp (один раз).')
    await login()
  }
  console.log('\nЗбираю програму й отримую QR. Якщо спитає пристрій — обери Amazfit Bip 6 і натисни Enter.\n')
  let code = await preview()
  if (code === LOGIN_REQUIRED) {
    await login()
    code = await preview()
  }
  const shown = fs.existsSync(mark)
  try {
    fs.rmSync(mark, { force: true })
  } catch (e) {}
  if (!shown) {
    console.log('\nQR не отримано — причина в повідомленні вище.')
    console.log("Найчастіше: немає зв'язку із сервером Zepp (спробуй ще раз) або застарів вхід (npm run login).")
    process.exit(code || 1)
  }
  process.exit(0)
})()
