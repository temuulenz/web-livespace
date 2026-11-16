import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {reconcileCafeRatings} from '../shared/business/reviews-reconcile.mjs';
import {REVIEWS_SCHEMA} from '../shared/business/reviews-schema.mjs';
import {readFileSync} from 'node:fs';
const ratings=(n,comment='')=>({taste:n,service:n,comfort:n,value:n,study:n,comment});
function fixture(){const f=businessFixture();return {...f,reviews:createReviewService({sql:f.sql,fail,id})};}
test('five integer ratings, no-review null, uniqueness, editing, author deletion and incremental bins',async()=>{
 assert.equal(readFileSync(new URL('../cloudflare/migrations/0012_reviews.sql',import.meta.url),'utf8'),REVIEWS_SCHEMA);
 const {db,reviews,customer,owner}=fixture();try{
 assert.equal((await reviews.summary('a')).overall_average,null);
 for(const bad of [0,6,1.5,'5'])await assert.rejects(reviews.create('a',ratings(bad),customer),{status:422});
 let review=await reviews.create('a',ratings(1,'Low rating'),customer);
 await assert.rejects(reviews.create('a',ratings(5),customer),{status:409,code:'review_exists'});
 assert.equal((await reviews.summary('a')).overall_average,1);
 await assert.rejects(reviews.remove('a',review.id,{version:review.version},owner),{status:403});
 review=await reviews.edit('a',review.id,{version:review.version,taste:5,service:5},customer);
 let summary=await reviews.summary('a');assert.equal(summary.review_count,1);assert.equal(summary.overall_average,2.6);assert.equal(summary.distributions.overall[2].count,1);assert.equal(summary.criterion_averages.taste,5);
 await reviews.remove('a',review.id,{version:review.version},customer);summary=await reviews.summary('a');assert.equal(summary.review_count,0);assert.equal(summary.overall_average,null);assert.ok(summary.distributions.overall.every(x=>x.count===0));
 assert.equal(db.prepare('SELECT count(*) n FROM reviews').get().n,1);
 await reviews.create('a',ratings(3),customer);assert.equal((await reviews.summary('a')).overall_average,3);
 }finally{db.close();}
});
test('owner replies/reports preserve negative reviews; only admin hides/restores with reason and audit',async()=>{
 const {db,reviews,customer,owner,other,admin}=fixture();try{
 let r=await reviews.create('a',ratings(1,'Negative'),customer);
 const reply=await reviews.reply('a',r.id,{version:0,text:'Thanks for feedback'},owner);assert.equal(reply.version,1);
 await assert.rejects(reviews.reply('a',r.id,{version:1,text:'Not mine'},other),{status:404});
 await assert.rejects(reviews.moderate('a',r.id,{version:1,action:'hide',reason:'negative'},owner),{status:403});
 await reviews.report('a',r.id,{reason:'Please review'},owner);
 await assert.rejects(reviews.report('a',r.id,{reason:'Again'},owner),{status:409});
 assert.equal((await reviews.queue({},admin,true)).items.length,1);
 r=await reviews.moderate('a',r.id,{version:r.version,action:'hide',reason:'Policy violation'},admin);
 assert.equal((await reviews.list('a')).items.length,0);assert.equal((await reviews.summary('a')).review_count,0);
 assert.equal((await reviews.list('a',{},owner,true)).items[0].status,'hidden');
 r=await reviews.moderate('a',r.id,{version:r.version,action:'restore',reason:'Appeal accepted'},admin);
 assert.equal((await reviews.summary('a')).review_count,1);assert.equal((await reviews.list('a')).items[0].reply.text,'Thanks for feedback');
 await reviews.reply('a',r.id,{version:reply.version,text:'Updated reply'},owner);await reviews.reply('a',r.id,{version:2},owner,true);
 assert.equal((await reviews.list('a')).items[0].reply,null);
 assert.equal(db.prepare('SELECT count(*) n FROM review_moderation_audit').get().n,2);
 assert.throws(()=>db.prepare('DELETE FROM review_moderation_audit').run(),/immutable/);
 await reviews.remove('a',r.id,{version:r.version},customer);assert.equal((await reviews.audit('a',r.id,{},admin)).items.length,2);
 }finally{db.close();}
});
test('concurrent author edits preserve correct aggregates and conflicts cannot partially alter summaries',async()=>{
 const {db,reviews,customer}=fixture();try{
 const r=await reviews.create('a',ratings(2),customer);
 const results=await Promise.allSettled([3,5].map(n=>reviews.edit('a',r.id,{version:1,...ratings(n)},customer)));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'version_conflict');
 const current=await reviews.mine('a',customer);assert.equal((await reviews.summary('a')).overall_average,current.overall_rating);
 db.exec("CREATE TRIGGER reject_review_audit BEFORE INSERT ON business_audit WHEN NEW.action='review.edit' BEGIN SELECT RAISE(ABORT,'injected_review_failure'); END");
 await assert.rejects(reviews.edit('a',r.id,{version:current.version,...ratings(1)},customer));
 reviews.invalidate('a');assert.equal((await reviews.summary('a')).overall_average,current.overall_rating);
 assert.equal((await reviews.mine('a',customer)).version,current.version);
 }finally{db.close();}
});
test('rating reconciliation repairs aggregates including zero bins without changing reviews',async()=>{
 const {db,sql,reviews,customer,owner,admin}=fixture();try{
 await reviews.create('a',ratings(5),customer);await reviews.create('a',ratings(1),owner);
 db.prepare("UPDATE cafe_rating_summary SET review_count=100,sum_taste=500 WHERE cafe_id='a'").run();db.prepare("UPDATE cafe_rating_bins SET count=100 WHERE cafe_id='a'").run();
 await assert.rejects(reconcileCafeRatings({sql,fail,id},'a',owner),{status:403});
 await reconcileCafeRatings({sql,fail,id},'a',admin);reviews.invalidate('a');const result=await reviews.summary('a');assert.equal(result.review_count,2);assert.equal(result.overall_average,3);assert.equal(result.distributions.overall[4].count,1);assert.equal(result.distributions.overall[0].count,1);assert.equal(result.distributions.overall[2].count,0);
 assert.equal(db.prepare('SELECT count(*) n FROM reviews').get().n,2);
 }finally{db.close();}
});
test('public review projection excludes identities/reports and enforces cafe/publication/pagination',async()=>{
 const {db,reviews,customer,owner,other}=fixture();try{
 await reviews.create('a',ratings(1),customer);await reviews.create('a',ratings(5),owner);
 const value=await reviews.list('a',{sort:'rating_high',limit:'1'});assert.equal(value.items[0].overall_rating,5);assert.equal(value.pagination.has_more,true);assert.equal(value.items[0].verification,'unverified');assert.equal('author_id' in value.items[0],false);assert.equal('reporter_id' in value.items[0],false);
 await assert.rejects(reviews.list('a',{},other,true),{status:404});await assert.rejects(reviews.list('a',{limit:'101'}),{status:422});await assert.rejects(reviews.list('a',{sort:'raw SQL'}),{status:422});
 await reviews.summary('a');db.prepare("UPDATE cafes SET status='submitted' WHERE id='a'").run();await assert.rejects(reviews.summary('a'),{status:404});
 }finally{db.close();}
});
test('review HTTP routes preserve author, owner, moderation and CSRF boundaries',async()=>{
 const {startServer,ADMIN}=await import('./support/server.mjs');const server=await startServer({seedDemo:false});
 try{
 const customer=server.client(),owner=server.client(),admin=server.client(),guest=server.client();
 await customer.post('/api/v1/auth/register',{email:'review-customer@example.invalid',password:'local-password-123'});
 const registered=await owner.post('/api/v1/auth/register',{email:'review-owner@example.invalid',password:'local-password-123'});
 const db=server.app.deps.db;db.prepare("UPDATE users SET role='owner' WHERE id=?").run(registered.data.user.id);db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('reviews-http','Reviews',?,'active','demo','2026-01-01','2026-01-01')").run(registered.data.user.id);
 const base='/api/v1/cafes/reviews-http/reviews';assert.equal((await guest.post(base,ratings(5))).status,401);
 const created=await customer.post(base,ratings(1));assert.equal(created.status,201);let r=created.data.review;
 assert.equal((await owner.patch(base+'/'+r.id,{version:1,...ratings(5)})).status,403);
 assert.equal((await customer.post(base,ratings(5),{Origin:'https://other.invalid'})).status,403);
 await admin.post('/api/v1/auth/login',ADMIN);const moderated=await admin.post('/api/v1/admin/cafes/reviews-http/reviews/'+r.id+'/moderation',{version:r.version,action:'hide',reason:'Local moderation fixture'});assert.equal(moderated.status,200);
 assert.equal((await guest.get('/api/v1/cafes/reviews-http/ratings')).data.review_count,0);
 assert.equal((await guest.get('/api/v1/admin/review-reports')).status,401);
 assert.equal((await owner.get('/api/v1/owner/cafes/reviews-http/reviews')).data.items.length,1);
 }finally{await server.stop();}
});
