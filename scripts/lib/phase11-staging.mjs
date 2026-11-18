import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function stagingConfig(){
 const cfg=JSON.parse(await readFile('wrangler.staging.jsonc','utf8'));
 if(cfg.name!=='livespace-phase11-staging-local'||cfg.account_id||cfg.workers_dev!==false||cfg.routes?.length||cfg.env||cfg.services||cfg.r2_buckets||cfg.kv_namespaces||cfg.queues||cfg.triggers)throw Error('Unsafe staging configuration');
 if(cfg.d1_databases?.length!==1||cfg.d1_databases[0].binding!=='DB'||cfg.d1_databases[0].database_id!=='local-only-phase11-staging'||cfg.d1_databases[0].remote!==false||cfg.d1_databases[0].database_name!==cfg.name)throw Error('Production or remote binding rejected');
 const expected={SENSORS:'SensorGateway',BACKEND:'AppBackend',BROWSER_ROOMS:'BrowserRoom',ANALYTICS:'AnalyticsAggregator'};
 if(cfg.main!=='cloudflare/worker.mjs'||cfg.durable_objects?.bindings?.length!==4||new Set(cfg.durable_objects.bindings.map(b=>b.name)).size!==4||cfg.durable_objects.bindings.some(b=>expected[b.name]!==b.class_name))throw Error('Unexpected staging Worker/classes');
 if(cfg.durable_objects?.bindings?.some(b=>b.script_name||b.environment))throw Error('External Durable Object binding rejected');
 cfg.main=resolve(cfg.main);cfg.assets.directory=resolve(cfg.assets.directory);cfg.d1_databases[0].migrations_dir=resolve(cfg.d1_databases[0].migrations_dir);delete cfg.build;return cfg;
}
