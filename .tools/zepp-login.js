#!/usr/bin/env node
// Вхід у акаунт Zepp для Zeus CLI там, де браузер не може повернутися
// на localhost (GitHub Codespaces у браузері телефона).
// Після входу сторінка помилки покаже адресу з токеном — її треба вставити сюди.

const http = require('http')
const readline = require('readline')
const { loginConfig, readStore, writeStore } = require('./zepp-common')

const PORT = 8899
const REDIRECT = 'http://localhost:' + PORT + '/login/callback'
const cfg = loginConfig()

function fromUrl(text) {
  const s = String(text || '').trim()
  const q = s.indexOf('?')
  if (q < 0) return null
  const params = new URLSearchParams(s.slice(q + 1).split('#')[0])
  const apptoken = params.get('apptoken')
  const userid = params.get('userid')
  const cname = params.get('cname')
  if (!apptoken || !userid || !cname) return null
  return { apptoken, userid, cname }
}

function login() {
  return new Promise((resolve) => {
    let done = false
    let rl = null
    let server = null

    const finish = (info) => {
      if (done) return
      done = true
      const data = readStore()
      data[cfg.keys.token] = info.apptoken
      data[cfg.keys.userid] = info.userid
      data[cfg.keys.cname] = info.cname
      writeStore(data)
      if (rl) rl.close()
      if (server) server.close()
      console.log('\n✅ Вхід у Zepp виконано.')
      resolve(true)
    }

    server = http.createServer((req, res) => {
      const info = req.url && req.url.startsWith('/login/callback') ? fromUrl('http://localhost' + req.url) : null
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(info ? 'Готово, повернись у термінал.' : 'Немає даних входу.')
      if (info) finish(info)
    })
    server.on('error', () => {})
    server.listen(PORT)

    const query = new URLSearchParams({
      project_name: cfg.projectName,
      platform_app: cfg.platformApp,
      project_redirect_uri: REDIRECT
    }).toString()

    console.log('\n1) Відкрий це посилання й увійди тим самим акаунтом, що в Zepp app:\n')
    console.log(cfg.loginUrl + '?' + query + '\n')
    console.log('2) Після входу браузер покаже помилку (localhost недоступний) — це нормально.')
    console.log('   Скопіюй ПОВНУ адресу з рядка браузера (починається з ' + REDIRECT + '?apptoken=...)')
    console.log('   і встав сюди, потім Enter.\n')

    rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const ask = () =>
      rl.question('Адреса: ', (answer) => {
        const info = fromUrl(answer)
        if (info) finish(info)
        else {
          console.log('Не бачу apptoken, userid і cname в цій адресі. Скопіюй її повністю й спробуй ще раз.')
          ask()
        }
      })
    ask()
  })
}

module.exports = { login }

if (require.main === module) {
  login().then(() => {
    console.log('Далі: npm run qr')
    process.exit(0)
  })
}
