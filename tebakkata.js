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
  { kategori: 'hewan', jawaban: 'zebra', clues: ['Hewan Afrika yang tubuhnya penuh belang.', 'Kalau dilihat dari jauh, sulit dibedakan dari kuda.', 'Belangnya tidak ada dua yang sama persis.'] },
  { kategori: 'hewan', jawaban: 'jerapah', clues: ['Hewan darat dengan leher paling panjang.', 'Makan daun dari pohon yang tinggi.', 'Tingginya bisa mencapai lebih dari lima meter.'] },
  { kategori: 'hewan', jawaban: 'buaya', clues: ['Reptil besar yang sering diam di tepi sungai.', 'Mirip kadal tapi jauh lebih besar.', 'Gigitannya sangat kuat dan sering menyergap mangsa di air.'] },
  { kategori: 'hewan', jawaban: 'ular', clues: ['Hewan melata tanpa kaki.', 'Berganti kulit beberapa kali dalam setahun.', 'Ada yang berbisa dan ada yang tidak.'] },
  { kategori: 'hewan', jawaban: 'kura-kura', clues: ['Hewan melata yang membawa rumah di punggungnya.', 'Bisa hidup sangat lama, bahkan lebih dari seratus tahun.', 'Bergerak pelan tapi tahan lama.'] },
  { kategori: 'hewan', jawaban: 'lumba-lumba', clues: ['Mamalia laut yang bernapas lewat lubang di kepalanya.', 'Dikenal pintar dan sering terlihat bermain di dekat kapal.', 'Bukan ikan, meski hidup di laut.'] },
  { kategori: 'hewan', jawaban: 'katak', clues: ['Hewan amfibi yang lompat dan suaranya ramai saat hujan.', 'Kulitnya lembap dan hidup di dua alam.', 'Berawal dari berudu yang tidak punya kaki.'] },
  { kategori: 'hewan', jawaban: 'kambing', clues: ['Hewan ternak yang sering memakan daun dan rumput.', 'Jantannya punya tanduk melengkung ke belakang.', 'Susunya bisa diminum dan dibuat keju.'] },
  { kategori: 'tempat', jawaban: 'sekolah', clues: ['Tempat murid belajar setiap pagi.', 'Ada lonceng masuk dan istirahat.', 'Di sini ada upacara bendera tiap Senin.'] },
  { kategori: 'tempat', jawaban: 'masjid', clues: ['Tempat umat Islam beribadah.', 'Ada menara untuk azan.', 'Di dalamnya ada mihrab dan karpet sajadah.'] },
  { kategori: 'tempat', jawaban: 'kebun binatang', clues: ['Tempat orang melihat banyak hewan dari dekat.', 'Ada kandang dan papan nama spesies.', 'Pengunjung sering memberi makan hewan di sini.'] },
  { kategori: 'tempat', jawaban: 'bioskop', clues: ['Tempat orang menonton film di layar besar.', 'Biasanya gelap dan ada popcorn.', 'Tiketnya dibeli sebelum masuk studio.'] },
  { kategori: 'tempat', jawaban: 'hotel', clues: ['Tempat menginap dengan kamar yang bisa disewa per malam.', 'Ada resepsionis dan layanan kamar.', 'Ada kunci kamar dan sarapan pagi.'] },
  { kategori: 'tempat', jawaban: 'pelabuhan', clues: ['Tempat kapal bersandar dan menurunkan muatan.', 'Ada dermaga dan mercusuar.', 'Tempat orang naik kapal laut.'] },
  { kategori: 'tempat', jawaban: 'terminal', clues: ['Tempat bus berangkat dan berhenti.', 'Ada loket dan kursi tunggu.', 'Penumpang naik dan turun di sini.'] },
  { kategori: 'tempat', jawaban: 'lapangan', clues: ['Area terbuka tempat orang bermain atau upacara.', 'Biasanya ada garis batas dan gawang.', 'Sering dipakai untuk pertandingan.'] },
  { kategori: 'negara', jawaban: 'india', clues: ['Negara dengan penduduk yang sangat banyak di Asia Selatan.', 'Ibu kotanya New Delhi.', 'Terkenal dengan film Bollywood dan Taj Mahal.'] },
  { kategori: 'negara', jawaban: 'meksiko', clues: ['Negara di Amerika Utara yang berbatasan dengan Amerika Serikat.', 'Ibu kotanya Mexico City.', 'Terkenal dengan piramida Teotihuacan dan makanan taco.'] },
  { kategori: 'negara', jawaban: 'korea selatan', clues: ['Negara di semenanjung Asia Timur.', 'Ibu kotanya Seoul.', 'Terkenal dengan K-pop dan drama.'] },
  { kategori: 'negara', jawaban: 'jerman', clues: ['Negara di Eropa Tengah yang terkenal dengan mobil mewahnya.', 'Ibu kotanya Berlin.', 'Terkenal dengan bir dan festival Oktoberfest.'] },
  { kategori: 'negara', jawaban: 'turki', clues: ['Negara yang berada di dua benua.', 'Ibu kotanya Ankara.', 'Kota terbesarnya Istanbul.'] },
  { kategori: 'negara', jawaban: 'thailand', clues: ['Negara di Asia Tenggara yang dulu bernama Siam.', 'Ibu kotanya Bangkok.', 'Terkenal dengan gajah dan pantai di Phuket.'] },
  { kategori: 'buah', jawaban: 'jeruk', clues: ['Buah sitrus yang rasanya asam segar.', 'Kulitnya bisa dikupas dengan tangan.', 'Sering dijadikan jus untuk menambah vitamin C.'] },
  { kategori: 'buah', jawaban: 'pepaya', clues: ['Buah tropis dengan biji hitam di dalamnya.', 'Daging buahnya berwarna oranye.', 'Sering dimakan untuk membantu pencernaan.'] },
  { kategori: 'buah', jawaban: 'apel', clues: ['Buah yang sering dianggap bisa menjauhkan dokter.', 'Ada varian merah dan hijau.', 'Daging buahnya renyah dan berair.'] },
  { kategori: 'buah', jawaban: 'anggur', clues: ['Buah kecil yang tumbuh bergerombol.', 'Bisa dibuat menjadi minuman yang memabukkan.', 'Ada yang berwarna hijau, merah, atau hitam.'] },
  { kategori: 'buah', jawaban: 'rambutan', clues: ['Buah dengan kulit merah berbulu.', 'Daging buahnya putih dan manis.', 'Bijinya besar dan ada di dalam buah.'] },
  { kategori: 'buah', jawaban: 'alpukat', clues: ['Buah yang sering dijadikan jus dengan susu cokelat.', 'Kulitnya hijau gelap dengan biji besar.', 'Daging buahnya lembut dan berlemak.'] },
  { kategori: 'profesi', jawaban: 'polisi', clues: ['Bertugas menjaga keamanan dan ketertiban masyarakat.', 'Memakai seragam dan sering mengatur lalu lintas.', 'Menangkap pelaku kejahatan.'] },
  { kategori: 'profesi', jawaban: 'petani', clues: ['Bekerja di sawah atau ladang untuk menanam tanaman.', 'Memakai cangkul atau traktor.', 'Panennya dijual ke pasar.'] },
  { kategori: 'profesi', jawaban: 'nelayan', clues: ['Mencari ikan di laut atau sungai.', 'Bekerja dengan jala dan perahu.', 'Biasanya pergi sebelum matahari terbit.'] },
  { kategori: 'profesi', jawaban: 'sopir', clues: ['Mengemudikan kendaraan untuk mengantar penumpang atau barang.', 'Duduk di balik setir.', 'Sering mengantar orang ke tujuan setiap hari.'] },
  { kategori: 'profesi', jawaban: 'penulis', clues: ['Menghasilkan buku, artikel, atau cerita.', 'Bekerja dengan pena atau keyboard.', 'Ide tulisannya sering datang dari imajinasi.'] },
  { kategori: 'profesi', jawaban: 'pelukis', clues: ['Menciptakan karya dengan kuas dan cat.', 'Karyanya bisa dipajang di galeri.', 'Sering memakai kanvas sebagai media.'] },
  { kategori: 'profesi', jawaban: 'insinyur', clues: ['Merancang dan membangun mesin atau jembatan.', 'Menghitung kekuatan bahan dengan rumus.', 'Lulusannya bergelar ST atau tidak sama sekali.'] },
  { kategori: 'benda', jawaban: 'meja', clues: ['Perabot yang punya permukaan datar dan kaki.', 'Sering dipakai untuk makan atau bekerja.', 'Biasanya diletakkan di ruang makan atau belajar.'] },
  { kategori: 'benda', jawaban: 'gunting', clues: ['Alat dengan dua bilah yang saling bertumpu.', 'Dipakai untuk memotong kertas atau kain.', 'Ada gagang untuk jari.'] },
  { kategori: 'benda', jawaban: 'kacamata', clues: ['Alat yang dipakai di depan mata.', 'Membantu orang yang rabun melihat jelas.', 'Ada gagang yang disangkutkan di telinga.'] },
  { kategori: 'benda', jawaban: 'pensil', clues: ['Alat tulis yang bisa dihapus.', 'Isinya terbuat dari grafit.', 'Harus diraut jika tumpulnya.'] },
  { kategori: 'benda', jawaban: 'sepatu', clues: ['Alat untuk melindungi kaki saat berjalan.', 'Ada tali dan sol di bagian bawah.', 'Dipakai setiap keluar rumah.'] },
  { kategori: 'benda', jawaban: 'jendela', clues: ['Bagian rumah yang membuat udara dan cahaya masuk.', 'Biasanya ada kaca dan kusen.', 'Bisa dibuka dan ditutup dengan engsel.'] },
  { kategori: 'sayur', jawaban: 'wortel', clues: ['Sayur oranye yang sering disebut baik untuk mata.', 'Bisa dimakan mentah atau dimasak sebagai sup.', 'Tumbuh di dalam tanah.'] },
  { kategori: 'sayur', jawaban: 'bayam', clues: ['Sayur hijau yang sering dikaitkan dengan kekuatan tokoh kartun.', 'Daunnya kecil dan lembut.', 'Sering dimasak sebagai sayur bening.'] },
  { kategori: 'sayur', jawaban: 'brokoli', clues: ['Sayur hijau yang bentuknya seperti pohon kecil.', 'Kerabat dekat kubis bunga.', 'Sering dikukus dan dijadikan tumisan.'] },
  { kategori: 'sayur', jawaban: 'terong', clues: ['Sayur ungu yang bentuknya lonjong.', 'Daging dalamnya lembut dan mudah menyerap bumbu.', 'Sering dibuat balado atau digoreng.'] },
  { kategori: 'makanan', jawaban: 'nasi goreng', clues: ['Makanan dari nasi yang ditumis dengan bumbu.', 'Sering disajikan dengan telur mata sapi.', 'Biasanya dimakan pada pagi atau malam hari.'] },
  { kategori: 'makanan', jawaban: 'rendang', clues: ['Masakan daging yang dimasak sangat lama dengan santan.', 'Berasal dari Sumatera Barat.', 'Warnanya cokelat gelap dan rasanya gurih pedas.'] },
  { kategori: 'makanan', jawaban: 'sate', clues: ['Potongan daging yang ditusuk lalu dibakar.', 'Biasanya disajikan dengan bumbu kacang.', 'Sering dijual di pinggir jalan pada malam hari.'] },
  { kategori: 'makanan', jawaban: 'bakso', clues: ['Bola daging yang disajikan dalam kuah.', 'Sering ditambah mie dan sambal.', 'Biasanya dijual dengan gerobak keliling.'] },
  { kategori: 'minuman', jawaban: 'kopi', clues: ['Minuman yang dibuat dari biji yang disangrai.', 'Rasanya pahit dan sering dinikmati pagi hari.', 'Ada yang diminum panas atau dingin.'] },
  { kategori: 'minuman', jawaban: 'teh', clues: ['Minuman yang diseduh dari daun kering.', 'Sering disajikan hangat dengan gula.', 'Ada versi hijau, hitam, dan melati.'] },
  { kategori: 'musik', jawaban: 'gitar', clues: ['Alat musik petik dengan enam senar.', 'Sering dimainkan sambil bernyanyi.', 'Bagian tubuhnya berlubang di tengah.'] },
  { kategori: 'musik', jawaban: 'piano', clues: ['Alat musik dengan deretan tuts hitam dan putih.', 'Dimainkan dengan kedua tangan.', 'Bunyinya dihasilkan dari palu yang memukul senar.'] },
  { kategori: 'musik', jawaban: 'angklung', clues: ['Alat musik tradisional Indonesia dari bambu.', 'Dibunyikan dengan cara digoyangkan.', 'Berasal dari Jawa Barat dan diakui UNESCO.'] },
  { kategori: 'musik', jawaban: 'drum', clues: ['Alat musik pukul yang sering menjadi ritme utama band.', 'Terdiri dari beberapa gendang dan simbal.', 'Dimainkan dengan stik.'] },
  { kategori: 'olahraga', jawaban: 'sepak bola', clues: ['Olahraga yang dimainkan dua tim dengan satu bola.', 'Pemain dilarang menyentuh bola dengan tangan, kecuali penjaga gawang.', 'Dimainkan selama dua babak di lapangan rumput.'] },
  { kategori: 'olahraga', jawaban: 'bulu tangkis', clues: ['Olahraga raket yang memakai kok.', 'Bisa dimainkan tunggal atau ganda.', 'Lapangannya dibatasi net di tengah.'] },
  { kategori: 'olahraga', jawaban: 'renang', clues: ['Olahraga di air dengan berbagai gaya.', 'Ada gaya dada, punggung, kupu-kupu, dan bebas.', 'Dilakukan di kolam.'] },
  { kategori: 'olahraga', jawaban: 'basket', clues: ['Olahraga memasukkan bola ke ring.', 'Ring dipasang di papan transparan.', 'Setiap tim berisi lima pemain di lapangan.'] },
  { kategori: 'transportasi', jawaban: 'pesawat', clues: ['Kendaraan yang terbang di udara.', 'Lepas landas dari landasan pacu.', 'Ada sayap dan mesin jet atau baling-baling.'] },
  { kategori: 'transportasi', jawaban: 'kapal', clues: ['Kendaraan air yang bisa membawa banyak penumpang.', 'Berlayar di laut atau sungai besar.', 'Bersandar di dermaga.'] },
  { kategori: 'transportasi', jawaban: 'becak', clues: ['Kendaraan roda tiga dengan tenaga manusia.', 'Penumpangnya duduk di depan atau samping pengayuh.', 'Masih banyak ditemui di kota-kota kecil.'] },
  { kategori: 'transportasi', jawaban: 'delman', clues: ['Kendaraan beroda dua yang ditarik kuda.', 'Biasanya ada lonceng kecil di kudanya.', 'Pernah jadi transportasi andalan di kota tua.'] },
  { kategori: 'hewan', jawaban: 'kuda', clues: ['Hewan berkaki empat yang sering dinaiki orang.', 'Punya surai panjang di leher.', 'Suara ringkikannya terdengar dari kejauhan.'] },
  { kategori: 'hewan', jawaban: 'singa', clues: ['Kucing besar yang hidup berkelompok.', 'Jantannya punya surai lebat di leher.', 'Dijuluki raja hutan, walau hidupnya lebih sering di savana.'] },
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
