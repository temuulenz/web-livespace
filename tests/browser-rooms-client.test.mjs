import {test} from 'node:test';import assert from 'node:assert/strict';
import {createBrowserRooms} from '../framework/api/browser-realtime.js';
test('one socket per cafe, healthy snapshots stop polling and hidden tabs close connections',()=>{
 const sockets=[];class Socket{constructor(url){this.url=url;sockets.push(this);}close(){this.onclose?.();}}
 const listeners=new Map(),doc={hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 let polls=0,stops=0,updates=0;const channel=createBrowserRooms({origin:'https://local',doc,WebSocketImpl:Socket,cafeIds:['a','a'],fallback:{start(){polls++;},stop(){stops++;},refresh(){}},onSnapshot(){updates++;}});
 channel.start();channel.start();assert.equal(sockets.length,1);assert.ok(polls>0);
 sockets[0].onmessage({data:JSON.stringify({type:'live.snapshot',schemaVersion:1,version:1,data:{id:'b'}})});assert.equal(updates,0);
 sockets[0].onmessage({data:JSON.stringify({type:'live.snapshot',schemaVersion:1,version:1,data:{id:'a'}})});assert.equal(updates,1);assert.ok(stops>0);
 doc.hidden=true;listeners.get('visibilitychange')();doc.hidden=false;listeners.get('visibilitychange')();assert.equal(sockets.length,2);channel.stop();assert.equal(listeners.size,0);
});

test('reconnect recovers missed snapshots and ignores duplicate versions',async()=>{
 const sockets=[];class Socket{constructor(){sockets.push(this);}close(){this.onclose?.();}}
 const values=[];const channel=createBrowserRooms({origin:'https://local',WebSocketImpl:Socket,cafeIds:['a'],random:()=>0,fallback:{start(){},stop(){},refresh(){}},onSnapshot:v=>values.push(v.live)});
 const snapshot=(socket,version,live)=>socket.onmessage({data:JSON.stringify({type:'live.snapshot',schemaVersion:1,version,data:{id:'a',live}})});
 try{channel.start();snapshot(sockets[0],1,'old');snapshot(sockets[0],1,'duplicate');sockets[0].close();await new Promise(resolve=>setTimeout(resolve,550));assert.equal(sockets.length,2);snapshot(sockets[1],3,'recovered');snapshot(sockets[0],4,'late old socket');assert.deepEqual(values,['old','recovered']);}finally{channel.stop();}
});
