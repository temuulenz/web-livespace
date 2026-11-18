import {authorizedBatch} from './write-authorization.mjs';
import {RATING_CRITERIA} from './reviews.mjs';
// Admin/operator maintenance, never part of normal summary reads. Atomic D1 batch.
export async function reconcileCafeRatings({sql,fail,id,clock=()=>new Date().toISOString()},cafe,user){
 if(!user)fail(401,'unauthorized','Sign in required');if(user.role!=='admin')fail(403,'forbidden','Administrator required');
 if(!await sql.first('SELECT id FROM cafes WHERE id=?',cafe))fail(404,'not_found','Cafe not found');
 const buckets=JSON.stringify([...RATING_CRITERIA,'overall'].flatMap(criterion=>Array.from({length:5},(_,i)=>({criterion,stars:i+1}))));
 const criterion=`CASE b.criterion ${RATING_CRITERIA.map(k=>`WHEN '${k}' THEN r.${k}`).join(' ')} ELSE CAST((${RATING_CRITERIA.map(k=>'r.'+k).join('+')}+2)/5 AS INTEGER) END`;
 await authorizedBatch(sql,fail,user,cafe,'admin',[
  [`INSERT INTO cafe_rating_summary(cafe_id,review_count,${RATING_CRITERIA.map(k=>'sum_'+k).join(',')},updated_at) SELECT ?,count(*),${RATING_CRITERIA.map(k=>`coalesce(sum(${k}),0)`).join(',')},? FROM reviews WHERE cafe_id=? AND status='visible' AND deleted_at IS NULL ON CONFLICT(cafe_id) DO UPDATE SET review_count=excluded.review_count,${RATING_CRITERIA.map(k=>`sum_${k}=excluded.sum_${k}`).join(',')},updated_at=excluded.updated_at`,cafe,clock(),cafe],
  [`INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT ?,b.criterion,b.stars,count(r.id) FROM (SELECT json_extract(value,'$.criterion') criterion,json_extract(value,'$.stars') stars FROM json_each(?)) b LEFT JOIN reviews r ON r.cafe_id=? AND r.status='visible' AND r.deleted_at IS NULL AND ${criterion}=b.stars WHERE 1 GROUP BY b.criterion,b.stars ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=excluded.count`,cafe,buckets,cafe],
  ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafe,user.id,'reviews.reconcile',cafe,clock()]
 ]);
 return {reconciled:true,cafe_id:cafe};
}
