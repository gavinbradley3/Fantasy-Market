import { readFileSync, realpathSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { controlledBetaSchema } from '@/contracts/controlledBeta';

const types: Record<string,string> = { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };

/** Local-only diagnostic surface. It never reads a database or a serving data directory. */
export function createControlledBetaPreview(options:{artifactPath:string;buildDirectory:string;log?:(path:string,status:number)=>void}) {
  const build = realpathSync(resolve(options.buildDirectory));
  const artifactPath=realpathSync(resolve(options.artifactPath));
  if(artifactPath===build||artifactPath.startsWith(`${build}${sep}`)) throw Error('Keep the private artifact outside the public build');
  const artifact=controlledBetaSchema.parse(JSON.parse(readFileSync(artifactPath,'utf8')));
  const body=Buffer.from(JSON.stringify(artifact));
  const index=readFileSync(resolve(build,'index.html'));
  return createServer((request:IncomingMessage,response:ServerResponse)=>{
    const send=(status:number,content:Buffer|string,contentType='text/plain')=>{
      response.writeHead(status,{
        'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      response.end(request.method==='HEAD'?undefined:content);
      options.log?.(request.url??'/',status);
    };
    // Loopback binding plus host validation prevents accidentally exposing the data via DNS rebinding.
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host??'')) return send(403,'Local preview only');
    if(request.method!=='GET'&&request.method!=='HEAD')return send(405,'Read-only preview');
    let path:string;
    try{path=decodeURIComponent(new URL(request.url??'/', 'http://127.0.0.1').pathname);}catch{return send(400,'Invalid path');}
    if(path==='/__controlled-beta/evaluation.json')return send(200,body,'application/json');
    if(path==='/'||path==='/controlled-beta'||path==='/controlled-beta/')return send(200,index,'text/html');
    // No SPA fallback for /data, /api, or other application routes. Private capture files are
    // never under this root. Only fingerprinted build assets are readable.
    if(path!=='/favicon.svg'&&!/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path))return send(404,'Not available in controlled preview');
    try{
      const file=realpathSync(resolve(build,`.${path}`));
      const allowed=path==='/favicon.svg'?file===resolve(build,'favicon.svg'):file.startsWith(`${resolve(build,'assets')}${sep}`);
      if(!allowed||!types[extname(file)])return send(404,'Not available');
      return send(200,readFileSync(file),types[extname(file)]);
    }catch{return send(404,'Not available');}
  });
}
