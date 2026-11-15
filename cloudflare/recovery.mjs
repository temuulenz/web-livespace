// Frontend-only forward recovery. Keep existing DO classes/bindings/migration
// history intact; never delete D1 or namespaces to recover a static frontend.
export { SensorGateway, AppBackend } from './worker.mjs';
export default { fetch() {return Response.json({error:{code:'maintenance',message:'Backend temporarily unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});} };
