import {Component,html,raw} from '../../../framework/index.js';
import {platform,loadCatalogue} from '../../services/platform.js';
import {resizePhoto} from '../partner/photos.js';

const path=cafe=>`/owner/cafes/${encodeURIComponent(cafe)}/photos`;
const preview=photo=>photo.url.replace('/api/v1/cafes/','/api/v1/owner/cafes/');

export class CafePhotoManager extends Component {
 initialState(){return {photos:null,busy:false,progress:0,error:'',message:''};}
 events(){return {
  'change [data-photo-add]':(event,input)=>this.upload(input.files?.[0]),
  'change [data-photo-replace]':(event,input)=>this.upload(input.files?.[0],input.dataset.photoReplace),
  'click [data-photo-cover]':(event,button)=>this.change(()=>platform.api.put(`${path(this.props.cafeId)}/${encodeURIComponent(button.dataset.photoCover)}/cover`,{})),
  'click [data-photo-remove]':(event,button)=>{if(confirm('Энэ зургийг устгах уу?'))this.change(()=>platform.api.del(`${path(this.props.cafeId)}/${encodeURIComponent(button.dataset.photoRemove)}`));},
  'click [data-photo-move]':(event,button)=>this.move(button.dataset.photoMove,Number(button.dataset.direction)),
  'click [data-photo-retry]':()=>this.load()
 };}
 onMount(){this.load();}
 async load(){try{const {photos}=await platform.api.get(path(this.props.cafeId));if(this.mounted)this.setState({photos,error:''});}catch(error){if(this.mounted)this.setState({photos:[],error:error.message||'Зураг ачаалж чадсангүй'});}}
 async change(action){if(this.state.busy)return;this.setState({busy:true,error:'',message:''});try{await action();await this.load();await loadCatalogue().catch(()=>{});this.setState({message:'Өөрчлөлт хадгалагдлаа'});}catch(error){this.setState({error:error.message||'Зураг хадгалж чадсангүй'});}finally{this.setState({busy:false,progress:0});}}
 async move(id,direction){const rows=this.state.photos.filter(p=>p.ready),index=rows.findIndex(p=>p.id===id),next=index+direction;if(next<0||next>=rows.length)return;const ids=rows.map(p=>p.id);[ids[index],ids[next]]=[ids[next],ids[index]];await this.change(()=>platform.api.put(path(this.props.cafeId)+'/order',{ids}));}
 async upload(file,replaceId=null){if(!file||this.state.busy)return;if(file.size>12*1024*1024){this.setState({error:'12 МБ-аас бага зураг сонгоно уу'});return;}
  this.setState({busy:true,progress:0,error:'',message:'Зургийг хэмжээгээр нь тохируулж байна…'});
  try{
   const image=await resizePhoto(file,1600,0.82),url='/api/v1'+path(this.props.cafeId)+(replaceId?'/'+encodeURIComponent(replaceId):'');
   await new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open(replaceId?'PUT':'POST',url);xhr.withCredentials=true;xhr.timeout=30000;xhr.setRequestHeader('Content-Type','application/json');
    xhr.upload.onprogress=event=>{if(event.lengthComputable&&this.mounted)this.setState({progress:Math.round(event.loaded/event.total*100),message:'Зургийг байршуулж байна…'});};
    xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{let message='Зураг хадгалж чадсангүй';try{message=JSON.parse(xhr.responseText).error?.message||message;}catch{}reject(new Error(message));}};
    xhr.onerror=()=>reject(new Error('Сүлжээний алдаа'));xhr.ontimeout=()=>reject(new Error('Байршуулах хугацаа дууслаа'));
    xhr.send(JSON.stringify({image}));
   });
   await this.load();await loadCatalogue().catch(()=>{});this.setState({message:'Зураг хадгалагдлаа'});
  }catch(error){this.setState({error:error.message||'Зураг хадгалж чадсангүй'});}finally{this.setState({busy:false,progress:0});}
 }
 render(){const {photos,busy,error,progress,message}=this.state;
  return html`<section class="cafe-photo-manager" aria-label="Кафены нийтэд харагдах зургууд">
   <h3>Нийтийн зураг</h3><p class="muted">Кафены өөрийн бодит зургууд. Эхний зураг автоматаар нүүр зураг болно.</p>
   <label class="btn btn-o cafe-photo-add">Зураг нэмэх<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-add ${raw(busy?'disabled':'')}></label>
   ${busy?html`<p role="status">${message} ${progress?progress+'%':''}</p><progress value="${progress}" max="100" aria-label="Зураг байршуулах явц"></progress>`:''}
   ${error?html`<p role="alert" class="auth-msg">${error} <button type="button" data-photo-retry>Дахин ачаалах</button></p>`:''}
   ${!busy&&message?html`<p role="status" class="muted">${message}</p>`:''}
   ${photos===null?html`<p class="muted">Ачаалж байна…</p>`:photos.length?html`<div class="cafe-photo-grid">${photos.map((photo,index)=>html`<figure>
    ${photo.ready?html`<img src="${preview(photo)}" alt="Кафены зураг ${index+1}" loading="lazy" decoding="async" width="320" height="220">`:html`<div class="cafe-photo-pending">Байршуулах явцад байна</div>`}
    <figcaption>${photo.is_cover?'Нүүр зураг':`Зураг ${index+1}`}</figcaption>
    <div class="cafe-photo-actions">
     ${photo.ready&&!photo.is_cover?html`<button type="button" class="btn btn-g" data-photo-cover="${photo.id}" ${raw(busy?'disabled':'')}>Нүүр зураг болгох</button>`:''}
     <button type="button" class="btn btn-g" data-photo-move="${photo.id}" data-direction="-1" aria-label="Зургийг урагшлуулах" ${raw(busy||index===0?'disabled':'')}>←</button>
     <button type="button" class="btn btn-g" data-photo-move="${photo.id}" data-direction="1" aria-label="Зургийг хойшлуулах" ${raw(busy||index===photos.length-1?'disabled':'')}>→</button>
     <label class="btn btn-g">Солих<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-replace="${photo.id}" ${raw(busy?'disabled':'')}></label>
     <button type="button" class="btn btn-g" data-photo-remove="${photo.id}" ${raw(busy?'disabled':'')}>Устгах</button>
    </div></figure>`)}</div>`:html`<p class="muted">Нийтийн зураг хараахан оруулаагүй.</p>`}
  </section>`;
 }
}
