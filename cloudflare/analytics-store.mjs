// Pure SQLite adapter shared with local tests and the hibernating aggregation DO.
export function initializeAnalytics(sql) {
 sql.exec('CREATE TABLE IF NOT EXISTS analytics_scope(id INTEGER PRIMARY KEY CHECK(id=1),cafe TEXT NOT NULL)');
 sql.exec('CREATE TABLE IF NOT EXISTS event_receipts(id TEXT PRIMARY KEY,type TEXT NOT NULL,hour TEXT NOT NULL,expires INTEGER NOT NULL)');
 sql.exec('CREATE INDEX IF NOT EXISTS event_receipts_expiry ON event_receipts(expires)');
 sql.exec('CREATE TABLE IF NOT EXISTS counters(hour TEXT NOT NULL,type TEXT NOT NULL,n INTEGER NOT NULL,dirty INTEGER NOT NULL,PRIMARY KEY(hour,type))');
 sql.exec('CREATE TABLE IF NOT EXISTS intake(day TEXT PRIMARY KEY,n INTEGER NOT NULL)');
}
export function acceptAnalytics(ctx,batch,clock=Date.now()) {
 let accepted=0,duplicates=0;
 ctx.storage.transactionSync(()=>{
  const sql=ctx.storage.sql,scope=[...sql.exec('SELECT cafe FROM analytics_scope WHERE id=1')][0];
  if(scope&&scope.cafe!==batch.cafeId)throw new Error('Analytics tenant mismatch');if(!scope)sql.exec('INSERT INTO analytics_scope VALUES(1,?)',batch.cafeId);
  const day=new Date(clock).toISOString().slice(0,10);let used=[...sql.exec('SELECT n FROM intake WHERE day=?',day)][0]?.n||0;
  for(const e of batch.events){const old=[...sql.exec('SELECT type,hour FROM event_receipts WHERE id=?',e.id)][0];if(old){if(old.type!==e.type||old.hour!==e.hour)throw new Error('Analytics ID conflict');duplicates++;continue;}
   if(used>=1000)throw new Error('Analytics daily budget reached');
   sql.exec('INSERT INTO event_receipts VALUES(?,?,?,?)',e.id,e.type,e.hour,clock+172800000);
   sql.exec('INSERT INTO counters VALUES(?,?,1,1) ON CONFLICT(hour,type) DO UPDATE SET n=n+1,dirty=1',e.hour,e.type);accepted++;used++;
  }
  sql.exec('INSERT INTO intake VALUES(?,?) ON CONFLICT(day) DO UPDATE SET n=excluded.n',day,used);
 });return {accepted,duplicates};
}
export async function flushAnalytics(ctx,db,clock=Date.now()) {
 const sql=ctx.storage.sql,cafe=[...sql.exec('SELECT cafe FROM analytics_scope WHERE id=1')][0]?.cafe;
 if(!cafe)return {summaries:0,rowsRead:0,rowsWritten:0};
 const rows=[...sql.exec('SELECT * FROM counters WHERE dirty=1 ORDER BY hour,type LIMIT 20')];
 let results=[];
 if(rows.length)results=await db.batch(rows.map(row=>db.prepare(`INSERT INTO analytics_hourly(cafe_id,hour,event_type,event_count,revision,updated_at) VALUES(?,?,?,?,?,?)
 ON CONFLICT(cafe_id,hour,event_type) DO UPDATE SET event_count=excluded.event_count,revision=excluded.revision,updated_at=excluded.updated_at WHERE excluded.revision>analytics_hourly.revision`).bind(cafe,row.hour,row.type,row.n,row.n,new Date(clock).toISOString())));
 // Mark only the exact revision durably flushed; concurrent intake stays dirty.
 for(const row of rows)sql.exec('UPDATE counters SET dirty=0 WHERE hour=? AND type=? AND n=?',row.hour,row.type,row.n);
 sql.exec('DELETE FROM event_receipts WHERE id IN (SELECT id FROM event_receipts WHERE expires<? LIMIT 100)',clock);
 sql.exec('DELETE FROM counters WHERE dirty=0 AND hour<?',new Date(clock-172800000).toISOString());
 sql.exec('DELETE FROM intake WHERE day<?',new Date(clock-172800000).toISOString().slice(0,10));
 return {summaries:rows.length,rowsRead:results.reduce((n,r)=>n+(r.meta?.rows_read||0),0),rowsWritten:results.reduce((n,r)=>n+(r.meta?.rows_written||0),0),pending:[...sql.exec('SELECT 1 FROM counters WHERE dirty=1 LIMIT 1')].length>0||[...sql.exec('SELECT 1 FROM event_receipts WHERE expires<? LIMIT 1',clock)].length>0};
}
