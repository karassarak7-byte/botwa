// ai.js — cache chat grup (30 pesan teks terakhir per grup) dan panggilan Gemini untuk !ai, !tanya, !rangkum, !tldr.
// Memakai fetch bawaan Node, tanpa paket tambahan. Kunci API dari AI_API_KEY di .env.
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
} catch {
  // .env belum ada: pakai environment yang sudah ada
}

const MODEL = 'gemini-2.5-flash';
const CACHE_MAX = 30; // jumlah pesan maksimal per grup (FIFO)

// groupJid -> [{ senderName, text, timestamp }]
export const groupChatCache = new Map();

// Simpan pesan teks grup. Pesan kosong dibuang; pesan ke-31 menghapus yang paling lama.
export function recordGroupMessage(groupJid, senderName, text, timestamp = Date.now()) {
  const clean = (text || '').trim();
  if (!clean) return;
  let list = groupChatCache.get(groupJid);
  if (!list) {
    list = [];
    groupChatCache.set(groupJid, list);
  }
  list.push({ senderName, text: clean, timestamp });
  if (list.length > CACHE_MAX) list.splice(0, list.length - CACHE_MAX);
}

// Ambil `count` pesan terakhir dari grup (urut dari yang lama)
export function getRecentMessages(groupJid, count) {
  const list = groupChatCache.get(groupJid) ?? [];
  return list.slice(-count);
}

// Kirim prompt ke Gemini. Melempar error dengan code AI_FAILED atau AI_NO_KEY.
export async function askAI(systemInstruction, prompt) {
  const key = process.env.AI_API_KEY;
  if (!key) throw Object.assign(new Error('AI belum dikonfigurasi (AI_API_KEY kosong)'), { code: 'AI_NO_KEY' });

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    const msg = e?.name === 'TimeoutError' ? 'AI tidak merespons (timeout)' : 'AI tidak bisa dihubungi';
    throw Object.assign(new Error(msg), { code: 'AI_FAILED' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`AI menolak permintaan (kode ${res.status})`), { code: 'AI_FAILED' });
  }
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw Object.assign(new Error('AI mengembalikan jawaban kosong'), { code: 'AI_FAILED' });
  return text;
}
