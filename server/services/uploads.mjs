// Café photographs from partnership applications.
// The browser resizes images before upload and sends them as data URLs inside JSON.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from '../lib/http.mjs';

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  'image/png': { ext: 'png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  'image/webp': { ext: 'webp', magic: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' }
};

export function decodePhoto(dataUrl, maxBytes) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!match) throw new HttpError(422, 'invalid_photo', 'Зураг JPEG, PNG эсвэл WebP байх ёстой');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > maxBytes) throw new HttpError(413, 'photo_too_large', `Зураг бүр ${Math.round(maxBytes / 1024 / 1024)} MB-аас ихгүй байна`);
  // Trust the bytes, not the declared type.
  if (!TYPES[match[1]].magic(buffer)) throw new HttpError(422, 'invalid_photo', 'Зургийн файл гэмтсэн эсвэл төрөл таарахгүй байна');
  return { mime: match[1], ext: TYPES[match[1]].ext, buffer };
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
    read: file => readFile(join(root, file)),
    removeFolder: folder => rm(join(root, folder), { recursive: true, force: true })
  };
}
