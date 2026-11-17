import {HttpError,readJson,sendJson} from '../lib/http.mjs';
export function register(router,{phase11,behavior,limit,config}){
 const handler=async ctx=>{limit('phase11:'+ctx.ip,config.phase11.insightRequests,60000);const result=await phase11.route({path:ctx.path,method:ctx.method,query:ctx.query,user:ctx.user,read:()=>readJson(ctx,16384),flush:cafe=>behavior.flush(cafe)});if(!result)throw new HttpError(405,'method_not_allowed','Method not allowed');if(result.headers){ctx.res.writeHead(200,{'Cache-Control':'no-store',...result.headers});ctx.res.end(result.body);}else sendJson(ctx.res,200,result.body);};
 for(const scope of ['owner','admin'])for(const suffix of ['analytics','analytics.csv','resources','resource-controls'])router[suffix==='resource-controls'?'patch':'get'](`/api/v1/${scope}/cafes/:cafe/${suffix}`,handler);
 for(const path of ['analytics','analytics.csv','resources/monitor'])router.get('/api/v1/admin/'+path,handler);
 router.patch('/api/v1/admin/resource-controls',handler);router.post('/api/v1/admin/maintenance',handler);
 router.get('/api/v1/me/notifications',handler);router.post('/api/v1/me/notifications/read-all',handler);router.post('/api/v1/me/notifications/:notification/read',handler);
 router.get('/api/v1/me/notification-preferences',handler);router.patch('/api/v1/me/notification-preferences',handler);
}
