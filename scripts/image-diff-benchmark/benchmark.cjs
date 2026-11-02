const fs = require('node:fs');
const os = require('node:os');
const {createRequire} = require('node:module');
const {performance,monitorEventLoopDelay} = require('node:perf_hooks');
const req=createRequire(require('node:path').resolve(__dirname,'../../packages/shared/package.json'));
const {imageDifference}=req('./dist/lib/img/index.js');
const sharp=req('sharp');
const dir=require('node:path').resolve('benchmark-results');fs.mkdirSync(dir,{recursive:true});
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {n:s.length,medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.ceil(s.length*.95)-1],maxMs:s.at(-1)}};
const scan=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>32)n++;return n;};
(async()=>{
const result={metadata:{date:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,cores:os.cpus().length,totalMemoryGiB:os.totalmem()/2**30,loadAverage:os.loadavg(),commit:'655520997',sharp:sharp.versions.sharp,threadpool:process.env.UV_THREADPOOL_SIZE||'default (4)'},rows:[],breakdown:[]};
const original=fs.readFileSync(require('node:path').join(__dirname,'before.jpeg'));
const changed=fs.readFileSync(require('node:path').join(__dirname,'after.jpeg'));
for(const [width,height] of [[390,844],[1440,900],[1920,1080],[3840,2160]]){
 const aBuf=await sharp(original).resize(width,height).jpeg({quality:90}).toBuffer();
 const bBuf=await sharp(changed).resize(width,height).jpeg({quality:90}).toBuffer();
 const samePixelsBuf=Buffer.concat([aBuf,Buffer.from('\n')]); // JPEG ignores trailing byte; defeats base64 shortcut
 const url=b=>'data:image/jpeg;base64,'+b.toString('base64');
 const a=url(aBuf),b=url(bBuf),same=url(samePixelsBuf);
 for(const [scenario,after,concurrencies] of [['identical-string',a,[1]],['identical-pixels-different-bytes',same,[1]],['changed',b,[1,10,...(width<=1920?[40]:[])] ]]){
  let check=await imageDifference(a,after);
  if(scenario!=='changed'&&check.changedPixels!==0)throw Error('invalid same-pixels fixture');
  for(const concurrency of concurrencies){
   for(let i=0;i<10;i++)await imageDifference(a,after);
   global.gc?.();const rssStart=process.memoryUsage().rss;let rssPeak=rssStart;
   const eventLoop=monitorEventLoopDelay({resolution:1});eventLoop.enable();
   const sample=setInterval(()=>rssPeak=Math.max(rssPeak,process.memoryUsage().rss),2);
   const times=[],batchTimes=[];const rounds=concurrency===1?200:20;
   const start=performance.now();
   for(let r=0;r<rounds;r++){
    const t=performance.now();await Promise.all(Array.from({length:concurrency},async()=>{const begin=performance.now();await imageDifference(a,after);times.push(performance.now()-begin);rssPeak=Math.max(rssPeak,process.memoryUsage().rss)}));batchTimes.push(performance.now()-t);
   }
   const wallMs=performance.now()-start;clearInterval(sample);eventLoop.disable();
   const row={width,height,scenario,concurrency,...stats(times),batch:stats(batchTimes),wallMs,operationsPerSecond:times.length/wallMs*1000,rssStartMiB:rssStart/2**20,rssPeakMiB:rssPeak/2**20,rssIncreaseMiB:(rssPeak-rssStart)/2**20,eventLoopP95Ms:eventLoop.percentile(95)/1e6,changedPixels:check.changedPixels,encodedBytes:[aBuf.length,bBuf.length]};
   result.rows.push(row);console.log(JSON.stringify(row));fs.writeFileSync(dir+'/results.json',JSON.stringify(result,null,2));
  }
 }
 const decode=async buf=>sharp(buf).ensureAlpha().raw().toBuffer();
 const [x,y]=await Promise.all([decode(aBuf),decode(bBuf)]);const decodeTimes=[],scanTimes=[];
 for(let i=0;i<100;i++){let t=performance.now();await Promise.all([decode(Buffer.from(a.split(',')[1],'base64')),decode(Buffer.from(b.split(',')[1],'base64'))]);decodeTimes.push(performance.now()-t);t=performance.now();scan(x,y);scanTimes.push(performance.now()-t)}
 result.breakdown.push({width,height,decodePair:stats(decodeTimes),scan:stats(scanTimes)});
 fs.writeFileSync(dir+'/results.json',JSON.stringify(result,null,2));
}
if(process.env.GITHUB_STEP_SUMMARY){
 const rows=result.rows.filter(r=>r.scenario==='changed');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`CPU: ${result.metadata.cpu}; cores: ${result.metadata.cores}; RAM: ${result.metadata.totalMemoryGiB.toFixed(1)} GiB; Node: ${process.version}\n\n| Resolution | Concurrency | Samples | Median ms | P95 ms | Max ms |\n|---|---:|---:|---:|---:|---:|\n`+rows.map(r=>`| ${r.width}x${r.height} | ${r.concurrency} | ${r.n} | ${r.medianMs.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} |`).join('\n')+'\n\nWarm Node/Sharp comparison only, includes decode and queueing; excludes screenshot capture and model calls. RSS is process-wide, not per-call memory.\n');
}
})();
