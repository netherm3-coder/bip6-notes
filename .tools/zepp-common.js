// Спільне для скриптів: де встановлено Zeus CLI, як він зберігає вхід.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

const STORE_FILE = path.join(os.homedir(), '.zepp', '.zeus')
const DEVICES_FILE = path.join(os.homedir(), '.zepp', '.zeus_devices')

function zeusDir() {
  try {
    const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dir = path.join(root, '@zeppos', 'zeus-cli')
    if (fs.existsSync(path.join(dir, 'bin', 'main.js'))) return dir
  } catch (e) {}
  return null
}

function loginConfig() {
  const cfg = {
    loginUrl: 'https://user.zepp.com/universalLogin/index.html#/login',
    projectName: 'zeppos_zeus_cli',
    platformApp: 'com.huami.webapp',
    keys: {
      token: '____user_zepp_com__token',
      userid: '____user_zepp_com__userid',
      cname: '____user_zepp_com__cname'
    }
  }
  const dir = zeusDir()
  if (!dir) return cfg
  try {
    const local = require(path.join(dir, 'private-modules/zeppos-app-utils/dist/config/project.js')).getLocalConfig()
    cfg.loginUrl = String(local.loginConfig.LOGIN_URL)
    cfg.projectName = local.loginConfig.PROJECT_NAME
    cfg.platformApp = local.loginConfig.PLATFORM_APP
    cfg.keys = {
      token: local.loginStorageKey.accountToken,
      userid: local.loginStorageKey.userid,
      cname: local.loginStorageKey.cname
    }
  } catch (e) {}
  return cfg
}

function readStore() {
  const data = {}
  if (fs.existsSync(STORE_FILE)) {
    fs.readFileSync(STORE_FILE, 'utf8')
      .split('\n')
      .forEach((line) => {
        const i = line.indexOf('=')
        if (i > 0) data[line.slice(0, i)] = line.slice(i + 1)
      })
  }
  return data
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
  fs.writeFileSync(
    STORE_FILE,
    Object.keys(data)
      .map((k) => k + '=' + data[k])
      .join('\n')
  )
}

function isLoggedIn() {
  const { keys } = loginConfig()
  const s = readStore()
  return !!(s[keys.token] && s[keys.userid] && s[keys.cname])
}

// Назва пристрою в списку Zeus для deviceSource із app.json (після першого запуску).
function deviceNameFor(projectDir) {
  try {
    const app = JSON.parse(fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8'))
    const sources = []
    Object.values(app.targets || {}).forEach((t) =>
      (t.platforms || []).forEach((p) => p.deviceSource && sources.push(Number(p.deviceSource)))
    )
    const cache = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'))
    const hit = (cache.devices || []).find((d) => d && sources.includes(Number(d.deviceSource)))
    return hit && hit.productName ? String(hit.productName) : ''
  } catch (e) {
    return ''
  }
}

module.exports = { zeusDir, loginConfig, readStore, writeStore, isLoggedIn, deviceNameFor, STORE_FILE }
