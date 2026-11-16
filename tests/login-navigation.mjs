import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer,ADMIN } from './support/server.mjs';
import { startBrowser } from './support/browser.mjs';
import { verifyLoginClicks, verifyOutageRecovery } from './support/login-clicks.mjs';
let source,server,browser;
const baseline=process.env.LOGIN_BASELINE;
try {
 if(baseline){
  if(!/^[a-f0-9]{7,40}$/.test(baseline))throw Error('LOGIN_BASELINE must be a commit ID');
  source=await mkdtemp(join(tmpdir(),'livespace-auth-parent-'));
  const archive=execFileSync('git',['archive','--format=tar',baseline,'index.html','app.js','styles.css','logo.webp','js','styles','framework'],{maxBuffer:32*1024*1024});
  execFileSync('tar',['-x','-C',source],{input:archive});
 }
 server=await startServer(source?{staticDir:source}:{});browser=await startBrowser();
 if(!baseline)await verifyOutageRecovery(browser,{origin:server.origin,credentials:ADMIN});
 await verifyLoginClicks(browser,{origin:server.origin,credentials:ADMIN,tour:baseline!=='7c300aa'});
} finally {await browser?.close();await server?.stop();if(source)await rm(source,{recursive:true,force:true});}
