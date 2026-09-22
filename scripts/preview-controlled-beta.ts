import { resolve } from 'node:path';
import { createControlledBetaPreview } from '@/ops/controlledBetaPreview';

const args=process.argv.slice(2);
if(args.length!==2&&args.length!==4)throw Error('Usage: preview-controlled-beta --artifact /absolute/evaluation.json [--port 4317]');
if(args[0]!=='--artifact'||!args[1]||(args.length===4&&args[2]!=='--port'))throw Error('Explicit --artifact and optional --port only');
const port=args[3]===undefined?4317:Number(args[3]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('port must be 1024–65535');
const server=createControlledBetaPreview({artifactPath:resolve(args[1]),buildDirectory:resolve('dist'),log:(path,status)=>console.log(JSON.stringify({path,status}))});
server.listen(port,'127.0.0.1',()=>console.log(`Private preview: http://127.0.0.1:${port}/controlled-beta (loopback only; no publication)`));
process.on('SIGINT',()=>server.close());
process.on('SIGTERM',()=>server.close());
