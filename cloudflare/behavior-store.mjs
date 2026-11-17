// Extends the existing per-cafe durable analytics store; no raw event history in D1.
export function initializeBehavior(sql){
 sql.exec('CREATE TABLE IF NOT EXISTS behavior_receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,expires INTEGER NOT NULL)');
 sql.exec('CREATE INDEX IF NOT EXISTS behavior_receipts_expiry ON behavior_receipts(expires)');
 sql.exec('CREATE TABLE IF NOT EXISTS behavior_counters(hour TEXT NOT NULL,type TEXT NOT NULL,product TEXT NOT NULL,promotion TEXT NOT NULL,n INTEGER NOT NULL,dirty INTEGER NOT NULL,PRIMARY KEY(hour,type,product,promotion))');
 sql.exec('CREATE TABLE IF NOT EXISTS behavior_members(day TEXT NOT NULL,type TEXT NOT NULL,product TEXT NOT NULL,promotion TEXT NOT NULL,session TEXT NOT NULL,dirty INTEGER NOT NULL,PRIMARY KEY(day,type,product,promotion,session))');
 sql.exec('CREATE TABLE IF NOT EXISTS behavior_sessions(day TEXT NOT NULL,session TEXT NOT NULL,n INTEGER NOT NULL,dirty INTEGER NOT NULL,PRIMARY KEY(day,session))');
}
export function acceptBehavior(ctx,batch,clock,options){
 let accepted=0,duplicates=0;ctx.storage.transactionSync(()=>{
  const sql=ctx.storage.sql,scope=[...sql.exec('SELECT cafe FROM analytics_scope WHERE id=1')][0];
  if(scope&&scope.cafe!==batch.cafeId)throw Error('Analytics tenant mismatch');if(!scope)sql.exec('INSERT INTO analytics_scope VALUES(1,?)',batch.cafeId);
  const day=new Date(clock+28800000).toISOString().slice(0,10);let used=[...sql.exec('SELECT n FROM intake WHERE day=?',day)][0]?.n||0;
  let sessionUsed=[...sql.exec('SELECT n FROM behavior_sessions WHERE day=? AND session=?',day,batch.sessionHash)][0]?.n||0;
  for(const e of batch.events){const old=[...sql.exec('SELECT fingerprint FROM behavior_receipts WHERE id=?',e.id)][0];if(old){if(old.fingerprint!==e.fingerprint)throw Error('Analytics ID conflict');duplicates++;continue;}
   if(used>=options.analyticsDaily||sessionUsed>=options.sessionDaily)throw Error('Analytics daily budget reached');
   sql.exec('INSERT INTO behavior_receipts VALUES(?,?,?)',e.id,e.fingerprint,clock+options.receiptDays*86400000);
   sql.exec('INSERT INTO behavior_counters VALUES(?,?,?,?,1,1) ON CONFLICT(hour,type,product,promotion) DO UPDATE SET n=n+1,dirty=1',e.hour,e.type,e.productId,e.promotionId);sql.exec('INSERT OR IGNORE INTO behavior_members VALUES(?,?,?,?,?,1)',day,e.type,e.productId,e.promotionId,batch.sessionHash);used++;sessionUsed++;accepted++;
  }
  if(accepted){sql.exec('INSERT INTO intake VALUES(?,?) ON CONFLICT(day) DO UPDATE SET n=excluded.n',day,used);sql.exec('INSERT INTO behavior_sessions VALUES(?,?,?,1) ON CONFLICT(day,session) DO UPDATE SET n=excluded.n,dirty=1',day,batch.sessionHash,sessionUsed);}
 });return {accepted,duplicates,serverTimestamp:new Date(clock).toISOString()};
}
export async function flushBehavior(ctx,db,clock,options){
 const sql=ctx.storage.sql,cafe=[...sql.exec('SELECT cafe FROM analytics_scope WHERE id=1')][0]?.cafe;if(!cafe)return {summaries:0,pending:false};
 const rows=[...sql.exec('SELECT * FROM behavior_counters WHERE dirty=1 ORDER BY hour,type,product,promotion LIMIT ?',Math.min(options.batch,10))],sessions=[...sql.exec('SELECT * FROM behavior_sessions WHERE dirty=1 ORDER BY day,session LIMIT ?',Math.min(options.batch,10))];
 const members=[...sql.exec('SELECT * FROM behavior_members WHERE dirty=1 LIMIT ?',Math.min(options.batch,10))];
 const statements=rows.map(r=>db.prepare('INSERT INTO analytics_dimensions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(cafe_id,hour,event_type,product_id,promotion_id) DO UPDATE SET event_count=excluded.event_count,revision=excluded.revision,updated_at=excluded.updated_at WHERE excluded.revision>analytics_dimensions.revision').bind(cafe,r.hour,r.type,r.product,r.promotion,r.n,r.n,new Date(clock).toISOString()));
 statements.push(...sessions.map(r=>db.prepare('INSERT OR IGNORE INTO analytics_session_days VALUES(?,?,?)').bind(cafe,r.day,r.session)));
 statements.push(...members.map(r=>db.prepare('INSERT OR IGNORE INTO analytics_cohorts VALUES(?,?,?,?,?,?)').bind(cafe,r.day,r.type,r.product,r.promotion,r.session)));
 const results=statements.length?await db.batch(statements):[];
 for(const r of rows)sql.exec('UPDATE behavior_counters SET dirty=0 WHERE hour=? AND type=? AND product=? AND promotion=? AND n=?',r.hour,r.type,r.product,r.promotion,r.n);
 for(const r of members)sql.exec('UPDATE behavior_members SET dirty=0 WHERE day=? AND type=? AND product=? AND promotion=? AND session=?',r.day,r.type,r.product,r.promotion,r.session);
 for(const r of sessions)sql.exec('UPDATE behavior_sessions SET dirty=0 WHERE day=? AND session=? AND n=?',r.day,r.session,r.n);
 sql.exec('DELETE FROM behavior_receipts WHERE id IN(SELECT id FROM behavior_receipts WHERE expires<? LIMIT ?)',clock,options.batch*5);
 sql.exec('DELETE FROM behavior_counters WHERE rowid IN(SELECT rowid FROM behavior_counters WHERE dirty=0 AND hour<? LIMIT ?)',new Date(clock-options.retentionDays*86400000).toISOString(),options.batch*5);
 sql.exec('DELETE FROM behavior_members WHERE rowid IN(SELECT rowid FROM behavior_members WHERE dirty=0 AND day<? LIMIT ?)',new Date(clock-options.retentionDays*86400000).toISOString().slice(0,10),options.batch*5);
 sql.exec('DELETE FROM behavior_sessions WHERE rowid IN(SELECT rowid FROM behavior_sessions WHERE dirty=0 AND day<? LIMIT ?)',new Date(clock-options.retentionDays*86400000).toISOString().slice(0,10),options.batch*5);
 return {summaries:rows.length,rowsRead:results.reduce((n,r)=>n+(r.meta?.rows_read||0),0),rowsWritten:results.reduce((n,r)=>n+(r.meta?.rows_written||0),0),pending:!![...sql.exec('SELECT 1 FROM behavior_counters WHERE dirty=1 UNION ALL SELECT 1 FROM behavior_sessions WHERE dirty=1 UNION ALL SELECT 1 FROM behavior_members WHERE dirty=1 LIMIT 1')].length};
}
