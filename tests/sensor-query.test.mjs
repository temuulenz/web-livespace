import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/lib/db.mjs';
import { seedDemoCafes } from '../server/seed.mjs';
import { latestSensorReadingsSql } from '../server/lib/sensor-latest.mjs';

test('indexed latest readings preserve the old view semantics across replay, sources, reassignment and revocation',()=>{
 const db=openDatabase(':memory:');
 try {
  seedDemoCafes(db);
  const device=db.prepare('INSERT INTO devices(id,cafe_id,kind,is_test,token_hash,created_at) VALUES(?,?,?,?,?,?)');
  for(const [id,cafe,kind,isTest]of [['real','A','sensor',0],['sim','A','simulator',1],['moved','B','sensor',0],['revoked','A','sensor',0]])device.run(id,cafe,kind,isTest,'test-hash-only',new Date().toISOString());
  const add=db.prepare("INSERT INTO measurements(cafe_id,device_id,ts,received_at,is_test,raw,message_id,data_source,observed_people) VALUES(?,?,?,?,?,'{}',?,?,?)");
  for(let i=0;i<1000;i++)add.run('A','real',new Date(Date.now()-100000+i*10).toISOString(),new Date().toISOString(),0,'real-'+i,'real',i%11);
  const now=new Date().toISOString();
  add.run('A','real',now,now,0,'newest','real',5);
  add.run('A','real','2026-01-01T00:00:00.000Z',now,0,'delayed-replay','real',99);
  add.run('A','sim',now,now,1,'sim','simulated',8);
  add.run('A','moved',now,now,0,'moved','real',50);
  add.run('A','revoked',now,now,0,'revoked','real',50);
  db.prepare("UPDATE devices SET revoked_at=? WHERE id='revoked'").run(now);
  const original=`SELECT m.id,m.message_id,m.observed_people FROM sensor_latest_readings m JOIN devices d ON d.id=m.device_id AND d.cafe_id=m.cafe_id WHERE m.cafe_id=? AND m.data_source=? AND d.revoked_at IS NULL AND m.data_source=CASE WHEN d.is_test=1 OR d.kind='simulator' THEN 'simulated' ELSE 'real' END ORDER BY m.ts DESC,m.id DESC`;
  for(const source of ['real','simulated'])assert.deepEqual(db.prepare(latestSensorReadingsSql).all(source,'A',source).map(r=>({id:r.id,message_id:r.message_id,observed_people:r.observed_people})),db.prepare(original).all('A',source).map(r=>({...r})));
  const plan=db.prepare('EXPLAIN QUERY PLAN '+latestSensorReadingsSql).all('real','A','real').map(r=>r.detail).join('\n');
  assert.match(plan,/measurements_sensor_latest/);assert.ok(!plan.includes('CO-ROUTINE'),'public snapshot must not materialize the full window view');
 } finally {db.close();}
});
