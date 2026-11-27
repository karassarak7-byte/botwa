// index.js — Bot WhatsApp: !menu !ping !energi !sticker !claim !spin
// Login: QR di terminal (qrcode) dan halaman status/QR di port panel.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startGame, takeClue, guess, giveUp, categories, prizeFor, formatClues } from './tebakkata.js';
import { initWerewolf, handleWW, handleVote, handleWWDM, WW_DM_CMDS } from './werewolf.js';
import { countCall, markGreeted } from './database.js';
import { askAI, groupChatCache, recordGroupMessage, getRecentMessages } from './ai.js';

const execFileAsync = promisify(execFile);

// Foto jadi stiker WebP statis 512x512 (crop persegi di tengah). Kualitas diturunkan jika ukuran masih terlalu besar.
async function imageToSticker(input) {
  const dir = await mkdtemp(join(tmpdir(), 'stk-'));
  const inFile = join(dir, 'in.img');
  const outFile = join(dir, 'out.webp');
  try {
    await writeFile(inFile, input);
    for (const quality of ['80', '50', '30']) {
      await execFileAsync('ffmpeg', [
        '-y', '-v', 'error', '-i', inFile, '-frames:v', '1',
        '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba',
        '-c:v', 'libwebp', '-quality', quality, outFile,
      ], { timeout: 60000 });
      const out = await readFile(outFile);
      if (out.length <= STICKER_MAX_OUTPUT_BYTES) return out;
    }
    throw Object.assign(new Error('stiker foto terlalu besar'), { code: 'STICKER_TOO_LARGE' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Potong video ke persegi di tengah (center crop) lalu ubah ke 512x512, dipotong 6 detik, audio tetap ada.
async function cropSquareVideo(input) {
  const dir = await mkdtemp(join(tmpdir(), 'stk-'));
  const inFile = join(dir, 'in.mp4');
  const outFile = join(dir, 'out.mp4');
  try {
    await writeFile(inFile, input);
    await execFileAsync('ffmpeg', [
      '-y', '-v', 'error', '-i', inFile, '-t', String(STICKER_CUT_SECONDS),
      '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,setsar=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', outFile,
    ], { timeout: 60000 });
    return await readFile(outFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Font Liberation Sans (metrik sama dengan Arial) dari folder fonts/, dibaca fontconfig untuk stiker brat
process.env.FONTCONFIG_FILE = new URL('./fonts/fonts.conf', import.meta.url).pathname;
const sharp = (await import('sharp')).default;
const lib = await import('@xbibzlibrary/whatsbibz');
const pino = (await import('pino')).default;
const QRCode = (await import('qrcode')).default;
const db = await import('./database.js');

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadVideoForSoundSticker,
  downloadMediaMessage,
} = lib;
const { getUser, spendEnergy, refundEnergy, claimEnergy, playSpin, setEnergy, findUser, addEnergy, MAX_ENERGY, CLAIM_COOLDOWN_MS } = db;

// Nomor pengendali bot (format Indonesia, 0 atau 62). Pengendali tanpa jeda, sticker gratis, dan punya !setenergi & !cekuser.
const OWNER_NUMBERS = new Set(['6289692853559']);

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 10775);
const COOLDOWN_MS = 2000;        // jeda antar perintah per pengguna
const STICKER_COST = 3;          // biaya !sticker
const STICKER_MAX_SECONDS = 10;  // durasi video input maksimal (library juga harus dipatch, lihat patch-fps.mjs)
const STICKER_CUT_SECONDS = 7;   // hasil stiker dipotong 7 detik (video rumit bisa gagal STICKER_TOO_LARGE jika lebih dari 500 KiB)
const STICKER_MAX_INPUT_BYTES = 2 * 1024 * 1024; // ukuran maksimal video atau foto yang dijadikan stiker (2 MB)
const STICKER_MAX_OUTPUT_BYTES = 500 * 1024;     // batas ukuran stiker foto WebP
const SYMBOLS = ['🍒', '💎', '⚡', '🎰', '🍋'];

let qrDataUrl = null;
let status = 'Memulai...';
let connected = false;
let retryTimer = null;
const sentIds = new Set();        // id balasan bot, supaya tidak diproses ulang
const lastCommandAt = new Map();  // waktu perintah terakhir per pengguna (cooldown)

// ---------- Halaman status + QR di port panel ----------
createServer((req, res) => {
  if (req.url.startsWith('/qr.png') && qrDataUrl) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return res.end(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
  }
  const refresh = connected ? '' : '<meta http-equiv="refresh" content="5">';
  const img = qrDataUrl ? `<img src="/qr.png?t=${Date.now()}" width="320" height="320">` : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8">${refresh}<title>Bot WhatsApp</title></head>
<body style="font-family:sans-serif;text-align:center;padding:24px">
<h2>Bot WhatsApp</h2><p>${status}</p>${img}</body></html>`);
}).listen(PORT, '0.0.0.0', () => console.log(`Halaman status/QR aktif di port ${PORT}`));

// ---------- Helper ----------
// Buang suffix device, contoh "628123:5@s.whatsapp.net" jadi "628123@s.whatsapp.net"
function bareJid(jid) {
  if (!jid) return '';
  const [user, server] = jid.split('@');
  return `${user.split(':')[0]}@${server}`;
}

function getText(m) {
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
}

function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)} menit ${s % 60} detik`;
}

// true = masih dalam jeda; false = perintah diterima dan waktunya dicatat
function isOnCooldown(key, now) {
  if (now - (lastCommandAt.get(key) ?? 0) < COOLDOWN_MS) return true;
  lastCommandAt.set(key, now);
  return false;
}

async function reply(sock, msg, text) {
  const sent = await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
  if (sent?.key?.id) {
    sentIds.add(sent.key.id);
    if (sentIds.size > 1000) sentIds.clear();
  }
  return sent;
}

function explainError(e) {
  switch (e?.code) {
    case 'NO_AUDIO': return 'video ini tidak punya audio. Sound sticker wajib ada suara.';
    case 'SILENT_AUDIO': return 'audio video hening, sticker tidak dibuat.';
    case 'TOO_LONG': return `durasi video maksimal ${STICKER_MAX_SECONDS} detik.`;
    case 'VIEW_ONCE_REJECTED': return 'video sekali lihat tidak didukung.';
    case 'VIDEO_METADATA_MISSING': return 'data video tidak lengkap. Minta pengirim kirim ulang.';
    case 'VIDEO_DOWNLOAD_FAILED':
    case 'MEDIA_INTEGRITY_FAILED': return 'gagal mengunduh video. Minta pengirim kirim ulang.';
    case 'UNSUPPORTED_VIDEO': return 'hanya video MP4/MOV yang didukung.';
    case 'VIDEO_TOO_LARGE':
    case 'TOO_BIG': return 'ukuran maksimal 2 MB.';
    case 'FFMPEG_NOT_FOUND': return 'ffmpeg tidak ditemukan di server.';
    case 'FFMPEG_TIMEOUT': return 'proses video terlalu lama, coba video yang lebih pendek.';
    case 'STICKER_TOO_LARGE': return 'video terlalu berat untuk stiker animasi (maks 500 KiB). Coba video yang lebih pendek atau gerakannya lebih sederhana.';
    default: return e?.message || 'terjadi kesalahan tidak diketahui.';
  }
}

function buildMenu(energy) {
  return `╭━━━━━━━━━━━━━━━━━━━╮
   🤖  *MENU BOT*
╰━━━━━━━━━━━━━━━━━━━╯
⚡ Energi kamu: *${energy} / ${MAX_ENERGY}*

┏━ 📌 *UMUM* _(gratis)_
┃ • !menu / !help
┃ • !ping
┃ • !energi / !cek
┃ • !claim — +15 ⚡ tiap 1 jam
┗━━━━━━━━━━━━━━━━━━━

┏━ 🎞️ *STIKER*
┃ • !sticker / !s — *${STICKER_COST} ⚡*
┃   video (maks ${STICKER_MAX_SECONDS} dtk, wajib ada audio)
┃   atau foto, ukuran maks 2 MB
┃ • !brat <teks> — *2 ⚡*
┃   stiker teks putih, maks 100 karakter
┗━━━━━━━━━━━━━━━━━━━

┏━ 🎲 *GAME TEBAK & JUDI*
┃ • !spin <jumlah> / !spin all
┃   judi energi, biaya = taruhan
┃ • !tebak [kategori] — hadiah 20 ⚡ _(gratis)_
┃   kategori: hewan, tempat, negara,
┃   buah, profesi, benda
┃ • !jawab <jawaban>
┃ • !clue — hadiah turun 20% tiap clue
┃ • !menyerah
┗━━━━━━━━━━━━━━━━━━━

┏━ 🧠 *GRUP*
┃ • !rangkum [jumlah] / !tldr — *5 ⚡*
┃   rangkum obrolan grup, default 30,
┃   maks 30 pesan terakhir (khusus grup)
┗━━━━━━━━━━━━━━━━━━━

┏━ 🐺 *WEREWOLF* _(di grup)_
┃ • !ww create — buka lobi (min 4 pemain)
┃ • !ww join / !ww leave
┃ • !ww start — peran dikirim lewat DM
┃ • !ww status
┃ • !ww stop
┃ • !vote <nomor>
┃ • Aksi malam lewat DM:
┃   !kill !infect !cek !heal !shoot !stab <nomor>
┃ • Pemenang dapat +20 ⚡
┗━━━━━━━━━━━━━━━━━━━

_Jeda 2 detik antar perintah • Batas energi ${MAX_ENERGY} ⚡_`;
}

// ---------- Stiker teks gaya brat ----------
const BRAT_COST = 2;        // biaya !brat
const BRAT_MAX_CHARS = 100; // batas panjang teks

// Pecah teks per kata sesuai lebar. Kata utuh tidak dipotong, kecuali kata itu sendiri lebih panjang dari satu baris.
function wrapText(text, fontSize, maxWidth) {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.6)));
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ` ${w}`;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Teks rata kiri gaya brat: font Arial-like (Liberation Sans Bold), diregangkan vertikal,
// lalu dibuat pixelated dan sedikit blur. Ukuran font diturunkan sampai muat di kanvas 512x512.
const BRAT_SX = 0.8;  // lebar huruf (lebih sempit)
const BRAT_SY = 1.3;  // tinggi huruf (diregangkan ke atas)
const BRAT_WATERMARK = 'bot by nuzzelll';  // tulisan wm di stiker brat
async function bratSticker(text, background) {
  const size = 512, pad = 36, maxW = size - pad * 2;
  let fontSize = 36, lines = [];
  for (let fs = 120; fs >= 20; fs -= 4) {
    const l = wrapText(text, fs, maxW);
    fontSize = fs; lines = l;
    if (l.length * fs * 1.05 * BRAT_SY <= maxW) break;
  }
  const lineH = fontSize * 1.05 * BRAT_SY;
  const top = (size - lines.length * lineH) / 2;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tspans = lines.map((l, i) =>
    `<text x="0" y="0" transform="translate(${pad} ${top + fontSize * 0.9 * BRAT_SY + i * lineH}) scale(${BRAT_SX} ${BRAT_SY})" font-size="${fontSize}" font-weight="700">${esc(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<rect width="100%" height="100%" fill="${background}"/>
<g font-family="Liberation Sans, Arial, Helvetica, sans-serif" fill="#000000">${tspans}</g></svg>`;
  // Pixelated: turunkan ke 64 px, lalu naikkan lagi dengan nearest supaya kotak-kotak terlihat
  const base = await sharp(Buffer.from(svg))
    .resize(64, 64)
    .resize(size, size, { kernel: sharp.kernel.nearest })
    .blur(0.6)
    .png()
    .toBuffer();
  // Nama pack dan publisher disimpan sebagai metadata WebP (EXIF), muncul saat stiker disimpan
  const webp = await sharp(base).webp().toBuffer();
  return addStickerExif(webp, BRAT_WATERMARK, BRAT_WATERMARK, size, size);
}

// Tambah metadata WhatsApp (EXIF chunk berisi nama pack dan publisher) ke file WebP
function addStickerExif(webp, packName, author, width, height) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': `brat-${Date.now()}`,
    'sticker-pack-name': packName,
    'sticker-pack-publisher': author,
    emojis: ['🎨'],
  }));
  const head = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  head.writeUInt32LE(json.length, 14);
  const exif = Buffer.concat([head, json]);
  // Pecah chunk WebP yang sudah ada
  const chunks = [];
  for (let p = 12; p + 8 <= webp.length; ) {
    const len = webp.readUInt32LE(p + 4);
    chunks.push({ type: webp.toString('ascii', p, p + 4), data: webp.subarray(p + 8, p + 8 + len) });
    p += 8 + len + (len % 2);
  }
  // Header VP8X: bit EXIF (0x08) dan alpha (0x10) dinyalakan
  const old = chunks.find((c) => c.type === 'VP8X');
  let vp8x;
  if (old) { vp8x = Buffer.from(old.data); vp8x[0] |= 0x08; }
  else {
    vp8x = Buffer.alloc(10);
    vp8x[0] = 0x18;
    vp8x.writeUIntLE(width - 1, 4, 3);
    vp8x.writeUIntLE(height - 1, 7, 3);
  }
  const rest = chunks.filter((c) => c.type !== 'VP8X' && c.type !== 'EXIF');
  const all = [{ type: 'VP8X', data: vp8x }, ...rest, { type: 'EXIF', data: exif }];
  const parts = all.map((c) => {
    const hdr = Buffer.alloc(8);
    hdr.write(c.type, 0, 'ascii');
    hdr.writeUInt32LE(c.data.length, 4);
    return Buffer.concat([hdr, c.data, c.data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  });
  const body = Buffer.concat([Buffer.from('WEBP'), ...parts]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

// Kirim sound sticker (stiker animasi + audio) dengan metadata nama pack "bot by nuzzelll", sama seperti brat.
async function sendSoundSticker(sock, jid, video, quoted) {
  const converted = await lib.convertVideoToSoundSticker(video, { timeoutMs: 60000 });
  const webp = addStickerExif(converted.sticker, BRAT_WATERMARK, BRAT_WATERMARK, 512, 512);
  const { stickerMessage } = await lib.prepareWAMessageMedia({
    sticker: webp, mimetype: 'image/webp', width: 512, height: 512, isAnimated: true,
  }, { upload: sock.waUploadToServer });
  const { audioMessage } = await lib.prepareWAMessageMedia({
    audio: converted.audio, mimetype: 'audio/ogg; codecs=opus', seconds: converted.seconds, ptt: false,
  }, { upload: sock.waUploadToServer });
  if (!stickerMessage?.directPath || !audioMessage?.directPath) throw Object.assign(new Error('upload gagal'), { code: 'UPLOAD_FAILED' });
  stickerMessage.audioMessage = audioMessage;
  const quotedCopy = quoted
    ? lib.proto.WebMessageInfo.decode(lib.proto.WebMessageInfo.encode(lib.proto.WebMessageInfo.fromObject(quoted)).finish())
    : undefined;
  const full = lib.generateWAMessageFromContent(jid, { audioStickerMessage: { message: { stickerMessage } } }, {
    userJid: sock.user.id, quoted: quotedCopy,
  });
  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
}

async function handleBrat(sock, msg, jid, sender, args, cmd) {
  const ctx = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = ctx?.conversation || ctx?.extendedTextMessage?.text || '';
  const text = (args.join(' ').trim() || quotedText.trim());
  if (!text) {
    return reply(sock, msg, `Contoh: *${cmd} teks yang mau dijadikan stiker*\n(atau balas pesan teks dengan *${cmd}*)`);
  }
  if ([...text].length > BRAT_MAX_CHARS) {
    return reply(sock, msg, `Teks terlalu panjang, maksimal ${BRAT_MAX_CHARS} karakter. Energi tidak dipotong.`);
  }
  const spend = await spendEnergy(sender, BRAT_COST);
  if (!spend.ok) {
    return reply(sock, msg, `Energi kurang. Stiker teks butuh ${BRAT_COST} ⚡, sisa kamu ${spend.energy} ⚡.\nCoba *!claim* (gratis) atau *!spin*.`);
  }
  try {
    const webp = await bratSticker(text, '#FFFFFF');
    await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
    console.log(`Stiker brat terkirim ke ${sender}`);
  } catch (e) {
    console.error('Brat gagal:', e?.message);
    await refundEnergy(sender, BRAT_COST).catch((err) => console.error('Refund gagal:', err));
    await reply(sock, msg, `Gagal membuat stiker teks: ${e?.message || 'kesalahan tidak diketahui'}\n${BRAT_COST} ⚡ sudah dikembalikan.`);
  }
}

// ---------- AI dan rangkuman grup ----------
const RANGKUM_COST = 5;         // biaya !rangkum / !tldr
const RANGKUM_DEFAULT = 30;
const RANGKUM_MIN = 5;
const RANGKUM_MAX = 30;
const RANGKUM_SYSTEM = 'Kamu merangkum obrolan grup. Tulis topik utama diskusi dalam poin-poin singkat, bahasa Indonesia santai dan mudah dibaca. Format WhatsApp: *tebal*, _miring_, poin dengan tanda "•". Jangan pakai heading markdown. Sebut nama orang bila relevan.';

async function handleRangkum(sock, msg, jid, sender, args) {
  if (!jid.endsWith('@g.us')) return reply(sock, msg, 'Perintah *!rangkum* hanya bisa dipakai di grup.');
  let n = Number(args[0] ?? RANGKUM_DEFAULT);
  if (!Number.isFinite(n)) n = RANGKUM_DEFAULT;
  n = Math.min(RANGKUM_MAX, Math.max(RANGKUM_MIN, Math.floor(n)));
  if ((groupChatCache.get(jid)?.length ?? 0) < RANGKUM_MIN) {
    return reply(sock, msg, `Belum cukup pesan di grup ini untuk dirangkum (minimal ${RANGKUM_MIN} pesan sejak bot aktif). Energi tidak dipotong.`);
  }
  const messages = getRecentMessages(jid, n);
  const spend = await spendEnergy(sender, RANGKUM_COST);
  if (!spend.ok) {
    return reply(sock, msg, `Energi kurang. Rangkuman butuh ${RANGKUM_COST} ⚡, sisa kamu ${spend.energy} ⚡.\nCoba *!claim* (gratis) atau *!spin*.`);
  }
  await reply(sock, msg, `Sedang merangkum ${messages.length} pesan terakhir... 📝`);
  try {
    const transcript = messages.map((m) => `[${m.senderName}]: ${m.text}`).join('\n');
    const summary = await askAI(RANGKUM_SYSTEM, `Rangkum obrolan berikut:\n\n${transcript}`);
    await sock.sendMessage(jid, { text: `📝 *Rangkuman ${messages.length} pesan terakhir*\n\n${summary}` }, { quoted: msg });
  } catch (e) {
    console.error('Rangkum gagal:', e?.code, e?.message);
    await refundEnergy(sender, RANGKUM_COST).catch((err) => console.error('Refund gagal:', err));
    await reply(sock, msg, `Gagal merangkum: ${e?.message || 'kesalahan tidak diketahui'}\n${RANGKUM_COST} ⚡ sudah dikembalikan.`);
  }
}

// ---------- Perintah ----------
async function handleSticker(sock, msg, jid, sender, owner) {
  const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
  const video = msg.message.videoMessage || quoted?.videoMessage;
  const image = msg.message.imageMessage || quoted?.imageMessage;
  if (!video && !image) {
    return reply(sock, msg, 'Kirim video atau foto dengan caption *!sticker*, atau balas video/foto dengan *!sticker*.');
  }
  // Cek ukuran dulu, sebelum energi dipotong
  const mediaSize = Number((video || image).fileLength?.toString?.() ?? 0);
  if (mediaSize > STICKER_MAX_INPUT_BYTES) {
    return reply(sock, msg, 'Gagal membuat sticker: ukuran maksimal 2 MB. Energi tidak dipotong.');
  }

  // Potong energi dulu; kalau gagal nanti, energi dikembalikan
  if (!owner) {
    const spend = await spendEnergy(sender, STICKER_COST);
    if (!spend.ok) {
      return reply(sock, msg, `Energi kurang. Sticker butuh ${STICKER_COST} ⚡, sisa kamu ${spend.energy} ⚡.\nCoba *!claim* (gratis) atau *!spin*.`);
    }
  }

  try {
    await reply(sock, msg, 'Sedang membuat sticker... ⏳');
    if (!video) {
      // Foto: unduh lalu jadikan stiker WebP statis
      const ctx = msg.message.extendedTextMessage?.contextInfo;
      const source = msg.message.imageMessage
        ? msg
        : { key: { remoteJid: jid, id: ctx?.stanzaId, participant: ctx?.participant }, message: quoted };
      const photo = await downloadMediaMessage(source, 'buffer', {});
      if (photo.length > STICKER_MAX_INPUT_BYTES) throw Object.assign(new Error('foto terlalu besar'), { code: 'TOO_BIG' });
      const webp = await imageToSticker(photo);
      await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
      console.log(`Sticker foto terkirim ke ${sender}`);
      return;
    }
    if (Number(video.seconds) > STICKER_MAX_SECONDS) {
      throw Object.assign(new Error('video terlalu panjang'), { code: 'TOO_LONG' });
    }
    const buffer = await downloadVideoForSoundSticker(msg, { timeoutMs: 60000 });
    if (buffer.length > STICKER_MAX_INPUT_BYTES) throw Object.assign(new Error('video terlalu besar'), { code: 'TOO_BIG' });
    const square = await cropSquareVideo(buffer);
    await sendSoundSticker(sock, jid, square, msg);
    console.log(`Sound sticker terkirim ke ${sender}`);
  } catch (e) {
    console.error('Sticker gagal:', e?.code, e?.message);
    if (!owner) await refundEnergy(sender, STICKER_COST).catch((err) => console.error('Refund gagal:', err));
    const refundNote = owner ? '' : `\n${STICKER_COST} ⚡ sudah dikembalikan.`;
    await reply(sock, msg, `Gagal membuat sticker: ${explainError(e)}${refundNote}`);
  }
}

async function handleClaim(sock, msg, sender) {
  const r = await claimEnergy(sender, Date.now());
  if (r.full) return reply(sock, msg, `Energi kamu sudah penuh (${MAX_ENERGY} ⚡), belum perlu klaim.`);
  if (!r.ok) {
    return reply(sock, msg, `⏳ Klaim belum tersedia. Tunggu ${formatWait(r.waitMs)} lagi.`);
  }
  return reply(sock, msg, `🎁 Klaim berhasil! +${r.after - r.before} ⚡ (${r.before} → ${r.after} / ${MAX_ENERGY} ⚡)`);
}

async function handleStatus(sock, msg, sender) {
  const user = await getUser(sender);
  const readyIn = user.lastClaim + CLAIM_COOLDOWN_MS - Date.now();
  const claim = readyIn > 0 ? `⏳ Tunggu ${formatWait(readyIn)} lagi` : '✅ Siap diklaim (!claim)';
  return reply(sock, msg, `*📊 STATUS AKUN*\nEnergi: *${user.energy} / ${MAX_ENERGY} ⚡*\nKlaim: ${claim}`);
}

// Hasil acak: 45% kalah, 40% menang 2x, 15% jackpot 3x (total yang dibayar)
function pickMultiplier() {
  const r = Math.random();
  if (r < 0.45) return 0;
  if (r < 0.85) return 2;
  return 3;
}

// Susunan slot sesuai hasil: kalah = tiga beda, menang = dua sama, jackpot = tiga sama
function reelsFor(mult) {
  const pick = (exclude) => {
    const pool = SYMBOLS.filter((s) => !exclude.includes(s));
    return pool[Math.floor(Math.random() * pool.length)];
  };
  if (mult === 3) return ['💎', '💎', '💎'];
  if (mult === 2) {
    const a = pick([]);
    const b = pick([a]);
    const reels = [a, a, b];
    return reels.sort(() => Math.random() - 0.5);
  }
  const a = pick([]);
  const b = pick([a]);
  const c = pick([a, b]);
  return [a, b, c];
}

async function handleSpin(sock, msg, sender, args) {
  const arg = (args[0] ?? '').toLowerCase();
  const user = await getUser(sender);

  let bet;
  if (arg === 'all') bet = user.energy;
  else if (/^\d+$/.test(arg) && Number(arg) >= 1) bet = Number(arg);
  else return reply(sock, msg, 'Format salah. Pakai *!spin <jumlah>* atau *!spin all*. Contoh: !spin 10');

  if (user.energy < 1) return reply(sock, msg, 'Energi kamu 0 ⚡, tidak bisa bertaruh. Coba *!claim* dulu.');
  if (bet > user.energy) return reply(sock, msg, `Taruhan melebihi energi kamu. Sisa energi: ${user.energy} ⚡`);

  const mult = pickMultiplier();
  const r = await playSpin(sender, bet, bet * mult);
  if (!r.ok) return reply(sock, msg, `Energi tidak cukup. Sisa energi: ${r.energy} ⚡`);

  let outcome;
  if (mult === 0) outcome = `💀 Kalah! ${bet} ⚡ hangus.`;
  else if (mult === 2) outcome = `✅ Menang 2x! Kamu dapat ${bet * 2} ⚡ (untung +${bet}).`;
  else outcome = `💎 JACKPOT 3x! Kamu dapat ${bet * 3} ⚡ (untung +${bet * 2}).`;

  const cap = r.capped ? `\n_Dibatasi maksimal ${MAX_ENERGY} ⚡._` : '';
  return reply(sock, msg,
    `🎰 | ${reelsFor(mult).join(' | ')} | 🎰\n${outcome}\nTaruhan: ${bet} ⚡\nEnergi: ${r.before} → ${r.after} / ${MAX_ENERGY} ⚡${cap}`);
}

// ---------- Tebak kata ----------
const GAME_HINT = '_Ketik *!jawab <jawaban>*, *!clue* (hadiah turun 20%), atau *!menyerah*._';

async function handleTebak(sock, msg, sender, args) {
  const r = startGame(sender, args[0], Date.now());
  if (!r.ok) return reply(sock, msg, `Kategori tidak ada. Pilih: ${categories().join(', ')}.\nAtau ketik *!tebak* saja untuk acak.`);
  const s = r.session;
  const head = r.resumed ? '🔁 Tebakan kamu masih berjalan.' : `🎯 *TEBAK KATA* (kategori: ${s.kategori})`;
  return reply(sock, msg, `${head}\n\n${formatClues(s)}\n\nHadiah saat ini: *${prizeFor(s.shown)} ⚡*\n${GAME_HINT}`);
}

async function handleJawab(sock, msg, sender, args) {
  if (!args.length) return reply(sock, msg, 'Format: *!jawab <jawaban>*. Contoh: !jawab kucing');
  const r = guess(sender, args.join(' '), Date.now());
  if (r.status === 'none') return reply(sock, msg, 'Belum ada tebakan. Ketik *!tebak* dulu.');
  if (r.status === 'wrong') return reply(sock, msg, `❌ Belum tepat. Coba lagi, atau ketik *!clue* / *!menyerah*.`);
  const u = await addEnergy(sender, r.prize);
  return reply(sock, msg, `🎉 Benar! Jawabannya *${r.answer}*.\nHadiah +${r.prize} ⚡, sisa energi kamu ${u.energy} ⚡.`);
}

async function handleClue(sock, msg, sender) {
  const r = takeClue(sender, Date.now());
  if (r.status === 'none') return reply(sock, msg, 'Belum ada tebakan. Ketik *!tebak* dulu.');
  if (r.status === 'max') return reply(sock, msg, 'Clue sudah habis (3/3). Jawab dengan *!jawab <jawaban>* atau ketik *!menyerah*.');
  return reply(sock, msg, `${formatClues(r.session)}\n\nClue ${r.shown} dibuka. Hadiah sekarang *${r.prize} ⚡*.\n${GAME_HINT}`);
}

async function handleMenyerah(sock, msg, sender) {
  const r = giveUp(sender, Date.now());
  if (r.status === 'none') return reply(sock, msg, 'Tidak ada tebakan yang sedang berjalan.');
  return reply(sock, msg, `🏳️ Kamu menyerah. Jawabannya adalah *${r.answer}*.\nKetik *!tebak* untuk main lagi.`);
}

// ---------- Pengendali ----------
// Cek apakah pengirim adalah pengendali. Cek nomor telepon dan LID (kalau Baileys mengirim alternatifnya).
function isOwner(msg) {
  const ids = [msg.key.participant, msg.key.remoteJid, msg.key.participantAlt, msg.key.remoteJidAlt].filter(Boolean);
  return ids.some((j) => OWNER_NUMBERS.has(bareJid(j).split('@')[0]));
}

// "0896..." atau "62896..." jadi "62896...@s.whatsapp.net", null jika tidak valid
function parseNumber(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return /^\d{9,15}$/.test(d) ? `${d}@s.whatsapp.net` : null;
}

async function handleSetEnergy(sock, msg, args) {
  const jid = parseNumber(args[0]);
  const amount = Number(args[1]);
  if (!jid || !Number.isInteger(amount) || amount < 0 || amount > MAX_ENERGY) {
    return reply(sock, msg, `Format: *!setenergi <nomor> <0-${MAX_ENERGY}>*. Contoh: !setenergi 089692853559 50`);
  }
  const r = await setEnergy(jid, amount);
  return reply(sock, msg, `✅ Energi ${args[0]} diatur ke ${r.energy} ⚡`);
}

async function handleCekUser(sock, msg, args) {
  const jid = parseNumber(args[0]);
  if (!jid) return reply(sock, msg, 'Format: *!cekuser <nomor>*. Contoh: !cekuser 089692853559');
  const u = await findUser(jid);
  if (!u) return reply(sock, msg, `Nomor ${args[0]} belum pernah memakai bot.`);
  const readyIn = u.lastClaim + CLAIM_COOLDOWN_MS - Date.now();
  const claim = readyIn > 0 ? `tunggu ${formatWait(readyIn)}` : 'siap diklaim';
  const joined = new Date(u.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return reply(sock, msg, `*👤 DATA USER*\nNomor: ${args[0]}\nEnergi: ${u.energy} / ${MAX_ENERGY} ⚡\nKlaim: ${claim}\nTerdaftar: ${joined}`);
}

// ---------- Handler pesan ----------
async function handleMessage(sock, msg) {
  if (!msg?.message || !msg.key) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
  if (msg.key.id && sentIds.has(msg.key.id)) return;

  // Pesan dari diri sendiri hanya diproses di self-chat (chat ke diri sendiri)
  if (msg.key.fromMe) {
    const selfJids = [sock.user?.id, sock.user?.lid].filter(Boolean).map(bareJid);
    if (!selfJids.includes(bareJid(jid))) return;
  }

  // Sapaan sekali untuk chat pribadi baru (bukan grup, bukan pesan dari diri sendiri)
  if (!jid.endsWith('@g.us') && !msg.key.fromMe && await markGreeted(bareJid(jid))) {
    await reply(sock, msg, 'Halo! 👋 Aku bot WA. Ketik *!menu* untuk melihat semua perintah.');
  }

  const text = getText(msg.message).trim();
  if (!text.startsWith('!')) return;
  console.log(`[debug] perintah dari jid=${jid} fromMe=${msg.key.fromMe} isi="${text.slice(0, 30)}"`);
  const [rawCmd, ...args] = text.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  // Pengirim: participant di grup, remoteJid di chat pribadi / self-chat
  const sender = bareJid(msg.key.participant || jid);
  const owner = isOwner(msg);
  if (!owner && isOnCooldown(sender, Date.now())) return; // pengendali tanpa jeda

  // Werewolf: lobi dan voting di grup, aksi malam lewat DM
  const rawSender = msg.key.participant || jid;
  if (jid.endsWith('@g.us') && (cmd === 'ww' || cmd === 'vote')) {
    const out = cmd === 'ww' ? await handleWW(jid, rawSender, args, msg.pushName) : await handleVote(jid, rawSender, args);
    return out ? reply(sock, msg, out) : undefined;
  }
  if (!jid.endsWith('@g.us') && WW_DM_CMDS.includes(cmd)) {
    const out = await handleWWDM(rawSender, cmd, args);
    if (out) return reply(sock, msg, out);
  }

  const t0 = Date.now();
  switch (cmd) {
    case 'menu':
    case 'help': {
      const user = await getUser(sender);
      return reply(sock, msg, buildMenu(user.energy));
    }
    case 'ping': {
      const user = await getUser(sender);
      return reply(sock, msg, `Pong! 🏓 | Kecepatan: ${Date.now() - t0} ms | Sisa Energi: ${user.energy} ⚡`);
    }
    case 'energi':
    case 'cek':
      return handleStatus(sock, msg, sender);
    case 'claim':
      return handleClaim(sock, msg, sender);
    case 'sticker':
    case 's':
      return handleSticker(sock, msg, jid, sender, owner);
    case 'brat':
      return handleBrat(sock, msg, jid, sender, args, '!brat');
    case 'rangkum':
    case 'tldr':
      return handleRangkum(sock, msg, jid, sender, args);
    case 'spin':
      return handleSpin(sock, msg, sender, args);
    case 'tebak':
      return handleTebak(sock, msg, sender, args);
    case 'jawab':
      return handleJawab(sock, msg, sender, args);
    case 'clue':
    case 'petunjuk':
      return handleClue(sock, msg, sender);
    case 'menyerah':
      return handleMenyerah(sock, msg, sender);
    case 'setenergi':
    case 'cekuser':
      if (!owner) return reply(sock, msg, 'Perintah ini hanya untuk pengendali bot.');
      return cmd === 'setenergi' ? handleSetEnergy(sock, msg, args) : handleCekUser(sock, msg, args);
    default:
      return; // perintah tidak dikenal: diam
  }
}

// ---------- Koneksi WhatsApp ----------
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    autoFollowChannel: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // Panggilan ke bot: tolak, peringatan pertama, lalu blokir jika menelpon lagi
  const handledCalls = new Set();
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer' || call.isGroup || handledCalls.has(call.id)) continue;
      handledCalls.add(call.id);
      await sock.rejectCall(call.id, call.from).catch((e) => console.error('[call] tolak gagal:', e.message));
      const count = await countCall(bareJid(call.from));
      if (count === 1) {
        await sock.sendMessage(call.from, {
          text: '⚠️ Jangan menelpon bot ini. Ini peringatan pertama. Jika menelpon lagi, nomormu akan diblokir.',
        }).catch((e) => console.error('[call] peringatan gagal:', e.message));
      } else {
        await sock.updateBlockStatus(call.from, 'block')
          .catch((e) => console.error('[call] blokir gagal:', e.message));
        console.log('[call] diblokir karena menelpon lagi:', bareJid(call.from));
      }
    }
  });

  // Sapaan member baru grup
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action !== 'add') return;
    const meta = await sock.groupMetadata(id).catch(() => null);
    const name = meta?.subject ?? 'grup ini';
    const self = [sock.user?.id, sock.user?.lid].filter(Boolean).map(bareJid);
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id;
      if (!jid || self.includes(bareJid(jid))) continue;
      const num = jid.split('@')[0].split(':')[0];
      await sock.sendMessage(id, {
        text: `Selamat datang @${num} di *${name}* 👋\nKetik *!menu* untuk melihat perintah bot.`,
        mentions: [jid],
      }).catch((e) => console.error('[sambut] gagal:', e.message));
    }
  });
  initWerewolf({ sock, addEnergy });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
      qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
      status = 'Scan QR di WhatsApp > Perangkat tertaut > Tautkan perangkat.';
    }

    if (connection === 'open') {
      console.log('[debug] akun bot:', sock.user?.id, 'lid:', sock.user?.lid);
      connected = true;
      qrDataUrl = null;
      status = 'Terhubung ke WhatsApp.';
      console.log('WhatsApp terhubung.');
    }

    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        status = 'Perangkat dikeluarkan dari WhatsApp. Hapus folder auth lalu restart untuk scan ulang.';
        console.log('Logged out dari WhatsApp. Hapus folder auth dan scan ulang.');
        return; // jangan reconnect: sesi sudah tidak valid
      }
      status = 'Koneksi putus, mencoba lagi...';
      console.log('Koneksi putus, mencoba lagi. Kode:', code);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => start().catch((e) => console.error('Start gagal:', e)), 3000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      // Catat pesan teks grup untuk !rangkum (bukan dari bot sendiri, bukan perintah)
      const gjid = msg.key?.remoteJid;
      if (gjid?.endsWith('@g.us') && !msg.key.fromMe && msg.message) {
        const t = getText(msg.message).trim();
        if (t && !t.startsWith('!')) {
          const who = msg.key.participant || gjid;
          recordGroupMessage(gjid, msg.pushName || who.split('@')[0].split(':')[0], t, Number(msg.messageTimestamp) * 1000 || Date.now());
        }
      }
      handleMessage(sock, msg).catch((e) => console.error('Handler error:', e));
    }
  });
}

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));

start().catch((e) => console.error('Start gagal:', e));
