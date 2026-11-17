// Synthetic bounded-queue benchmark; no remote resources or delivery service.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {businessFixture,fail,id} from '../tests/support/business.mjs';
import {createNotifications} from '../shared/business/notifications.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
const f=businessFixture();let time=Date.now(),steps=0;
try{
 const initial=new Date(time).toISOString();
 f.db.exec('BEGIN');for(let i=0;i<100;i++)f.db.prepare("INSERT INTO notification_outbox VALUES(?,'a','review_submitted',?,NULL,?,?,NULL,0)").run('synthetic-drain-'+i,'synthetic-review-'+i,initial,initial);f.db.exec('COMMIT');
 const service=createNotifications({...f,fail,id,options:phase11Config(),clock:()=>new Date(time).toISOString()}),start=performance.now();
 while(steps<250&&f.db.prepare('SELECT count(*) n FROM notification_outbox WHERE processed_at IS NULL').get().n){time+=1001;await service.maintenance();steps++;}
 const elapsed=performance.now()-start,delivered=f.db.prepare('SELECT count(*) n FROM notifications').get().n,pending=f.db.prepare('SELECT count(*) n FROM notification_outbox WHERE processed_at IS NULL').get().n;
 assert.equal(delivered,100);assert.equal(pending,0);assert.equal(f.db.prepare('SELECT sum(n) n FROM notification_budgets').get().n,100);
 const result={scope:'in_memory_synthetic_queue_not_hosted_delivery',events:100,recipients_per_event:1,maintenance_steps:steps,measured_service_processing_ms:elapsed,delivered,pending,node_timer_only_projection_seconds:steps*30,cloudflare_one_second_continuation_projection_seconds:steps,limitations:['clock is advanced explicitly','timer projections exclude contention and tenant scheduling','no provider delivery SLA','default recipient/day budget permits exactly 100 here']};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/phase11-notification-drain.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{f.db.close();}
