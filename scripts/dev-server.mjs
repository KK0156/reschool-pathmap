import http from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import handler from '../netlify/functions/path-consult.js';
import treeHandler from '../netlify/functions/generate-tree.js';
const base=resolve('.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(process.env.PATH_MAP_OFFLINE==='1'&&url.pathname.startsWith('/.netlify/functions/')){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'ローカル検証中のためAIとの接続は未設定です。代わりにサンプルで確認できます。'}));return;}
  if(['/.netlify/functions/path-consult','/.netlify/functions/generate-tree'].includes(url.pathname)){
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await (url.pathname.endsWith('/generate-tree')?treeHandler:handler)(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const path=resolve(base,'.'+decodeURIComponent(pathname));
  if(!path.startsWith(base+'/')){res.writeHead(403);res.end();return;}
  const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
}).listen(Number(process.env.PATH_MAP_PORT||8000),()=>console.log('RE:School: http://localhost:'+ (process.env.PATH_MAP_PORT||8000)));
