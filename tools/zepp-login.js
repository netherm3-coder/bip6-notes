#!/usr/bin/env node
// Вхід у акаунт Zepp для Zeus CLI там, де браузер не може повернутися
// на localhost (GitHub Codespaces у браузері телефона).
// Після входу сторінка помилки покаже адресу з токеном — її треба вставити сюди.

const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const { execSync } = require('child_process')

const PORT = 8899
const REDIRECT = 'http://localhost:' + PORT + '/login/callback'

let loginUrl = 'https://user.zepp.com/universalLogin/index.html#/login'
let projectName = 'zeppos_zeus_cli'
let platformApp = 'com.huami.webapp'
let keys = {
  token: '____user_zepp_com__token',
  userid: '____user_zepp_com__userid',
  cname: '____user_zepp_com__cname'
}

// Беремо налаштування з установленого Zeus CLI, щоб не розійтися з ним.
try {
  const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  const cfgPath = path.join(root, '@zeppos/zeus-cli/private-modules/zeppos-app-utils/dist/config/project.js')
  const local = require(cfgPath).getLocalConfig()
  loginUrl = String(local.loginConfig.LOGIN_URL)
  projectName = local.loginConfig.PROJECT_NAME
  platformApp = local.loginConfig.PLATFORM_APP
  keys = {
    token: local.loginStorageKey.accountToken,
    userid: local.loginStorageKey.userid,
    cname: local.loginStorageKey.cname
  }
} catch (e) {
  console.log('(Zeus CLI не знайдено в npm root -g, використовую типові налаштування)')
}

const storeFile = path.join(os.homedir(), '.zepp', '.zeus')

function save(apptoken, userid, cname) {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true })
  const data = {}
  if (fs.existsSync(storeFile)) {
    fs.readFileSync(storeFile, 'utf8')
      .split('\n')
      .forEach((line) => {
        const i = line.indexOf('=')
        if (i > 0) data[line.slice(0, i)] = line.slice(i + 1)
      })
  }
  data[keys.token] = apptoken
  data[keys.userid] = userid || ''
  data[keys.cname] = cname
  fs.writeFileSync(
    storeFile,
    Object.keys(data)
      .map((k) => k + '=' + data[k])
      .join('\n')
  )
}

function fromUrl(text) {
  const s = String(text || '').trim()
  const q = s.indexOf('?')
  if (q < 0) return null
  const params = new URLSearchParams(s.slice(q + 1).split('#')[0])
  const apptoken = params.get('apptoken')
  const userid = params.get('userid')
  const cname = params.get('cname')
  if (!apptoken || !cname) return null
  return { apptoken, userid, cname }
}

function finish(info) {
  save(info.apptoken, info.userid, info.cname)
  console.log('\n✅ Вхід виконано. Далі: zeus bridge → connect → install')
  process.exit(0)
}

const server = http.createServer((req, res) => {
  const info = req.url && req.url.startsWith('/login/callback') ? fromUrl('http://localhost' + req.url) : null
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(info ? 'Готово, повернись у термінал.' : 'Немає даних входу.')
  if (info) finish(info)
})
server.on('error', () => {})
server.listen(PORT)

const query = new URLSearchParams({
  project_name: projectName,
  platform_app: platformApp,
  project_redirect_uri: REDIRECT
}).toString()

console.log('\n1) Відкрий це посилання й увійди тим самим акаунтом, що в Zepp app:\n')
console.log(loginUrl + '?' + query + '\n')
console.log('2) Після входу браузер покаже помилку (localhost недоступний) — це нормально.')
console.log('   Скопіюй ПОВНУ адресу з рядка браузера (починається з ' + REDIRECT + '?apptoken=...)')
console.log('   і встав сюди, потім Enter.\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = () =>
  rl.question('Адреса: ', (answer) => {
    const info = fromUrl(answer)
    if (info) {
      rl.close()
      finish(info)
    } else {
      console.log('Не бачу apptoken і cname в цій адресі. Скопіюй її повністю й спробуй ще раз.')
      ask()
    }
  })
ask()
