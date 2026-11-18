// One stable connection per subscribed cafe for this tab, across hash navigation.
export function createBrowserRooms({cafeIds,onSnapshot,onStatus,fallback,WebSocketImpl=globalThis.WebSocket,doc=globalThis.document,origin=globalThis.location?.origin,random=Math.random}={}) {
 const rooms=new Map();let running=false,heartbeat;
 const status=()=>{const healthy=rooms.size>0&&[...rooms.values()].every(r=>r.healthy);if(healthy){fallback.stop();onStatus?.('live');}else if(running&&!doc?.hidden){fallback.start();onStatus?.('polling');}};
 function connect(id,r){if(!running||doc?.hidden)return;clearTimeout(r.timer);const url=new URL('/ws/browser/'+encodeURIComponent(id),origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';const ws=r.ws=new WebSocketImpl(url);r.healthy=false;r.pong=Date.now();
  ws.onmessage=event=>{if(ws!==r.ws)return;if(event.data==='pong'){r.pong=Date.now();return;}try{const value=JSON.parse(event.data);if(value.type==='service.unavailable'){r.delayUntil=Date.now()+Math.min(900,Number(value.retryAfter)||900)*1000;ws.close();return;}if(value.type!=='live.snapshot'||value.schemaVersion!==1||value.data?.id!==id||!Number.isSafeInteger(value.version))return;if(value.version>(r.version||0)){r.version=value.version;onSnapshot?.(value.data);}r.healthy=true;r.failures=0;status();}catch{}};
  ws.onclose=()=>{if(ws!==r.ws)return;r.ws=null;r.healthy=false;status();if(!running||doc?.hidden)return;const delay=Math.max((r.delayUntil||0)-Date.now(),Math.min(60000,1000*2**Math.min(r.failures++,6))*(0.5+random()));r.timer=setTimeout(()=>connect(id,r),delay);};ws.onerror=()=>ws.close();
 }
 function suspend(){clearInterval(heartbeat);for(const r of rooms.values()){clearTimeout(r.timer);const ws=r.ws;r.ws=null;r.healthy=false;ws?.close();}fallback.stop();}
 function resume(){if(!running||doc?.hidden)return;for(const [id,r]of rooms){r.version=0;connect(id,r);}status();clearInterval(heartbeat);heartbeat=setInterval(()=>{for(const r of rooms.values()){if(r.ws?.readyState===1){if(Date.now()-r.pong>90000)r.ws.close();else r.ws.send('ping');}}},30000);}
 const visibility=()=>{if(doc.hidden){suspend();onStatus?.('paused');}else resume();};
 return {start(){if(running)return;running=true;for(const id of new Set(cafeIds))rooms.set(id,{healthy:false,failures:0});doc?.addEventListener('visibilitychange',visibility);resume();},stop(){running=false;suspend();rooms.clear();doc?.removeEventListener('visibilitychange',visibility);},refresh(){fallback.refresh();}};
}
