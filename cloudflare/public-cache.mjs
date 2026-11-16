// Only this explicit projection is eligible for KV. Never accept an arbitrary
// authenticated Response or cache live state via this adapter.
export function publicProfile(row) {
 return {schemaVersion:1,id:row.id,name:row.name,category:row.category,district:row.district,address:row.address,hours:row.hours,description:row.description};
}
export class PublicProfileCache {
 constructor({kv,storage,enabled=false,clock=Date.now}){this.kv=kv;this.storage=storage;this.enabled=enabled&&!!kv;this.clock=clock;this.entries=new Map();this.pending=new Map();this.epochs=new Map();this.budgetTail=Promise.resolve();this.mutationTail=Promise.resolve();this.metrics={hits:0,misses:0,kvReads:0,kvWrites:0,failures:0};}
 rememberEpoch(cafe,value){if(this.epochs.size>=256&&!this.epochs.has(cafe))this.epochs.delete(this.epochs.keys().next().value);this.epochs.set(cafe,value);}
 async epoch(cafe){if(!this.epochs.has(cafe))this.rememberEpoch(cafe,(await this.storage?.get('profile-epoch:'+cafe))||0);return this.epochs.get(cafe);}
 async invalidate(cafe){const task=this.mutationTail.then(async()=>{const epoch=(await this.epoch(cafe))+1;await this.storage?.put('profile-epoch:'+cafe,epoch);this.rememberEpoch(cafe,epoch);this.entries.delete(cafe);});this.mutationTail=task.catch(()=>{});return task;}
 async get(cafe,load){
  const epoch=await this.epoch(cafe),key=`public:v1:cafe:${encodeURIComponent(cafe)}:profile:g${epoch}`,t=this.clock();
  const entry=this.entries.get(cafe);if(entry?.epoch===epoch&&entry.until>t){this.metrics.hits++;return entry.value;}
  if(this.pending.has(key))return this.pending.get(key);
  const task=(async()=>{
   let value;
   if(this.enabled)try{this.metrics.kvReads++;const saved=await this.kv.get(key,'json');if(saved?.expiresAt>t&&saved?.value?.id===cafe&&saved?.value?.schemaVersion===1)value=publicProfile(saved.value);}catch{this.metrics.failures++;}
   if(!value){this.metrics.misses++;const row=await load();if(!row)return null;value=publicProfile(row);
    if(this.enabled)try{
     const write=this.budgetTail.then(async()=>{
     const day=new Date(t).toISOString().slice(0,10),budget=await this.storage?.get('profile-kv-budget')||{day,writes:0};
     if(budget.day!==day){budget.day=day;budget.writes=0;}
     if(budget.writes<400){budget.writes++;await this.storage?.put('profile-kv-budget',budget);await this.kv.put(key,JSON.stringify({value,expiresAt:t+3600000}),{expirationTtl:3600});this.metrics.kvWrites++;}
     });this.budgetTail=write.catch(()=>{});await write;
    }catch{this.metrics.failures++;}
   }
   if(this.epochs.get(cafe)===epoch){if(this.entries.size>=128)this.entries.delete(this.entries.keys().next().value);this.entries.set(cafe,{value,epoch,until:t+60000});}return value;
  })().finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;
 }
}
