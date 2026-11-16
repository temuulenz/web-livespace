import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseAvailabilityError, error } from '../cloudflare/core.mjs';

test('D1 daily quota failures are retryable service outages, not invalid credentials',async()=>{
 const failure=new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. private-sql-and-bindings");
 const mapped=databaseAvailabilityError(failure);
 assert.equal(mapped.status,503);assert.equal(mapped.code,'database_limit_reached');
 const response=error(failure),body=await response.json();
 assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'3600');
 assert.equal(body.error.code,'database_limit_reached');
 assert.ok(!JSON.stringify(body).includes('private-sql'));assert.ok(!JSON.stringify(body).includes('invalid_credentials'));
 assert.match(response.headers.get('Content-Security-Policy'),/script-src 'self'/);
 assert.equal(databaseAvailabilityError(new Error('unrelated storage failure')),null);
});
