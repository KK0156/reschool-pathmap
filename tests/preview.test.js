import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {candidatePorts, forwardedURL, inspect} from '../scripts/preview.mjs';

const source = await readFile(new URL('../scripts/preview.mjs', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const listen = async (server, port = 0) => {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const close = async server => {
  server.closeAllConnections?.();
  if (server.listening) await new Promise(done => server.close(done));
};
const freePort = async () => {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  return port;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));

async function fixture(t, mode = 'normal') {
  const root = await mkdtemp(join(tmpdir(), 'reschool-preview-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'scripts'));await mkdir(join(root, 'src'));
  await writeFile(join(root, 'scripts/preview.mjs'), source);
  await writeFile(join(root, 'index.html'), '<!doctype html><html><head><script type=module src="/src/bootstrap.js?v=test"></script><link rel="stylesheet" href="/src/test.css?v=test"></head><body>fixture only</body></html>');
  await writeFile(join(root, 'src/bootstrap.js'), 'export const fixtureStartup = true;');
  await writeFile(join(root, 'src/desk-app.js'), 'export const fixtureApplication = true;');
  await writeFile(join(root, 'src/test.css'), 'body{color:#17283c}');
  await writeFile(join(root, 'saved-draft.txt'), 'DO_NOT_LOG_SAVED_DRAFT');
  const server = `
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const port=Number(process.env.PATH_MAP_PORT);
const mode=${JSON.stringify(mode)};
if(mode==='startup-error'){console.error('EACCES: DO_NOT_LOG_CHILD_ERROR');process.exit(1);}
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/.netlify/functions/generate-tree'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({configured:process.env.PATH_MAP_OFFLINE!=='1'}));return;}
 const file=path==='/'?'/index.html':path;
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
 try{
  const body=await readFile(resolve('.','.'+file));
  res.writeHead(200,{'Content-Type':mode==='bad-js-mime'&&file==='/src/bootstrap.js'?'text/html':types[extname(file)]||'text/plain'});
  res.end(mode==='wrong-html'&&file==='/index.html'?'WRONG_FIXTURE_HTML':body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'ポート'+port+'は既に使われています。':'DO_NOT_LOG_CHILD_ERROR');process.exitCode=1;});
server.listen(port,'0.0.0.0',async()=>{await writeFile('child.pid',String(process.pid));console.log('RE:Tree: http://localhost:'+port+'\\nfixture ready');console.log('DO_NOT_LOG_CHILD_OUTPUT');});
`;
  await writeFile(join(root, 'scripts/dev-server.mjs'), server);
  return root;
}

function launch(t, root, port, extra = {}) {
  const child = spawn(process.execPath, [join(root, 'scripts/preview.mjs')], {
    cwd: tmpdir(),
    env: {...process.env, CODESPACE_NAME: '', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: '', PATH_MAP_OFFLINE: '0', PATH_MAP_PREVIEW_PORT: String(port), ...extra},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => {output += data;});
  child.stderr.on('data', data => {output += data;});
  const closed = new Promise(done => child.once('close', (code, signal) => done({code, signal})));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await closed;
  });
  return {child, closed, output: () => output};
}
async function ready(run) {
  const end = Date.now() + 10000;
  while (!run.output().includes('開く: ')) {
    if (run.child.exitCode !== null || run.child.signalCode !== null) throw new Error('Preview exited before verified readiness: ' + run.output());
    if (Date.now() > end) throw new Error('Preview readiness timed out');
    await sleep(20);
  }
}
const hasURL = text => /https?:\/\//.test(text);
const alive = pid => {try {process.kill(pid, 0);return true;} catch {return false;}};

async function stopAndCheck(run, root, port) {
  const pid = Number(await readFile(join(root, 'child.pid'), 'utf8'));
  assert.ok(alive(pid), 'the verified child must be running');
  run.child.kill('SIGTERM');
  const result = await run.closed;
  assert.equal(result.code, 143);
  assert.equal(alive(pid), false, 'only the preview-owned child is stopped');
  assert.equal((await inspect(port, '/')).status, 0);
}

test('port candidates are bounded integers and Codespaces URLs accept only valid real forwarding inputs', () => {
  assert.deepEqual(candidatePorts(), [8001,8002,8003,8004,8005,8006,8007,8008,8009,8010]);
  assert.deepEqual(candidatePorts('65535'), [65535]);
  assert.equal(candidatePorts('41000').at(-1), 41009);
  for (const value of ['', '0', '65536', '-1', '8001.5', ' 8001', '1e4', '8001\n']) assert.throws(() => candidatePorts(value));
  const environment = {CODESPACE_NAME:'gentle-field-abc123',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'};
  assert.equal(forwardedURL(8111, environment), 'https://gentle-field-abc123-8111.app.github.dev');
  for (const name of ['', '-prefix', 'suffix-', 'A-CAPITAL', 'x/y', 'x?token=fixture', 'a'.repeat(63)]) assert.equal(forwardedURL(8111,{...environment,CODESPACE_NAME:name}),null);
  for (const domain of ['', 'https://app.github.dev', 'app.github.dev:80', 'evil.example', 'app.github.dev.evil.example', 'app.github.dev/path']) assert.equal(forwardedURL(8111,{...environment,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:domain}),null);
  assert.equal(forwardedURL(0, environment),null);
});

test('verified preview ignores caller cwd, forces offline, and stops its own child without killing existing 8000', {timeout:20000}, async t => {
  let oldServer = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Set-Cookie':'DO_NOT_LOG_COOKIE'});res.end('DO_NOT_LOG_EXISTING_BODY');});
  try {await listen(oldServer,8000);} catch(error) {
    if(error.code!=='EADDRINUSE')throw error;
    oldServer=null;
  }
  if(oldServer)t.after(()=>close(oldServer));
  const before = await inspect(8000,'/');
  const root = await fixture(t), port = await freePort(), run = launch(t,root,port);
  await ready(run);
  assert.ok(run.output().includes('検証完了'));
  assert.ok(run.output().includes('開く: http://localhost:'+port));
  assert.ok(!run.output().includes('DO_NOT_LOG'), 'bodies, cookies, child logs and saved drafts must remain private');
  const response = await fetch('http://127.0.0.1:'+port+'/.netlify/functions/generate-tree');
  assert.deepEqual(await response.json(), {configured:false});
  await stopAndCheck(run,root,port);
  const after = await inspect(8000,'/');
  assert.equal(after.status,before.status, 'the existing 8000 service is untouched');
  if(oldServer&&before.body&&after.body)assert.ok(hash(before.body)===hash(after.body),'the fixture response remains unchanged');
  if(oldServer)assert.equal(oldServer.listening,true);
});

test('only an occupied candidate is skipped and its existing process remains alive', {timeout:20000}, async t => {
  let occupied, port;
  for(let attempt=0;attempt<20;attempt++){
    occupied=http.createServer((req,res)=>res.end('unrelated service'));
    port=await listen(occupied);
    if(port>65526){await close(occupied);continue;}
    const next=net.createServer();
    try {await listen(next,port+1);await close(next);break;} catch {await close(occupied);occupied=null;}
  }
  assert.ok(occupied);t.after(()=>close(occupied));
  const root=await fixture(t),run=launch(t,root,port);
  await ready(run);
  assert.ok(run.output().includes('ポート'+port+'は使用中'));
  assert.ok(run.output().includes('開く: http://localhost:'+(port+1)));
  assert.equal(await (await fetch('http://127.0.0.1:'+port)).text(),'unrelated service');
  await stopAndCheck(run,root,port+1);
  assert.equal(occupied.listening,true);
});

test('HTML or startup MIME verification failure stops the owned child and prints no ready URL', {timeout:20000}, async t => {
  for(const mode of ['wrong-html','bad-js-mime']){
    const root=await fixture(t,mode),port=await freePort(),run=launch(t,root,port);
    const result=await run.closed;
    assert.equal(result.code,1);
    assert.equal(hasURL(run.output()),false);
    assert.ok(!run.output().includes('DO_NOT_LOG'));
    assert.ok(run.output().includes('起動・配信を確認できませんでした'));
    assert.equal((await inspect(port,'/')).status,0);
    const pid=Number(await readFile(join(root,'child.pid'),'utf8'));
    assert.equal(alive(pid),false);
  }
});

test('non-occupancy startup failures do not try another candidate or reveal child errors', {timeout:15000}, async t => {
  const root=await fixture(t,'startup-error'),port=await freePort(),run=launch(t,root,port);
  const result=await run.closed;
  assert.equal(result.code,1);
  assert.equal(hasURL(run.output()),false);
  assert.ok(!run.output().includes('次の候補'));
  assert.ok(!run.output().includes('DO_NOT_LOG'));
});

test('invalid starting ports are rejected without echoing hostile values', {timeout:10000}, async t => {
  const root=await fixture(t),run=launch(t,root,'8001\nDO_NOT_LOG_ENV');
  const result=await run.closed;
  assert.equal(result.code,1);
  assert.ok(run.output().includes('1〜65535'));
  assert.equal(hasURL(run.output()),false);
  assert.ok(!run.output().includes('DO_NOT_LOG'));
});
