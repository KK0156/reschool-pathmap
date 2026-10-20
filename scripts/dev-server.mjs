import http from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import handler from '../netlify/functions/path-consult.js';
import treeHandler from '../netlify/functions/generate-tree.js';
import proposalHandler from '../netlify/functions/deepen-tree.js';
const base=resolve('.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PATH_MAP_PORT||process.env.PORT||8000);
if(!Number.isInteger(port)||port<1||port>65535){console.error('ポート番号は1〜65535で指定してください。例: PATH_MAP_PORT=8003 npm start');process.exit(1);}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(process.env.PATH_MAP_OFFLINE==='1'&&url.pathname.startsWith('/.netlify/functions/')){res.writeHead(req.method==='GET'?200:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(req.method==='GET'?{configured:false}:{error:'ローカル検証中のためAIとの接続は未設定です。代わりにサンプルで確認できます。'}));return;}
  if(['/.netlify/functions/path-consult','/.netlify/functions/generate-tree','/.netlify/functions/deepen-tree'].includes(url.pathname)){
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await (url.pathname.endsWith('/generate-tree')?treeHandler:url.pathname.endsWith('/deepen-tree')?proposalHandler:handler)(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const decoded=decodeURIComponent(url.pathname);
  if(decoded.split('/').some(part=>part.startsWith('.'))){res.writeHead(403);res.end('Forbidden');return;}
  const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const path=resolve(base,'.'+decodeURIComponent(pathname));
  if(!path.startsWith(base+'/')){res.writeHead(403);res.end();return;}
  const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.on('error',error=>{if(error.code==='EADDRINUSE')console.error(`ポート${port}は既に使われています。起動済みのプレビューを開くか、別の番号で起動してください。\n例: PATH_MAP_OFFLINE=1 PATH_MAP_PORT=${port<65535?port+1:8003} npm start\nCodespacesでは「Ports」からその番号の「ブラウザーで開く」を押してください。`);else console.error('サーバーを起動できませんでした: '+error.code);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>console.log(`RE:Tree: http://localhost:${port}\nCodespacesでは「Ports」→「${port}」→「ブラウザーで開く」。このターミナルは開いたままにしてください。`));
