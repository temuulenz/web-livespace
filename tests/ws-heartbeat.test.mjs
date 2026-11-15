import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { runSimulator, simulatorOptions } from '../scripts/sensor-simulator.mjs';

test('missing protocol pong reconnects and replays the unchanged committed envelope', {timeout:10000}, async () => {
 const server=new WebSocketServer({host:'127.0.0.1',port:0,autoPong:false});await once(server,'listening');
 let connections=0;const frames=[],receipts=new Set(),events=[];
 server.on('connection',ws=>{
  const connection=++connections;
  ws.send(JSON.stringify({type:'sensor.ready',schemaVersion:1,deviceId:'heartbeat-test',locationId:'A',dataSource:'simulated',maxPayloadBytes:16384}));
  // First connection deliberately loses pong and ACK. Subsequent connections
  // reply with control pongs, just as Cloudflare does without a JS callback.
  if(connection>1)ws.on('ping',payload=>ws.pong(payload));
  ws.on('message',buffer=>{
   const value=JSON.parse(buffer);frames.push(value);const duplicate=receipts.has(value.messageId);receipts.add(value.messageId);
   if(connection>1)ws.send(JSON.stringify({type:'sensor.ack',messageId:value.messageId,status:duplicate?'duplicate':'accepted',serverTimestamp:'2026-11-16T00:00:00.000Z'}));
  });
 });
 try {
  const options=simulatorOptions(['--url',`ws://127.0.0.1:${server.address().port}/ws/sensors`,'--device','heartbeat-test','--location','A','--count','1','--heartbeat-ms','50','--reconnect-ms','10'],{LS_SENSOR_TOKEN:'lsd_test'});
  const result=await runSimulator(options,{log:x=>events.push(x)});
  assert.equal(result.sent,1);assert.ok(connections>=2);assert.ok(events.some(x=>x.event==='heartbeat_timeout'));
  assert.equal(receipts.size,1);assert.ok(frames.length>=2);assert.deepEqual(frames[0],frames.at(-1));assert.equal(frames[0].schemaVersion,1);
 } finally {for(const ws of server.clients)ws.terminate();await new Promise(r=>server.close(r));}
});

test('production simulator defaults preserve 30-second protocol heartbeat and use 15-second telemetry',()=>{
 const options=simulatorOptions(['--device','test','--location','I'],{LS_SENSOR_TOKEN:'lsd_test'});
 assert.equal(options.interval,15000);assert.equal(options['heartbeat-ms'],30000);
});
