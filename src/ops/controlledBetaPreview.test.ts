import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {get} from 'node:http';
import {afterEach,describe,it,expect} from 'vitest';
import {controlledBetaFixture} from '@/test/controlledBetaFixture';
import {createControlledBetaPreview} from './controlledBetaPreview';

const temporary:string[]=[];
function fixture(){
  const root=mkdtempSync(resolve(tmpdir(),'pt-beta-preview-'));temporary.push(root);
  const build=resolve(root,'dist'),artifact=resolve(root,'evaluation.json');mkdirSync(resolve(build,'assets'),{recursive:true});
  writeFileSync(resolve(build,'index.html'),'<main>private controlled beta</main>');
  writeFileSync(resolve(build,'favicon.svg'),'<svg/>');
  writeFileSync(resolve(build,'assets/app-test.js'),'void 0');writeFileSync(artifact,JSON.stringify(controlledBetaFixture()));
  return{root,build,artifact};
}
afterEach(()=>{for(const path of temporary.splice(0))rmSync(path,{recursive:true,force:true});});
describe('loopback preview admission',()=>{
  it('serves sanitized artifact, never market/production/raw/private files or symlink escapes',async()=>{
    const f=fixture();writeFileSync(resolve(f.root,'secret.json'),'PRIVATE');symlinkSync(resolve(f.root,'secret.json'),resolve(f.build,'assets/leak.js'));
    const server=createControlledBetaPreview({artifactPath:f.artifact,buildDirectory:f.build});server.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try{
      const page=await fetch(`${base}/controlled-beta`);expect(page.status).toBe(200);expect(page.headers.get('cache-control')).toBe('no-store');
      expect((await (await fetch(`${base}/__controlled-beta/evaluation.json`)).json()).players[0].dynastyValue).toBeNull();
      expect((await fetch(`${base}/assets/app-test.js`)).status).toBe(200);
      expect((await fetch(`${base}/favicon.svg`)).status).toBe(200);
      for(const path of ['/data/market-latest.json','/data/board.json','/api/market','/api/publication','/secret.json','/assets/leak.js','/assets/%2e%2e%2fsecret.json','/board'])expect((await fetch(`${base}${path}`)).status).toBe(404);
      const badHost=await new Promise<number|undefined>((done,reject)=>{get(`${base}/controlled-beta`,{headers:{host:'attacker.example'}},r=>{r.resume();done(r.statusCode);}).on('error',reject);});
      expect(badHost).toBe(403);
      expect((await fetch(`${base}/controlled-beta`,{method:'POST'})).status).toBe(405);
    }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
  });
  it('rejects an artifact placed in the public build or carrying baseline numbers',()=>{
    const f=fixture();const publicPath=resolve(f.build,'evaluation.json');writeFileSync(publicPath,JSON.stringify(controlledBetaFixture()));
    expect(()=>createControlledBetaPreview({artifactPath:publicPath,buildDirectory:f.build})).toThrow(/outside/);
    const bad=controlledBetaFixture();Object.assign(bad.players[0],{dynastyValue:99});writeFileSync(f.artifact,JSON.stringify(bad));
    expect(()=>createControlledBetaPreview({artifactPath:f.artifact,buildDirectory:f.build})).toThrow();
  });
});
