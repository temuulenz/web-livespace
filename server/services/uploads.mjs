import { decodeImage } from '../../shared/image-validation.mjs';
// Café photographs from partnership applications.
// The browser resizes images before upload and sends them as data URLs inside JSON.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';
import { HttpError } from '../lib/http.mjs';

export function decodePhoto(dataUrl,maxBytes) {
 try{return decodeImage(dataUrl,maxBytes);}catch(e){throw new HttpError(e.message==='image_size'?413:422,e.message==='image_size'?'photo_too_large':'invalid_photo','Invalid or oversized JPEG, PNG or WebP image');}
}

export function createUploads(dataDir) {
  const root = resolve(dataDir, 'uploads');
  const path=(...parts)=>{if(parts.some(x=>typeof x!=='string'||x.includes('\0')))throw new Error('Invalid storage path');const value=resolve(root,...parts);if(!value.startsWith(root+sep))throw new Error('Invalid storage path');return value;};
  return {
    async save(folder, name, photo) {
      const dir = path(folder);
      await mkdir(dir, { recursive: true });
      const file = `${folder}/${name}.${photo.ext}`;
      await writeFile(path(file), photo.buffer);
      return file;
    },
    remove: file => rm(path(file), { force: true }),
    read: file => readFile(path(file)),
    removeFolder: folder => rm(path(folder), { recursive: true, force: true })
  };
}
