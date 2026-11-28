// 모든 게임을 한 번에 빌드해서, 배포 사이트와 똑같은 구조로 내 PC에서 보는 스크립트.
//   사용법:  node local-all.mjs              (전부 빌드 후 http://localhost:8080 에서 열기)
//            node local-all.mjs --skip-build (이미 빌드해 둔 결과만 다시 열기)
//            node local-all.mjs --only brawler,city   (일부만 빌드)
//            node local-all.mjs --port 9000
// 필요: Node.js 18 이상 (처음엔 폴더마다 npm install 을 자동으로 합니다)
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const SITE = join(ROOT, 'site')
const APP_BASE = '/angular_pc' // 배포 주소와 같은 경로 구조를 쓴다 (https://사용자.github.io/angular_pc/...)

// [배포 경로, 소스 폴더, 종류]  종류: root(루트 앱) | vite(빌드 필요) | html(단일 파일)
const TARGETS = [
  ['', '.', 'root'],
  ['3d', '3d-prototype', 'vite'],
  ['dating', 'dating-sim', 'vite'],
  ['sailing', 'sailing-sim', 'vite'],
  ['brawler', 'brawler', 'vite'],
  ['strategy', 'sengoku-strategy', 'vite'],
  ['island', 'island-life', 'vite'],
  ['city', 'city-builder', 'vite'],
  ['learn2d', 'learn-2d', 'html'],
  ['daughter', 'daughter-sim', 'vite'],
  ['learn3d', 'learn-3d', 'vite'],
  ['job', 'job-sim', 'vite'],
  ['robot', 'robot-sim', 'vite'],
  ['detective', 'detective-game', 'vite'],
  ['relay', 'last-relay', 'vite'],
  ['topview', 'topview-adventure', 'vite'],
  ['tunguska', 'tunguska', 'vite'],
  ['robotbuilder', 'robot-builder', 'vite'],
  ['todo', 'app-todo', 'html'],
  ['budget', 'app-budget', 'html'],
  ['timer', 'app-timer', 'html'],
]

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def }
const only = opt('--only', '') ? opt('--only', '').split(',') : null
const port = Number(opt('--port', '8080'))

function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true })
  return r.status === 0
}

if (!flag('--skip-build')) {
  const failed = []
  if (!only) rmSync(SITE, { recursive: true, force: true })
  for (const [path, dir, kind] of TARGETS) {
    if (only && !only.includes(path || 'root') && !only.includes(dir)) continue
    const src = join(ROOT, dir)
    const out = join(SITE, APP_BASE, path)
    console.log(`\n=== ${path || '던전 RPG(루트)'} (${dir}) ===`)
    if (only) rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    if (kind === 'html') {
      cpSync(join(src, 'index.html'), join(out, 'index.html'))
      continue
    }
    if (!existsSync(join(src, 'node_modules')) && !run('npm install', src)) { failed.push(dir); continue }
    const base = `${APP_BASE}/${path ? path + '/' : ''}`
    if (!run(`npm run build -- --base=${base}`, src)) { failed.push(dir); continue }
    cpSync(join(src, 'dist'), out, { recursive: true })
    rmSync(join(src, 'dist'), { recursive: true, force: true })
  }
  // 게임 목록 페이지: http://localhost:포트/ 에서 모든 게임으로 이동
  mkdirSync(SITE, { recursive: true })
  cpSync(join(ROOT, 'local-site', 'list.html'), join(SITE, 'index.html'))
  if (failed.length) console.log(`\n⚠ 빌드에 실패한 폴더: ${failed.join(', ')}`)
}

if (!existsSync(join(SITE, 'index.html'))) {
  console.error('site/ 폴더가 없습니다. --skip-build 없이 먼저 실행해 주세요.')
  process.exit(1)
}

// 아주 작은 정적 파일 서버 (추가 설치 없음)
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
}
createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = normalize(join(SITE, p))
    if (!file.startsWith(SITE)) { res.writeHead(403); return res.end('forbidden') }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end() }
      file = join(file, 'index.html')
    }
    if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found') }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(readFileSync(file))
  } catch {
    res.writeHead(500); res.end('error')
  }
}).listen(port, () => {
  console.log(`\n✅ 준비 완료!  게임 목록: http://localhost:${port}/`)
  console.log(`   던전 RPG: http://localhost:${port}${APP_BASE}/   횡스크롤: http://localhost:${port}${APP_BASE}/brawler/`)
  console.log('   종료: Ctrl+C')
})
void writeFileSync
