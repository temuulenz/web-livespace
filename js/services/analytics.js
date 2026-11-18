// Prepared only; no application events are wired until Phase 11 approval.
import {ANALYTICS_TYPES} from './analytics-schema.js';
export function createAnalyticsCollector({enabled=false,send,clock=()=>new Date().toISOString(),id=()=>crypto.randomUUID(),schedule=setTimeout,cancel=clearTimeout}={}) {
 const queue=[];let timer,inflight=false,failures=0,stopped=false;
 async function flush(){if(!enabled||stopped||inflight||!queue.length)return;inflight=true;cancel(timer);timer=null;const cafe=queue[0].cafeId,batch=queue.filter(e=>e.cafeId===cafe).slice(0,32);
  try{await send({schemaVersion:1,cafeId:cafe,events:batch.map(({cafeId,...e})=>e)});for(const e of batch)queue.splice(queue.indexOf(e),1);failures=0;}
  catch{if(++failures>=2){queue.length=0;failures=0;}}finally{inflight=false;if(queue.length&&!stopped)timer=schedule(flush,60000);}}
 return {track(cafeId,type){if(!enabled||stopped||!ANALYTICS_TYPES.includes(type)||queue.length>=128)return false;queue.push({cafeId,id:id(),type,timestamp:clock()});if(!timer&&!inflight)timer=schedule(flush,5000);return true;},flush,stop(){stopped=true;cancel(timer);queue.length=0;},get pending(){return queue.length;}};
}
