// Zero-write assertion inside the SAME atomic SQLite/D1 batch as the mutation.
// Production actors come from SESSION_SELECT. Session-less actors are reserved
// for trusted local operator/service tests, and still require current DB identity.
export function authorizationAssertion(fail,actor,cafe,scope){
 if(!actor)fail(401,'unauthorized','Sign in required');
 const predicates=['a.id=?','a.disabled_at IS NULL','a.role=?','a.auth_version=?'],args=[actor.id,actor.role,actor.auth_version??0];
 if(actor.session_token_hash){predicates.push("EXISTS(SELECT 1 FROM sessions s WHERE s.token_hash=? AND s.user_id=a.id AND s.user_auth_version=a.auth_version AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))");args.push(actor.session_token_hash);}
 if(scope==='owner'){predicates.push("a.role IN('owner','admin')","EXISTS(SELECT 1 FROM cafes c WHERE c.id=? AND c.owner_id=a.id)");args.push(cafe);}
 else if(scope==='admin')predicates.push("a.role='admin'");
 else if(scope==='public'){predicates.push("EXISTS(SELECT 1 FROM cafes c WHERE c.id=? AND c.status='active')");args.push(cafe);}
 else if(scope!=='user')throw Error('Unknown business authorization scope');
 // Invalid JSON intentionally aborts the batch when permission has changed.
 // Valid business statements serialize their JSON internally, so this failure
 // cannot be supplied by client text as an alternate path to success.
 return [`SELECT json(CASE WHEN EXISTS(SELECT 1 FROM users a WHERE ${predicates.join(' AND ')}) THEN '{}' ELSE 'authorization_changed' END)`,...args];
}
export async function authorizedBatch(sql,fail,actor,cafe,scope,entries){
 const assertion=authorizationAssertion(fail,actor,cafe,scope);
 try{return await sql.batch([assertion,...entries]);}
 catch(e){if(/malformed JSON/i.test(String(e.message)+' '+String(e.cause?.message)))fail(409,'access_changed','Authentication or permissions changed; reload and retry');throw e;}
}
