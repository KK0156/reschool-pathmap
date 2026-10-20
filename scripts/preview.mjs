import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const mediaType = value => {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) && mime.length <= 80 ? mime : '-';
};

export function candidatePorts(value) {
  if (value !== undefined && (typeof value !== 'string' || !/^\d{1,5}$/.test(value))) throw new Error('port');
  const first = value === undefined ? 8001 : Number(value);
  if (!Number.isInteger(first) || first < 1 || first > 65535) throw new Error('port');
  return Array.from({length: Math.min(10, 65536 - first)}, (_, index) => first + index);
}

export function forwardedURL(port, environment = process.env) {
  const name = environment.CODESPACE_NAME;
  const domain = environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length + String(port).length + 1 > 63 ||
      domain !== 'app.github.dev') return null;
  return `https://${name}-${port}.${domain}`;
}

// Only loopback GETs are permitted. Do not follow redirects or print response
// bodies, arbitrary headers, cookies, server errors, environment values or drafts.
export function inspect(port, path, timeout = 700) {
  return new Promise(resolveResult => {
    let settled = false, status = 0, mime = '-', bytes = 0, chunks = [];
    const finish = body => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({status, mime, bytes, body});
    };
    const request = http.get({hostname: '127.0.0.1', port, path, agent: false}, response => {
      status = response.statusCode || 0;
      mime = mediaType(response.headers['content-type']);
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) {
          finish(null);
          request.destroy();
        } else chunks.push(chunk);
      });
      response.on('end', () => finish(Buffer.concat(chunks)));
      response.on('error', () => finish(null));
    });
    const timer = setTimeout(() => {finish(null);request.destroy();}, timeout);
    request.on('error', () => finish(null));
  });
}

function attribute(tag, name) {
  const pattern = new RegExp('\\b' + name + '\\s*=\\s*([\\x22\\x27])([^]*?)\\1', 'i');
  return pattern.exec(tag)?.[2];
}

async function manifest() {
  const index = await readFile(resolve(projectRoot, 'index.html'));
  const html = index.toString('utf8');
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  const links = html.match(/<link\b[^>]*>/gi) || [];
  const bootstrap = scripts.map(tag => attribute(tag, 'src')).find(path => path?.split('?')[0] === '/src/bootstrap.js');
  const stylesheet = links.filter(tag => attribute(tag, 'rel') === 'stylesheet').map(tag => attribute(tag, 'href'))
    .find(path => /^\/src\/[a-z0-9_-]+\.css(?:\?[^\s]*)?$/.test(path || ''));
  if (!index.length || !bootstrap || !stylesheet) throw new Error('manifest');
  const result = [{path: '/', kind: 'html', content: index}, {path: '/index.html', kind: 'html', content: index}];
  for (const [path, kind] of [[bootstrap, 'js'], ['/src/desk-app.js', 'js'], [stylesheet, 'css']]) {
    result.push({path, kind, content: await readFile(resolve(projectRoot, '.' + path.split('?')[0]))});
  }
  return result;
}

function verified(file, result) {
  const mimeOK = file.kind === 'html' ? result.mime === 'text/html' : file.kind === 'css' ? result.mime === 'text/css' : ['text/javascript', 'application/javascript'].includes(result.mime);
  return result.status === 200 && !!result.body?.length && mimeOK && digest(result.body) === digest(file.content);
}

function launch(port) {
  const child = spawn(process.execPath, [resolve(projectRoot, 'scripts/dev-server.mjs')], {
    cwd: projectRoot,
    env: {...process.env, PATH_MAP_PORT: String(port), PATH_MAP_OFFLINE: '1'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const closed = new Promise(done => child.once('close', (code, signal) => done({code, signal})));
  const ready = new Promise((readyResult, reject) => {
    let stdout = '', stderr = '', settled = false;
    const finish = kind => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (kind) reject(Object.assign(new Error(kind), {kind})); else readyResult();
    };
    const timer = setTimeout(() => finish('startup'), 5000);
    child.stdout.on('data', data => {
      if (settled) return;
      stdout = (stdout + data.toString()).slice(0, 8192);
      if (stdout.includes(`RE:Tree: http://localhost:${port}\n`)) finish();
    });
    child.stderr.on('data', data => {if (!settled) stderr = (stderr + data.toString()).slice(0, 8192);});
    child.once('error', () => finish('startup'));
    closed.then(() => finish(stderr.includes(`ポート${port}は既に使われています。`) ? 'occupied' : 'startup'));
  });
  return {child, ready, closed};
}

async function stop(run) {
  if (!run || run.child.exitCode !== null || run.child.signalCode !== null) return;
  const timer = setTimeout(() => run.child.kill('SIGKILL'), 1000);
  timer.unref();
  run.child.kill('SIGTERM');
  await run.closed;
  clearTimeout(timer);
}

async function main() {
  let ports;
  try {ports = candidatePorts(process.env.PATH_MAP_PREVIEW_PORT);} catch {
    console.error('PATH_MAP_PREVIEW_PORTは1〜65535の整数で指定してください。');
    process.exitCode = 1;return;
  }
  let files;
  try {files = await manifest();} catch {
    console.error('このプロジェクトの起動用HTML・JS・CSSを確認できませんでした。');
    process.exitCode = 1;return;
  }
  let active = null, stopping = false;
  const shutdown = signal => {
    stopping = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    void stop(active);
  };
  process.once('SIGINT', shutdown);process.once('SIGTERM', shutdown);
  try {
    let existingAvailable = false, existingRootMatches = false, existingAllMatch = true;
    for (const file of files.filter(item => item.path !== '/index.html')) {
      const result = await inspect(8000, file.path);
      const matches = !!result.body && digest(result.body) === digest(file.content);
      if (file.path === '/') {existingAvailable = result.status !== 0;existingRootMatches = verified(file, result);}
      existingAllMatch &&= verified(file, result);
      console.log(`8000 ${file.path.split('?')[0]}: HTTP ${result.status || '-'} / MIME ${result.mime} / ${result.bytes} bytes / この版とSHA256一致: ${matches ? 'はい' : 'いいえ'}`);
      if (stopping) return;
      if (!result.status) break;
    }
    console.log(!existingAvailable ? '8000番には接続できませんでした。別ポートで確認します。'
      : !existingRootMatches ? '8000番の配信内容は手元の版と異なります。'
      : !existingAllMatch ? '8000番のHTMLは一致しましたが、起動に必要な資源の配信内容は異なります。'
      : '8000番の配信内容は手元の版と一致しました。認証・転送・ブラウザ表示は別途確認が必要です。');
    for (const port of ports) {
      if (stopping) return;
      active = launch(port);
      try {
        await active.ready;
        for (const file of files) {
          const result = await inspect(port, file.path);
          if (!verified(file, result)) throw new Error('verification');
        }
        if (active.child.exitCode !== null || active.child.signalCode !== null || stopping) throw new Error('stopped');
        console.log('検証完了: HTML本文・起動JS・画面JS・CSSがこのプロジェクトと一致しました。');
        console.log('AIへの通信を止めたローカルプレビューです。');
        console.log('開く: ' + (forwardedURL(port) || `http://localhost:${port}`));
        console.log('このターミナルを開いたままにしてください。終了するときはCtrl+Cを押します。');
        const result = await active.closed;
        if (!stopping) process.exitCode = result.code === 0 ? 0 : 1;
        return;
      } catch (error) {
        await stop(active);active = null;
        if (stopping) return;
        if (error.kind === 'occupied') {
          console.log(`ポート${port}は使用中です。次の候補を確認します。`);
          continue;
        }
        console.error('新しいプレビューの起動・配信を確認できませんでした。自分で起動したプロセスを終了しました。');
        process.exitCode = 1;return;
      }
    }
    console.error('候補のポートはすべて使用中でした。PATH_MAP_PREVIEW_PORTで別の開始番号を指定してください。');
    process.exitCode = 1;
  } finally {
    await stop(active);
    process.removeListener('SIGINT', shutdown);process.removeListener('SIGTERM', shutdown);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('ローカルプレビューを確認できませんでした。');
    process.exitCode = 1;
  });
}
