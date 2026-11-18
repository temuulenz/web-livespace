import {authorizationAssertion} from '../../shared/business/write-authorization.mjs';
import {transaction} from './db.mjs';
import {HttpError} from './http.mjs';
const fail=(...args)=>{throw new HttpError(...args);};
export function authorizedWrite(db,actor,cafe,scope,fn){
 try{return transaction(db,()=>{const [q,...args]=authorizationAssertion(fail,actor,cafe,scope);db.prepare(q).run(...args);return fn();});}
 catch(e){if(/malformed JSON/i.test(e.message))fail(409,'access_changed','Authentication or permissions changed; reload and retry');throw e;}
}
