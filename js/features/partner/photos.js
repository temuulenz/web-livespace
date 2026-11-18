// Browser-only compression; server validates the actual received raster bytes.
export async function resizePhoto(file,maxSide=1600,quality=0.82) {
 const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
 try {
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let result;
  for(let q=quality;q>=0.4;q-=0.1){result=canvas.toDataURL('image/webp',q);if(result.length*0.75<=300*1024)break;}
  if(result.length*0.75>1048576)throw new Error('Image remains too large; choose a smaller photo');
  return result; // browsers without WebP export use their supported raster fallback
 }finally{bitmap.close?.();}
}
