import {businessCommon} from './common.mjs';
export const NOTIFICATION_CATEGORIES=['review_submitted','review_reply','inventory','promotion','promotion_expiry','sensor_offline','sensor_recovered','resource','moderation'];
export function createNotifications({sql,fail,id,options,clock=()=>new Date().toISOString()}){
 const c=businessCommon({sql,fail});
 async function active(user){c.user(user);const u=await sql.first('SELECT id FROM users WHERE id=? AND disabled_at IS NULL',user.id);if(!u)fail(401,'unauthorized','Current session required');}
 const service={
  async list(query={},user){await active(user);const page=c.page(query);const rows=await sql.all('SELECT id,cafe_id,category,entity_id,severity,created_at,read_at FROM notifications WHERE recipient_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?',user.id,page.limit+1,page.offset);return {items:rows.slice(0,page.limit),pagination:{...page,has_more:rows.length>page.limit},unread:(await sql.first('SELECT count(*) n FROM notifications WHERE recipient_id=? AND read_at IS NULL',user.id)).n};},
  async read(entity,user){await active(user);if(entity!==null&&!await sql.first('SELECT id FROM notifications WHERE recipient_id=? AND id=?',user.id,entity))fail(404,'not_found','Notification not found');await sql.batch([[`UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL${entity?' AND id=?':''}`,clock(),user.id,...(entity?[entity]:[])]]);return {read:true};},
  async preferences(user,input){await active(user);if(input!==undefined){c.object(input,NOTIFICATION_CATEGORIES);if(Object.values(input).some(v=>typeof v!=='boolean'))c.invalid('Expected boolean preferences');if(!Object.keys(input).length)c.invalid('No preferences');await sql.batch(Object.entries(input).map(([category,value])=>['INSERT INTO notification_preferences VALUES(?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET enabled=excluded.enabled',user.id,category,Number(value)]));}
   const rows=await sql.all('SELECT category,enabled FROM notification_preferences WHERE user_id=?',user.id);return {preferences:Object.fromEntries(NOTIFICATION_CATEGORIES.map(k=>[k,rows.find(r=>r.category===k)?.enabled===undefined?k!=='promotion':!!rows.find(r=>r.category===k).enabled]))};},
  async enqueueResource(key,level){const at=clock();await sql.batch([['INSERT OR IGNORE INTO notification_outbox VALUES(?,NULL,\'resource\',?,NULL,?,?,NULL,0)','resource:'+key+':'+level,key,at,at]]);},
  async maintenance(){
   const at=clock(),day=at.slice(0,10),expiry=new Date(Date.parse(at)+options.reminderHours*3600000).toISOString();
   // Durable timer candidates also cover pre-migration published promotions.
   await sql.batch([["INSERT OR IGNORE INTO notification_outbox SELECT 'expiry:'||id||':'||ends_at,cafe_id,'promotion_expiry',id,NULL,?,?,NULL,0 FROM promotions WHERE published=1 AND ends_at>? AND ends_at<=? ORDER BY ends_at LIMIT ?",at,at,at,expiry,options.batch],
    ["UPDATE devices SET connection_status='offline' WHERE id IN(SELECT id FROM devices WHERE enabled=1 AND revoked_at IS NULL AND connection_status<>'offline' AND last_seen_at<? ORDER BY last_seen_at LIMIT ?)",new Date(Date.parse(at)-options.offlineSec*1000).toISOString(),options.batch]]);
   const rows=await sql.all('SELECT * FROM notification_outbox WHERE processed_at IS NULL AND available_at<=? ORDER BY available_at,id LIMIT ?',at,1);
   let delivered=0;
   for(const event of rows){
    let recipients=[];
    if(event.category==='promotion'){
     if(!await sql.first("SELECT p.id FROM promotions p JOIN cafes c ON c.id=p.cafe_id WHERE p.id=? AND p.cafe_id=? AND p.published=1 AND p.starts_at<=? AND p.ends_at>? AND c.status='active'",event.entity_id,event.cafe_id,at,at)){await sql.batch([['UPDATE notification_outbox SET processed_at=? WHERE id=?',at,event.id]]);continue;}
     // Bounded SQL set fan-out; users explicitly opted in and favorited this cafe.
     recipients=await sql.all("SELECT u.id FROM users u JOIN notification_preferences p ON p.user_id=u.id AND p.category='promotion' AND p.enabled=1 JOIN favorites f ON f.user_id=u.id AND f.cafe_id=? WHERE u.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM notification_deliveries n WHERE n.recipient_id=u.id AND n.event_id=?) ORDER BY u.id LIMIT ?",event.cafe_id,event.id,1);
    }else {
     recipients=await sql.all(`SELECT id FROM users WHERE disabled_at IS NULL AND (${event.recipient_id?'id=?':event.cafe_id&&event.category!=='resource'?"id=(SELECT owner_id FROM cafes WHERE id=?)" : '0'} ${['sensor_offline','sensor_recovered','resource'].includes(event.category)?"OR role='admin'":''}) AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.recipient_id=users.id AND d.event_id=?) ORDER BY id LIMIT 1`,...(event.recipient_id?[event.recipient_id]:event.cafe_id&&event.category!=='resource'?[event.cafe_id]:[]),event.id);
    }
    let deferred=false;
    for(const recipient of recipients){
     const enabled=await sql.first('SELECT u.id,p.enabled FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.id AND p.category=? WHERE u.id=? AND u.disabled_at IS NULL',event.category,recipient.id);
     if(!enabled||enabled.enabled===0){await sql.batch([["INSERT OR IGNORE INTO notification_deliveries VALUES(?,?,'suppressed')",event.id,recipient.id]]);continue;}
     if(event.category==='promotion'&&enabled.enabled!==1){await sql.batch([["INSERT OR IGNORE INTO notification_deliveries VALUES(?,?,'suppressed')",event.id,recipient.id]]);continue;}
     if(event.category==='promotion_expiry'&&!await sql.first('SELECT id FROM promotions WHERE id=? AND cafe_id=? AND published=1 AND ends_at>?',event.entity_id,event.cafe_id,at)){await sql.batch([["INSERT OR IGNORE INTO notification_deliveries VALUES(?,?,'suppressed')",event.id,recipient.id]]);continue;}
     const before=await sql.first('SELECT n FROM notification_budgets WHERE recipient_id=? AND day=?',recipient.id,day);if((before?.n||0)>=options.notificationDaily){deferred=true;continue;}
     // Serialize dedup, cooldown and budget admission with the notification insert.
     const cooldownEntity=event.category==='resource'?(event.cafe_id?'cafe:'+event.cafe_id:'platform')+':'+event.entity_id+':'+event.id.split(':').at(-1):event.category==='inventory'?event.id:event.entity_id;
     const cutoff=new Date(Date.parse(at)-options.cooldownSec*1000).toISOString();
     const guard=event.category==='resource'?"u.role='admin'":['sensor_offline','sensor_recovered'].includes(event.category)?"(u.role='admin' OR u.id=(SELECT owner_id FROM cafes WHERE id=?))":event.category==='promotion'?"EXISTS(SELECT 1 FROM favorites WHERE user_id=u.id AND cafe_id=?)":event.recipient_id?'u.id=?':"u.id=(SELECT owner_id FROM cafes WHERE id=?)";
     const guardArgs=event.category==='resource'?[]:[event.category==='promotion'||!event.recipient_id?event.cafe_id:event.recipient_id];

     await sql.batch([[`INSERT OR IGNORE INTO notifications(id,recipient_id,cafe_id,category,entity_id,event_id,created_at,severity) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.disabled_at IS NULL AND (${guard})) AND coalesce((SELECT enabled FROM notification_preferences WHERE user_id=? AND category=?),?)=1 AND coalesce((SELECT n FROM notification_budgets WHERE recipient_id=? AND day=?),0)<? AND NOT EXISTS(SELECT 1 FROM notification_cooldowns WHERE recipient_id=? AND category=? AND entity_id=? AND last_at>?)`,id('notice'),recipient.id,event.cafe_id,event.category,event.entity_id,event.id,at,event.category==='resource'?({'1':'warning','2':'critical','3':'hard_limit'}[event.id.split(':').at(-1)]||'info'):'info',recipient.id,...guardArgs,recipient.id,event.category,event.category==='promotion'?0:1,recipient.id,day,options.notificationDaily,recipient.id,event.category,cooldownEntity,cutoff],
      ['INSERT INTO notification_budgets SELECT ?,?,1 WHERE changes()=1 ON CONFLICT(recipient_id,day) DO UPDATE SET n=n+1',recipient.id,day],
      ['INSERT INTO notification_cooldowns SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(recipient_id,category,entity_id) DO UPDATE SET last_at=excluded.last_at',recipient.id,event.category,cooldownEntity,at],
      ["INSERT OR IGNORE INTO notification_deliveries VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM notifications WHERE recipient_id=? AND event_id=?) THEN 'in_app' ELSE 'suppressed' END)",event.id,recipient.id,recipient.id,event.id]]);delivered++;
    }
    // Marketing fans out in pages; operational alerts have bounded recipients.
    const pending=recipients.length===1;
    if(!deferred&&!pending)await sql.batch([['UPDATE notification_outbox SET processed_at=?,attempts=attempts+1 WHERE id=? AND processed_at IS NULL',at,event.id]]);
    else await sql.batch([['UPDATE notification_outbox SET available_at=?,attempts=attempts+1 WHERE id=?',new Date(Date.parse(at)+(deferred?3600000:1000)).toISOString(),event.id]]);
   }
   const cutoff=new Date(Date.parse(at)-options.notificationDays*86400000).toISOString();
   await sql.batch([['DELETE FROM notifications WHERE id IN(SELECT id FROM notifications WHERE created_at<? ORDER BY created_at LIMIT ?)',cutoff,options.batch],['DELETE FROM notification_outbox WHERE id IN(SELECT id FROM notification_outbox WHERE processed_at IS NOT NULL AND created_at<? ORDER BY created_at LIMIT ?)',cutoff,options.batch],['DELETE FROM notification_budgets WHERE rowid IN(SELECT rowid FROM notification_budgets WHERE day<? LIMIT ?)',cutoff.slice(0,10),options.batch]]);
   return {processed:rows.length,delivery_attempts:delivered};
  }
 };return service;
}
