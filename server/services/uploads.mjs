import { decodeImage } from '../../shared/image-validation.mjs';
// Café photographs from partnership applications.
// The browser resizes images before upload and sends them as data URLs inside JSON.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from '../lib/http.mjs';

export function decodePhoto(dataUrl,maxBytes) {
 try{return decodeImage(dataUrl,maxBytes);}catch(e){throw new HttpError(e.message==='image_size'?413:422,e.message==='image_size'?'photo_too_large':'invalid_photo','Invalid or oversized JPEG, PNG or WebP image');}
}

export function createUploads(dataDir) {
  const root = join(dataDir, 'uploads');
  return {
    async save(folder, name, photo) {
      const dir = join(root, folder);
      await mkdir(dir, { recursive: true });
      const file = `${folder}/${name}.${photo.ext}`;
      await writeFile(join(root, file), photo.buffer);
      return file;
    },
    remove: file => rm(join(root, file), { force: true }),
    read: file => readFile(join(root, file)),
    removeFolder: folder => rm(join(root, folder), { recursive: true, force: true })
  };
}
