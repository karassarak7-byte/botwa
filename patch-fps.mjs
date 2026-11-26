// patch-fps.mjs — alternatif sed untuk Windows (atau kalau sed tidak ada).
// Jalankan di folder bot: node patch-fps.mjs
// Mengubah daftar FPS percobaan stiker menjadi 24, 18, 15, 12 (aman dijalankan berulang).
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'node_modules/@xbibzlibrary/whatsbibz/lib/Utils/sound-sticker.js';
const src = readFileSync(file, 'utf8');
const pattern = /for \(const \[fps, quality\] of \[.*\]\) \{/;

if (!pattern.test(src)) {
  console.error('Pola tidak ditemukan. Cek versi library (harus 2.1.0).');
  process.exit(1);
}

// Batas durasi sound sticker: 10 detik. Batas ukuran stiker: 2 MB.
const patched = src
  .replace(pattern, 'for (const [fps, quality] of [[24, 70], [24, 55], [18, 42], [15, 30], [12, 20]]) {')
  .replace(/export const SOUND_STICKER_MAX_SECONDS = \d+;/, 'export const SOUND_STICKER_MAX_SECONDS = 10;')
  .replace(/export const SOUND_STICKER_MAX_WEBP_BYTES = [^;]+;/, 'export const SOUND_STICKER_MAX_WEBP_BYTES = 2 * 1024 * 1024;');
writeFileSync(file, patched);
console.log('Patch FPS selesai:', file);
