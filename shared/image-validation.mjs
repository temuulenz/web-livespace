// Bounded structural raster validation, shared by Node and Workers. No decoding,
// executable formats, SVG, filename trust, or expensive image transforms.
export function inspectImage(bytes, maxBytes=1048576) {
 const b=Buffer.from(bytes);if(!b.length || b.length>maxBytes)throw new Error('image_size');
 let mime,ext,width,height;
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
  mime='image/png';ext='png';let offset=8,header=false,data=false,end=false;
  while(offset+12<=b.length) {
   const n=b.readUInt32BE(offset),type=b.toString('ascii',offset+4,offset+8);if(n>b.length-offset-12)throw new Error('image_structure');
   if(!header){if(type!=='IHDR'||n!==13)throw new Error('image_structure');width=b.readUInt32BE(offset+8);height=b.readUInt32BE(offset+12);header=true;}
   if(type==='IDAT')data=true;
   offset+=12+n;if(type==='IEND'){if(n!==0||offset!==b.length)throw new Error('image_structure');end=true;break;}
  }
  if(!header||!data||!end)throw new Error('image_structure');
 } else if(b[0]===255 && b[1]===216) {
  mime='image/jpeg';ext='jpg';let offset=2,sos=false;
  if(b.at(-2)!==255 || b.at(-1)!==217)throw new Error('image_structure');
  while(offset<b.length-2) {
   if(b[offset++]!==255)throw new Error('image_structure');while(b[offset]===255)offset++;
   const marker=b[offset++];if(marker===218){sos=true;break;}
   if(offset+2>b.length)throw new Error('image_structure');const length=b.readUInt16BE(offset);
   if(length<2||offset+length>b.length)throw new Error('image_structure');
   if([192,193,194].includes(marker)){if(length<8)throw new Error('image_structure');height=b.readUInt16BE(offset+3);width=b.readUInt16BE(offset+5);}
   offset+=length;
  }
  if(!sos||!width||!height)throw new Error('image_structure');
 } else if(b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') {
  mime='image/webp';ext='webp';if(b.length<30||b.readUInt32LE(4)+8!==b.length)throw new Error('image_structure');
  let offset=12,found=false;
  while(offset+8<=b.length) {
   const type=b.toString('ascii',offset,offset+4),n=b.readUInt32LE(offset+4),p=offset+8;
   if(n>b.length-p)throw new Error('image_structure');
   if(type==='VP8 '&&n>=10&&b[p+3]===157&&b[p+4]===1&&b[p+5]===42){width=b.readUInt16LE(p+6)&16383;height=b.readUInt16LE(p+8)&16383;found=true;}
   if(type==='VP8L'&&n>=5&&b[p]===47){const bits=b.readUInt32LE(p+1);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;found=true;}
   if(type==='ANIM'||type==='ANMF')throw new Error('animated_image_not_supported');
   offset=p+n+(n%2);
  }
  if(!found||offset!==b.length)throw new Error('image_structure');
 } else throw new Error('image_type');
 if(!width||!height||width>8192||height>8192||width*height>20000000)throw new Error('image_dimensions');
 return {mime,ext,width,height};
}
export function decodeImage(dataUrl,maxBytes) {
 const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof dataUrl==='string'?dataUrl:'');
 if(!match)throw new Error('image_type');
 if(match[2].length>Math.ceil(maxBytes/3)*4)throw new Error('image_size');
 const buffer=Buffer.from(match[2],'base64');if(buffer.toString('base64')!==match[2])throw new Error('image_encoding');
 const metadata=inspectImage(buffer,maxBytes);if(metadata.mime!==match[1])throw new Error('image_type');return {...metadata,buffer};
}
