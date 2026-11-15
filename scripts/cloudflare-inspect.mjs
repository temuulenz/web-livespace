// Read-only account/deployment inspection. OAuth credentials never enter output.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
const account='9e5256db4932b2064ca5982039f4e121';
const config=await readFile(`${homedir()}/.config/.wrangler/config/default.toml`,'utf8');
const access=/^oauth_token\s*=\s*"([^"]+)"/m.exec(config)?.[1];
if(!access)throw new Error('Run wrangler login first');
async function get(path){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{headers:{Authorization:`Bearer ${access}`}});const x=await r.json();if(!r.ok||!x.success){console.log(JSON.stringify({path,status:r.status,errors:x.errors?.map(e=>({code:e.code,message:e.message}))}));return null;}return x.result;}
const workers=await get('workers/scripts');
console.log(JSON.stringify({workers:workers?.map(w=>({id:w.id,tag:w.tag,migration_tag:w.migration_tag,last_deployed_from:w.last_deployed_from}))}));
const worker=workers?.find(w=>w.id==='livespace');if(!worker)throw new Error('Existing livespace Worker not verified');
const settings=await get('workers/scripts/livespace/settings');
console.log(JSON.stringify({settings:settings && {migration_tag:settings.migration_tag,usage_model:settings.usage_model,compatibility_date:settings.compatibility_date,bindings:settings.bindings?.map(b=>({name:b.name,type:b.type,id:b.id,class_name:b.class_name})),limits:settings.limits}}));
const accountSettings=await get('workers/account-settings');console.log(JSON.stringify({accountSettings}));
const subscriptions=await get('subscriptions');console.log(JSON.stringify({subscriptions:subscriptions?.map(s=>({id:s.id,state:s.state,rate_plan:s.rate_plan && {id:s.rate_plan.id,public_name:s.rate_plan.public_name,currency:s.rate_plan.currency},price:s.price}))}));
const databases=await get('d1/database');console.log(JSON.stringify({databases:databases?.map(d=>({uuid:d.uuid,name:d.name,file_size:d.file_size,num_tables:d.num_tables}))}));
const triggers=await get(`builds/workers/${worker.tag}/triggers`);
console.log(JSON.stringify({triggers:Array.isArray(triggers)?triggers.map(t=>({trigger_uuid:t.trigger_uuid,branch_excludes:t.branch_excludes,branch_includes:t.branch_includes,build_command:t.build_command,deploy_command:t.deploy_command,root_directory:t.root_directory,repo_connection:t.repo_connection && {repo_name:t.repo_connection.repo_name,repo_id:t.repo_connection.repo_id,provider_type:t.repo_connection.provider_type},build_trigger_source:t.build_trigger_source,deploy_on_push:t.deploy_on_push,external_script_id:t.external_script_id})):triggers}));
