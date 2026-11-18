import {authorizedBatch} from '../shared/business/write-authorization.mjs';
import { createMediaStorage, mediaResponse } from './media.mjs';
import { decodeImage } from '../shared/image-validation.mjs';
import { APIError as HttpError, all, first, run, batch, json, fail, body, now, id, token, sha, credentials, publicUser, guard, startSession } from './core.mjs';
import { parseHours, projectToMap } from '../js/live/levels.js';
const DISTRICTS = ['Сүхбаатар', 'Чингэлтэй', 'Баянгол', 'Хан-Уул', 'Баянзүрх', 'Сонгинохайрхан'];
const CATEGORIES = ['Кафе', 'Коворкинг', 'Номын сан'];
const PURPOSES = ['Сурах', 'Ажиллах', 'Найзуудтай', 'Тухтай'];

function validateApplication(input) {
  const details = {};
  const text = (key, max, required = true) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (required && !value) details[key] = 'Энэ талбарыг бөглөнө үү';
    else if (value.length > max) details[key] = `${max} тэмдэгтээс ихгүй`;
    return value;
  };
  const form = {
    cafe_name: text('cafe_name', 80), contact_name: text('contact_name', 80), phone: text('phone', 30), email: text('email', 200),
    district: text('district', 40), category: text('category', 40), address: text('address', 200), hours: text('hours', 20),
    description: text('description', 1000), extra: text('extra', 2000, false)
  };
  if (form.phone && form.phone.replace(/\D/g, '').length < 8) details.phone = '8 оронтой дугаар оруулна уу';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) details.email = 'И-мэйл хаяг буруу байна';
  if (form.district && !DISTRICTS.includes(form.district)) details.district = 'Дүүргээ сонгоно уу';
  if (form.category && !CATEGORIES.includes(form.category)) details.category = 'Төрлөө сонгоно уу';
  if (form.hours && !parseHours(form.hours)) details.hours = 'Цагийг 08:00–22:00 хэлбэрээр оруулна уу';
  form.purposes = Array.isArray(input.purposes) ? [...new Set(input.purposes.filter(p => PURPOSES.includes(p)))] : [];
  form.seats = input.seats == null || input.seats === '' ? null : Number(input.seats);
  if (form.seats != null && (!Number.isInteger(form.seats) || form.seats < 1 || form.seats > 2000)) details.seats = '1–2000 хооронд бүхэл тоо';
  form.lat = Number.isFinite(input.lat) ? input.lat : null;
  form.lng = Number.isFinite(input.lng) ? input.lng : null;
  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length < 3 || photos.length > 4) details.photos = 'Кафены 3–4 зураг оруулна уу';
  if (Object.keys(details).length) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', details);
  return { form, photos };
}

export function decodePhoto(dataUrl,maxBytes) {
 try{return decodeImage(dataUrl,maxBytes);}catch(e){throw new HttpError(e.message==='image_size'?413:422,e.message==='image_size'?'photo_too_large':'invalid_photo','Invalid or oversized JPEG, PNG or WebP image');}
}

export async function partner(req,db,user,createUser,limit,env={DB:db}) {
 const p=new URL(req.url).pathname;
 if(p==='/api/v1/applications' && req.method==='POST') {
  limit(`apply:${req.headers.get('cf-connecting-ip')}`,5,3600000);
  const {form,photos}=validateApplication(await body(req,6*1024*1024));
  const decoded=photos.map(p=>decodePhoto(p,1048576));
  const applicationId=id('app'),cafeId=id('cafe'),claimToken=token('lsc_'),t=now();
  const position=form.lat!=null && form.lng!=null?projectToMap(form.lat,form.lng):{x:null,y:null};
  const entries=[
   [`INSERT INTO cafes(id,name,status,data_mode,category,district,address,lat,lng,map_x,map_y,hours,phone,contact_name,email,description,tags,total_seats,created_at,updated_at,owner_id) VALUES(?,?,'submitted','live',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,cafeId,form.cafe_name,form.category,form.district,form.address,form.lat,form.lng,position.x,position.y,form.hours,form.phone,form.contact_name,form.email,form.description,JSON.stringify(form.purposes),form.seats,t,t,user?.id || null],
   ['INSERT INTO applications(id,cafe_id,claim_token_hash,owner_id,form,created_at) VALUES(?,?,?,?,?,?)',applicationId,cafeId,user?null:sha(claimToken),user?.id || null,JSON.stringify(form),t],
   ["INSERT INTO status_history(cafe_id,to_status,note,at) VALUES(?,'submitted','Хүсэлт илгээгдсэн',?)",cafeId,t]
  ];
  for(const [i,photo]of decoded.entries()) {
   const photoId=id('pho'),staged=await createMediaStorage(env).stage(cafeId,photoId,photo);entries.push(['INSERT INTO application_photos(id,application_id,file,mime,size,position,created_at) VALUES(?,?,?,?,?,?,?)',photoId,applicationId,photoId,photo.mime,photo.buffer.length,i,t]);
   if(staged)entries.push(['INSERT INTO media_objects(photo_id,cafe_id,object_key,sha256,created_at) VALUES(?,?,?,?,?)',photoId,cafeId,staged.key,staged.hash,t],['DELETE FROM media_staging WHERE object_key=?',staged.key]);
   else entries.push(['INSERT INTO photo_bytes(photo_id,bytes) VALUES(?,?)',photoId,photo.buffer]);
  }
  if(user?.role==='user')entries.push(["UPDATE users SET role='owner' WHERE id=?",user.id]);
  if(user)await authorizedBatch({batch:entries=>batch(db,entries)},fail,user,null,'user',entries);else await batch(db,entries);return json({application_id:applicationId,cafe_id:cafeId,claim_token:user?null:claimToken,status:'submitted'},201);
 }
 if((p==='/api/v1/auth/register-owner' || p==='/api/v1/applications/claim') && req.method==='POST') {
  const x=await body(req);const app=typeof x.claim_token==='string'?await first(db,'SELECT * FROM applications WHERE claim_token_hash=?',sha(x.claim_token)):null;
  if(!app)fail(400,'invalid_claim','Invalid or used claim token');
  if(p.endsWith('/register-owner')){limit(`register:${req.headers.get('cf-connecting-ip')}`,10,3600000);user=await createUser(db,x,'owner');}else guard(user);
  // Serialize claims using conditional writes in one atomic batch; a unique claim
  // reservation prevents two accounts racing the same one-time token.
  await authorizedBatch({batch:entries=>batch(db,entries)},fail,user,null,'user',[
   ['UPDATE applications SET owner_id=?,claim_token_hash=NULL WHERE id=? AND owner_id IS NULL AND claim_token_hash=?',user.id,app.id,app.claim_token_hash],
   ["SELECT json(CASE WHEN changes()=1 THEN '{}' ELSE 'claim_conflict' END)"],
   ['INSERT INTO claim_reservations(application_id,user_id) VALUES(?,?)',app.id,user.id],
   ['UPDATE cafes SET owner_id=?,updated_at=? WHERE id=?',user.id,now(),app.cafe_id],
   ["UPDATE users SET role=CASE WHEN role='user' THEN 'owner' ELSE role END WHERE id=?",user.id]
  ]);
  const found=await first(db,'SELECT * FROM users WHERE id=?',user.id);
  return json({user:publicUser(found),cafe_id:app.cafe_id},p.endsWith('/register-owner')?201:200,p.endsWith('/register-owner')?{'Set-Cookie':await startSession(db,user.id,req)}:{});
 }
 if(p.startsWith('/api/v1/files/photos/') && req.method==='GET') {
  guard(user,'owner','admin','user');const photoId=decodeURIComponent(p.split('/').at(-1));
  const photo=await first(db,'SELECT p.id,p.mime,a.owner_id,m.object_key,m.visibility FROM application_photos p JOIN applications a ON a.id=p.application_id LEFT JOIN media_objects m ON m.photo_id=p.id WHERE p.id=?',photoId);
  if(!photo || (user.role!=='admin' && photo.owner_id!==user.id))fail(404,'not_found','Photo not found');
  return mediaResponse(req,{...photo,visibility:'private'},await createMediaStorage({...env,LS_R2_MEDIA_ENABLED:'0'}).read(photo));
 }
 return null;
}
