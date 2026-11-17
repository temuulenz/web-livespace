import {mediaKey} from './media.mjs';
import {fail} from './core.mjs';
// Invalidate any formerly cached empty D1 representation; validators stay opaque.
export const menuImageEtag=image=>'"'+(image.object_key?'':'d1-v2-')+image.sha256+'"';
export function createMenuStorage(env){return {
 plan(cafe,image,photo){if(env.LS_R2_MEDIA_ENABLED!=='1')return {};if(!env.MEDIA)fail(503,'media_unavailable','R2 binding unavailable');return {object_key:mediaKey(cafe,image,photo.ext)};},
 async save(cafe,image,photo){const plan=this.plan(cafe,image,photo);if(plan.object_key){await env.MEDIA.put(plan.object_key,photo.buffer,{httpMetadata:{contentType:photo.mime}});return plan;}return {bytes:photo.buffer};},
 async remove(image){if(image.object_key){if(!env.MEDIA)fail(503,'media_unavailable','R2 binding unavailable');await env.MEDIA.delete(image.object_key);}},
 async read(image){if(image.object_key){if(!env.MEDIA)fail(503,'media_unavailable','R2 binding unavailable');const object=await env.MEDIA.get(image.object_key);if(!object)fail(503,'media_unavailable','Image unavailable');return object.body;}if(image.bytes==null)fail(503,'media_unavailable','Image unavailable');const bytes=new Uint8Array(image.bytes);if(bytes.byteLength!==image.size)fail(503,'media_unavailable','Image unavailable');return bytes;}
};}
