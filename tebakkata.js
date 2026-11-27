// tebakkata.js — logika permainan tebak kata (tanpa WhatsApp, tanpa database).
// Sesi disimpan di memori: hilang saat bot restart.

export const BASE_PRIZE = 20;      // hadiah (energi) saat clue pertama
export const CLUE_PENALTY = 0.2;   // tiap clue tambahan mengurangi 20% dari hadiah dasar
export const MAX_CLUES = 3;        // jumlah clue per kata
export const SESSION_MS = 5 * 60 * 1000; // sesi habis jika tidak ada aksi selama 5 menit

// Clue dibuat tidak langsung menyebut jawabannya. Clue pertama paling samar.
const WORDS = [
  { kategori: 'hewan', jawaban: 'kucing', clues: [
    'Sering dipanggil si "meong" oleh pemiliknya.',
    'Pemburu tikus yang lincah dan pandai memanjat.',
    'Matanya bisa bersinar di gelap dan tubuhnya sangat lentur.'] },
  { kategori: 'hewan', jawaban: 'gajah', clues: [
    'Hewan darat yang punya ingatan sangat kuat.',
    'Belalainya bisa dipakai untuk menyemprot air.',
    'Mamalia darat terbesar, kakinya besar seperti tiang.'] },
  { kategori: 'hewan', jawaban: 'harimau', clues: [
    'Kucing liar berwarna oranye dengan garis-garis.',
    'Mamalia pemburu yang biasanya berburu sendirian.',
    'Tidak seperti singa, jantannya tidak punya surai.'] },
  { kategori: 'hewan', jawaban: 'kelinci', clues: [
    'Hewan bertelinga panjang dengan hidung yang terus bergerak.',
    'Dalam budaya Barat, ia sering dikaitkan dengan Paskah.',
    'Tidak bisa muntah, dan sangat cepat berkembang biak.'] },
  { kategori: 'hewan', jawaban: 'burung hantu', clues: [
    'Burung nokturnal dengan wajah datar dan mata menghadap ke depan.',
    'Bisa memutar lehernya hingga sekitar 270 derajat.',
    'Sering dikaitkan dengan mitos dan kebijaksanaan.'] },
  { kategori: 'hewan', jawaban: 'hiu', clues: [
    'Ikan bertulang rawan yang sudah ada sejak jutaan tahun.',
    'Bisa mencium darah dari jarak yang sangat jauh.',
    'Sirip punggungnya tegak dan giginya tersusun berlapis.'] },
  { kategori: 'hewan', jawaban: 'unta', clues: [
    'Hewan padang pasir yang bisa menahan haus berhari-hari.',
    'Punggungnya berbentuk benjolan untuk menyimpan lemak.',
    'Ada jenis yang berpunuk satu dan ada yang berpunuk dua.'] },
  { kategori: 'hewan', jawaban: 'penguin', clues: [
    'Burung yang tidak bisa terbang tapi pandai berenang.',
    'Sering terlihat seperti memakai tuksedo hitam putih.',
    'Banyak spesiesnya hidup di daerah dingin belahan bumi selatan.'] },
  { kategori: 'tempat', jawaban: 'bandara', clues: [
    'Tempat orang menunggu sambil melihat papan jadwal terbang.',
    'Di sini ada menara pengatur lalu lintas udara.',
    'Ada check-in, imigrasi, dan boarding gate.'] },
  { kategori: 'tempat', jawaban: 'perpustakaan', clues: [
    'Ruangan yang wajib hening, tempat orang membaca dan meminjam.',
    'Kartu anggota dan nomor rak sering dipakai di sini.',
    'Penjaganya disebut pustakawan.'] },
  { kategori: 'tempat', jawaban: 'pasar', clues: [
    'Tempat tawar-menawar yang ramai sejak pagi buta.',
    'Ada los sayur, ikan, dan daging.',
    'Di sini kebutuhan dapur biasanya dibeli dalam jumlah kecil.'] },
  { kategori: 'tempat', jawaban: 'rumah sakit', clues: [
    'Tempat yang punya UGD dan bangsal rawat inap.',
    'Di sini ada dokter, perawat, dan apotek.',
    'Orang bisa menginap di sini berhari-hari saat sakit parah.'] },
  { kategori: 'tempat', jawaban: 'stasiun', clues: [
    'Bangunan dengan peron dan papan jadwal keberangkatan.',
    'Kereta berhenti di sini untuk menaikkan dan menurunkan penumpang.',
    'Tiketnya dibeli di loket sebelum naik.'] },
  { kategori: 'tempat', jawaban: 'museum', clues: [
    'Tempat menyimpan benda bersejarah dan karya seni.',
    'Setiap koleksinya biasanya punya papan keterangan.',
    'Pengunjung dilarang menyentuh benda di dalam kaca pajangan.'] },
  { kategori: 'negara', jawaban: 'jepang', clues: [
    'Negara kepulauan dengan gunung berapi yang terkenal.',
    'Mata uangnya disebut yen.',
    'Ibu kotanya Tokyo.'] },
  { kategori: 'negara', jawaban: 'mesir', clues: [
    'Negara tempat sungai terpanjang di dunia mengalir.',
    'Terkenal dengan piramida Giza.',
    'Ibu kotanya Kairo.'] },
  { kategori: 'negara', jawaban: 'brasil', clues: [
    'Negara terbesar di Amerika Selatan.',
    'Terkenal dengan sepak bola dan karnaval di Rio.',
    'Bahasa resminya bahasa Portugis, bukan Spanyol.'] },
  { kategori: 'negara', jawaban: 'italia', clues: [
    'Negara di Eropa Selatan yang bentuknya mirip sepatu bot.',
    'Ada Colosseum dan menara miring Pisa.',
    'Ibu kotanya Roma.'] },
  { kategori: 'negara', jawaban: 'kanada', clues: [
    'Negara terluas kedua di dunia.',
    'Daun maple ada di bendera negaranya.',
    'Ibu kotanya Ottawa, bukan Toronto.'] },
  { kategori: 'negara', jawaban: 'australia', clues: [
    'Satu-satunya negara yang sekaligus menjadi benua.',
    'Terkenal dengan kanguru dan koala.',
    'Ibu kotanya Canberra, bukan Sydney.'] },
  { kategori: 'buah', jawaban: 'durian', clues: [
    'Buah yang sering dilarang dibawa masuk ke hotel.',
    'Kulitnya penuh duri tajam.',
    'Dijuluki raja buah di Asia Tenggara.'] },
  { kategori: 'buah', jawaban: 'mangga', clues: [
    'Buah musiman yang harum saat sudah matang.',
    'Versi mudanya sering dibuat rujak.',
    'Daging buahnya berwarna kuning dan manis.'] },
  { kategori: 'buah', jawaban: 'nanas', clues: [
    'Buah dengan kulit berduri pendek dan warna kecokelatan.',
    'Di atasnya ada mahkota daun.',
    'Rasanya manis asam dan sering dibuat jus.'] },
  { kategori: 'buah', jawaban: 'pisang', clues: [
    'Buah yang kulitnya bisa dikupas tanpa alat.',
    'Kaya kalium dan sering dijadikan bekal.',
    'Warnanya kuning saat sudah matang.'] },
  { kategori: 'buah', jawaban: 'semangka', clues: [
    'Buah besar dengan kulit hijau bergaris.',
    'Daging buahnya berair dan penuh biji hitam.',
    'Sering dimakan dingin saat siang hari yang panas.'] },
  { kategori: 'profesi', jawaban: 'dokter', clues: [
    'Orang yang memeriksa pasien dan menentukan obatnya.',
    'Biasanya memakai stetoskop di leher.',
    'Lulusannya bergelar dr.'] },
  { kategori: 'profesi', jawaban: 'pilot', clues: [
    'Orang yang menerbangkan pesawat.',
    'Bekerja di kokpit bersama co-pilot.',
    'Menentukan rute dan berbicara dengan menara kontrol.'] },
  { kategori: 'profesi', jawaban: 'guru', clues: [
    'Orang yang setiap hari mengisi kelas dan menilai tugas.',
    'Sering memberi PR kepada murid.',
    'Membantu murid memahami pelajaran di sekolah.'] },
  { kategori: 'profesi', jawaban: 'koki', clues: [
    'Orang yang menyusun menu dan memasak di dapur komersial.',
    'Bekerja dengan wajan dan pisau tajam.',
    'Sering menciptakan resep baru.'] },
  { kategori: 'profesi', jawaban: 'arsitek', clues: [
    'Merancang bangunan sebelum bangunan itu dibuat.',
    'Menggambar denah dan tampak rumah.',
    'Hasil kerjanya disebut cetak biru.'] },
  { kategori: 'profesi', jawaban: 'apoteker', clues: [
    'Meracik dan menyerahkan obat sesuai resep dokter.',
    'Bekerja di apotek.',
    'Lulusannya bergelar apt.'] },
  { kategori: 'benda', jawaban: 'payung', clues: [
    'Benda yang bisa mengembang dan mengecil saat dibuka dan dilipat.',
    'Digenggam dari gagangnya.',
    'Dipakai saat hujan turun.'] },
  { kategori: 'benda', jawaban: 'jam', clues: [
    'Benda yang terus berputar menghitung waktu tanpa henti.',
    'Punya jarum detik, menit, dan jam.',
    'Sering dipakai di pergelangan tangan.'] },
  { kategori: 'benda', jawaban: 'sepeda', clues: [
    'Kendaraan tanpa mesin yang dijalankan tenaga manusia.',
    'Dikayuh dengan kaki.',
    'Punya rantai dan pedal.'] },
  { kategori: 'benda', jawaban: 'kursi', clues: [
    'Benda yang dipakai untuk duduk dan punya sandaran.',
    'Biasanya punya empat kaki.',
    'Sering ada di ruang makan dan ruang tamu.'] },
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
