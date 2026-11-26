// database.js — penyimpanan energi pengguna di file users.json.
// Semua perubahan lewat antrean (withLock) supaya dua perintah tidak saling menimpa.
import { existsSync } from 'node:fs';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const START_ENERGY = 30;              // energi awal pengguna baru
export const MAX_ENERGY = 150;               // batas maksimal energi
export const CLAIM_AMOUNT = 15;              // hadiah !claim
export const CLAIM_COOLDOWN_MS = 3_600_000;  // jeda klaim: 1 jam

const DB_FILE = fileURLToPath(new URL('./users.json', import.meta.url));

// Antrean tulis: setiap operasi jalan setelah operasi sebelumnya selesai.
let queue = Promise.resolve();
function withLock(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {}); // error satu operasi tidak menghentikan antrean
  return run;
}

async function readDb() {
  try {
    return JSON.parse(await readFile(DB_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    // File rusak: salin dulu supaya data tidak hilang diam-diam
    const backup = DB_FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
    await copyFile(DB_FILE, backup).catch(() => {});
    console.error('users.json rusak, salinan disimpan di', backup);
    return {};
  }
}

async function writeDb(data) {
  // Tulis ke file sementara lalu ganti, supaya users.json tidak terpotong jika proses mati di tengah
  const tmp = `${DB_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, DB_FILE);
}

// Auto-create users.json saat modul dimuat
await withLock(async () => {
  if (!existsSync(DB_FILE)) await writeDb({});
});

// Ambil data pengguna, atau daftarkan pengguna baru dengan saldo awal
function ensureUser(data, id) {
  if (!data[id]) {
    data[id] = { energy: START_ENERGY, lastClaim: 0, createdAt: Date.now() };
  }
  return data[id];
}

// Jalankan fn(user) secara atomik. fn boleh mengubah user dan mengembalikan hasil.
function updateUser(id, fn) {
  return withLock(async () => {
    const data = await readDb();
    const user = ensureUser(data, id);
    const result = fn(user);
    await writeDb(data);
    return result;
  });
}

const clampEnergy = (value) => Math.max(0, Math.min(MAX_ENERGY, value));

// Status pengguna (otomatis terdaftar jika baru)
export function getUser(id) {
  return updateUser(id, (u) => ({ energy: u.energy, lastClaim: u.lastClaim }));
}

// True hanya sekali per pengguna: dipakai untuk sapaan chat pribadi pertama
export function markGreeted(id) {
  return updateUser(id, (u) => {
    if (u.greeted) return false;
    u.greeted = true;
    return true;
  });
}

// Hitung panggilan masuk ke bot: 1 = peringatan pertama, 2 atau lebih = diblokir
export function countCall(id) {
  return updateUser(id, (u) => {
    u.callCount = (u.callCount ?? 0) + 1;
    return u.callCount;
  });
}

// Potong energi untuk !sticker. Gagal jika energi tidak cukup.
export function spendEnergy(id, cost) {
  return updateUser(id, (u) => {
    if (u.energy < cost) return { ok: false, energy: u.energy };
    u.energy -= cost;
    return { ok: true, energy: u.energy };
  });
}

// Cari pengguna tanpa mendaftarkan (dipakai perintah pengendali)
export function findUser(id) {
  return withLock(async () => (await readDb())[id] ?? null);
}

// Atur energi langsung (perintah pengendali), dibatasi 0..MAX_ENERGY
export function setEnergy(id, amount) {
  return updateUser(id, (u) => {
    u.energy = clampEnergy(amount);
    return { energy: u.energy };
  });
}

// Kembalikan energi (refund saat !sticker gagal)
export function refundEnergy(id, amount) {
  return updateUser(id, (u) => {
    u.energy = clampEnergy(u.energy + amount);
    return { energy: u.energy };
  });
}

// Tambah energi (hadiah tebak kata), dibatasi MAX_ENERGY
export function addEnergy(id, amount) {
  return updateUser(id, (u) => {
    u.energy = clampEnergy(u.energy + amount);
    return { energy: u.energy };
  });
}

// !claim: +CLAIM_AMOUNT jika jeda 1 jam sudah lewat dan energi belum penuh
export function claimEnergy(id, now) {
  return updateUser(id, (u) => {
    const waitMs = u.lastClaim + CLAIM_COOLDOWN_MS - now;
    if (waitMs > 0) return { ok: false, waitMs };
    if (u.energy >= MAX_ENERGY) return { ok: false, full: true };
    const before = u.energy;
    const total = u.energy + CLAIM_AMOUNT;
    u.energy = clampEnergy(total);
    u.lastClaim = now;
    return { ok: true, before, after: u.energy, capped: total > MAX_ENERGY };
  });
}

// !spin: taruhan dipotong dulu, lalu dibayar total `payout` (0, 2x, atau 3x taruhan)
export function playSpin(id, bet, payout) {
  return updateUser(id, (u) => {
    if (bet < 1 || u.energy < bet) return { ok: false, energy: u.energy };
    const before = u.energy;
    const afterBet = u.energy - bet;
    const total = afterBet + payout;
    u.energy = clampEnergy(total);
    return { ok: true, before, after: u.energy };
  });
}
