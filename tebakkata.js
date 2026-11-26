// tebakkata.js — logika permainan tebak kata (tanpa WhatsApp, tanpa database).
// Sesi disimpan di memori: hilang saat bot restart.

export const BASE_PRIZE = 20;      // hadiah (energi) saat clue pertama
export const CLUE_PENALTY = 0.2;   // tiap clue tambahan mengurangi 20% dari hadiah dasar
export const MAX_CLUES = 3;        // jumlah clue per kata
export const SESSION_MS = 5 * 60 * 1000; // sesi habis jika tidak ada aksi selama 5 menit

const WORDS = [
  { kategori: 'hewan', jawaban: 'kucing', clues: [
    'Hewan peliharaan berbulu yang suka mengeong.',
    'Sering dipelihara di rumah dan pandai menangkap tikus.',
    'Punya kumis panjang dan sering tidur seharian.'] },
  { kategori: 'hewan', jawaban: 'gajah', clues: [
    'Hewan darat terbesar di dunia.',
    'Punya belalai panjang yang dipakai untuk minum dan mengambil makanan.',
    'Hidup di Afrika dan Asia, gadingnya sering dicari orang.'] },
  { kategori: 'hewan', jawaban: 'harimau', clues: [
    'Kucing besar dengan garis-garis hitam di tubuhnya.',
    'Hewan liar yang hidup di hutan dan pandai berenang.',
    'Di Indonesia, subspesies Sumatera hidup di pulau Sumatra.'] },
  { kategori: 'hewan', jawaban: 'kelinci', clues: [
    'Hewan bertelinga panjang.',
    'Sering dipelihara dan suka makan wortel.',
    'Bisa melompat cepat dan berkembang biak dengan sangat banyak.'] },
  { kategori: 'hewan', jawaban: 'burung hantu', clues: [
    'Burung yang aktif saat malam hari.',
    'Matanya besar dan kepalanya bisa diputar jauh.',
    'Sering dijadikan simbol kebijaksanaan.'] },
  { kategori: 'hewan', jawaban: 'hiu', clues: [
    'Ikan pemangsa yang hidup di laut.',
    'Punya sirip punggung yang tegak dan gigi yang tajam.',
    'Film terkenalnya berjudul Jaws.'] },
  { kategori: 'tempat', jawaban: 'bandara', clues: [
    'Tempat orang naik pesawat terbang.',
    'Ada landasan pacu dan terminal keberangkatan.',
    'Di sini ada check-in, imigrasi, dan boarding.'] },
  { kategori: 'tempat', jawaban: 'perpustakaan', clues: [
    'Tempat orang meminjam buku.',
    'Pengunjung dilarang berisik di dalamnya.',
    'Penjaganya disebut pustakawan.'] },
  { kategori: 'tempat', jawaban: 'pasar', clues: [
    'Tempat jual beli kebutuhan sehari-hari.',
    'Biasanya paling ramai pada pagi hari.',
    'Ada pedagang sayur, ikan, dan daging.'] },
  { kategori: 'tempat', jawaban: 'rumah sakit', clues: [
    'Tempat orang berobat ketika sakit.',
    'Di sini ada dokter dan perawat.',
    'Ada UGD dan kamar rawat inap.'] },
  { kategori: 'tempat', jawaban: 'stasiun', clues: [
    'Tempat naik kereta api.',
    'Ada peron dan loket tiket.',
    'Kereta berhenti dan berangkat dari sini.'] },
  { kategori: 'tempat', jawaban: 'museum', clues: [
    'Tempat menyimpan benda bersejarah.',
    'Pengunjung biasanya melihat benda lewat kaca pajangan.',
    'Setiap benda biasanya punya papan keterangan.'] },
  { kategori: 'negara', jawaban: 'jepang', clues: [
    'Negara kepulauan di Asia Timur.',
    'Ibu kotanya Tokyo.',
    'Terkenal dengan bunga sakura dan anime.'] },
  { kategori: 'negara', jawaban: 'mesir', clues: [
    'Negara di Afrika Utara.',
    'Terkenal dengan piramida dan firaun.',
    'Dilalui sungai Nil.'] },
  { kategori: 'negara', jawaban: 'brasil', clues: [
    'Negara terbesar di Amerika Selatan.',
    'Terkenal dengan sepak bola dan karnaval.',
    'Bahasa resminya bahasa Portugis.'] },
  { kategori: 'negara', jawaban: 'italia', clues: [
    'Negara berbentuk seperti sepatu bot.',
    'Ibu kotanya Roma.',
    'Terkenal dengan pizza dan pasta.'] },
  { kategori: 'negara', jawaban: 'kanada', clues: [
    'Negara di Amerika Utara dengan wilayah yang sangat luas.',
    'Ibu kotanya Ottawa.',
    'Daun maple ada di bendera negaranya.'] },
  { kategori: 'negara', jawaban: 'australia', clues: [
    'Negara sekaligus benua.',
    'Terkenal dengan kanguru dan koala.',
    'Ibu kotanya Canberra, bukan Sydney.'] },
  { kategori: 'buah', jawaban: 'durian', clues: [
    'Buah berkulit berduri tajam.',
    'Baunya sangat menyengat.',
    'Dijuluki raja buah di Asia Tenggara.'] },
  { kategori: 'buah', jawaban: 'mangga', clues: [
    'Buah tropis berkulit tipis.',
    'Versi mudanya sering dimakan dengan rujak.',
    'Daging buahnya berwarna kuning dan manis.'] },
  { kategori: 'buah', jawaban: 'nanas', clues: [
    'Buah berkulit kasar dengan duri pendek.',
    'Di atasnya ada mahkota daun.',
    'Rasanya manis asam dan sering dibuat jus.'] },
  { kategori: 'buah', jawaban: 'pisang', clues: [
    'Buah berwarna kuning dan memanjang.',
    'Kaya akan kalium.',
    'Sering dijadikan bekal sekolah.'] },
  { kategori: 'profesi', jawaban: 'dokter', clues: [
    'Merawat orang yang sedang sakit.',
    'Biasanya memakai stetoskop.',
    'Lulusannya bergelar dr.'] },
  { kategori: 'profesi', jawaban: 'pilot', clues: [
    'Menerbangkan pesawat.',
    'Bekerja di dalam kokpit.',
    'Bekerja di udara setiap hari.'] },
  { kategori: 'profesi', jawaban: 'guru', clues: [
    'Mengajar murid di sekolah.',
    'Sering memberi PR.',
    'Membantu murid memahami pelajaran.'] },
  { kategori: 'profesi', jawaban: 'koki', clues: [
    'Memasak di dapur restoran.',
    'Sering menciptakan resep baru.',
    'Bekerja dengan wajan dan pisau.'] },
  { kategori: 'benda', jawaban: 'payung', clues: [
    'Dipakai saat hujan turun.',
    'Bisa dilipat dan dibuka.',
    'Punya gagang dan kain tahan air.'] },
  { kategori: 'benda', jawaban: 'jam', clues: [
    'Alat untuk menunjukkan waktu.',
    'Punya jarum detik, menit, dan jam.',
    'Sering dipakai di pergelangan tangan.'] },
  { kategori: 'benda', jawaban: 'sepeda', clues: [
    'Kendaraan beroda dua.',
    'Dikayuh dengan kaki.',
    'Punya rantai dan pedal.'] },
];

const sessions = new Map(); // id pengirim -> sesi

export function categories() {
  return [...new Set(WORDS.map((w) => w.kategori))];
}

// Hanya huruf dan angka, huruf kecil, tanpa spasi: "Rumah Sakit" sama dengan "rumahsakit"
export function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Hadiah sesuai jumlah clue yang sudah dibuka: 20, 16, 12 energi
export function prizeFor(shown) {
  return Math.round(BASE_PRIZE * (1 - CLUE_PENALTY * (shown - 1)));
}

// Sesi aktif milik pengirim, atau null (sesi yang sudah lewat 5 menit dihapus)
function getSession(id, now) {
  const s = sessions.get(id);
  if (!s) return null;
  if (now - s.lastActive > SESSION_MS) {
    sessions.delete(id);
    return null;
  }
  s.lastActive = now;
  return s;
}

// Mulai permainan. Kalau masih ada sesi aktif, sesi itu yang dipakai lagi.
export function startGame(id, category, now) {
  const active = getSession(id, now);
  if (active) return { ok: true, resumed: true, session: active };

  let pool = WORDS;
  if (category) {
    pool = WORDS.filter((w) => w.kategori === category.toLowerCase());
    if (!pool.length) return { ok: false };
  }
  const w = pool[Math.floor(Math.random() * pool.length)];
  const session = { kategori: w.kategori, jawaban: w.jawaban, clues: w.clues, shown: 1, lastActive: now };
  sessions.set(id, session);
  return { ok: true, resumed: false, session };
}

// Buka clue berikutnya (hadiah turun 20% per clue tambahan)
export function takeClue(id, now) {
  const s = getSession(id, now);
  if (!s) return { status: 'none' };
  if (s.shown >= MAX_CLUES) return { status: 'max' };
  s.shown += 1;
  return { status: 'ok', session: s, shown: s.shown, prize: prizeFor(s.shown) };
}

// Cek jawaban. Salah: sesi tetap jalan. Benar: sesi selesai.
export function guess(id, text, now) {
  const s = getSession(id, now);
  if (!s) return { status: 'none' };
  if (normalize(text) !== normalize(s.jawaban)) return { status: 'wrong' };
  sessions.delete(id);
  return { status: 'right', answer: s.jawaban, prize: prizeFor(s.shown) };
}

// Menyerah: sesi selesai tanpa hadiah, jawaban dibuka
export function giveUp(id, now) {
  const s = getSession(id, now);
  if (!s) return { status: 'none' };
  sessions.delete(id);
  return { status: 'ok', answer: s.jawaban };
}

// Teks semua clue yang sudah terbuka
export function formatClues(s) {
  return s.clues.slice(0, s.shown).map((c, i) => `💡 Clue ${i + 1}: ${c}`).join('\n');
}
