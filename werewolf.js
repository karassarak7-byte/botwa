// werewolf.js — game Werewolf: lobi di grup, aksi malam lewat DM, voting di grup.
// Dipakai dari index.js: initWerewolf({ sock, addEnergy }) sekali saat koneksi dibuat.
const NIGHT_MS = 50_000;   // malam (45-60 detik)
const DAY_MS = 60_000;     // diskusi siang (60 detik)
const VOTE_MS = 45_000;    // voting eksekusi (45 detik)
const REWARD = 20;         // hadiah energi untuk pemenang
const MIN_PLAYERS = 4;

const ROLE_INFO = {
  werewolf: { name: 'Werewolf', team: 'wolf', desc: 'Setiap malam bunuh 1 pemain lewat DM: !kill <nomor>.' },
  alpha: { name: 'Alpha Wolf', team: 'wolf', desc: 'Ikut membunuh (!kill <nomor>). Sekali per game bisa mengubah korban jadi Werewolf: !infect <nomor>.' },
  villager: { name: 'Villager', team: 'human', desc: 'Warga biasa. Diskusi dan voting di siang hari.' },
  seer: { name: 'Seer (Peramal)', team: 'human', desc: 'Setiap malam cek 1 pemain: !cek <nomor>.' },
  doctor: { name: 'Doctor (Dokter)', team: 'human', desc: 'Setiap malam lindungi 1 pemain: !heal <nomor>. Tidak boleh target yang sama 2 malam berturut-turut.' },
  vigilante: { name: 'Vigilante', team: 'human', desc: 'Mulai malam ke-2, 1x peluru perak: !shoot <nomor>. Jika target dari Tim Manusia, kamu ikut mati.' },
  jester: { name: 'Jester (Badut)', team: 'neutral', desc: 'Menang sendirian jika digantung saat voting siang.' },
  fool: { name: 'Fool (Si Linglung)', team: 'neutral', desc: 'Kamu dianggap Seer, tapi hasil !cek kamu acak (50% benar, 50% menyesatkan).' },
  serial: { name: 'Serial Killer', team: 'neutral', desc: 'Setiap malam bunuh 1 pemain: !stab <nomor>. Kebal serangan Werewolf. Menang jika tinggal 1-2 orang.' },
};

// Perintah malam lewat DM dan role yang boleh memakainya
const NIGHT_ACTS = {
  kill: ['werewolf', 'alpha'],
  infect: ['alpha'],
  cek: ['seer', 'fool'],
  heal: ['doctor'],
  shoot: ['vigilante'],
  stab: ['serial'],
};
const WOLF_ROLES = ['werewolf', 'alpha'];
export const WW_DM_CMDS = Object.keys(NIGHT_ACTS);

const games = new Map();      // groupJid -> game
const playerGame = new Map(); // nomor pemain (tanpa @domain) -> groupJid
let io = { send: async () => {}, addEnergy: async () => {} };

export function initWerewolf({ sock, addEnergy }) {
  io = {
    send: (jid, text) => sock.sendMessage(jid, { text }),
    addEnergy,
  };
}

const key = (jid) => jid.split('@')[0].split(':')[0];
const alivePlayers = (g) => g.players.filter((p) => p.alive);
const pname = (p) => p.name || key(p.jid);
const listText = (g) => g.players.map((p) => `${p.num}. ${pname(p)}${p.alive ? '' : ' ☠️'}`).join('\n');
const teamLabel = (p) => ({ wolf: 'Tim Serigala', human: 'Tim Manusia', neutral: 'Netral' })[p.team];

async function dm(jid, text) {
  try { await io.send(jid, text); } catch (e) { console.error('DM Werewolf gagal:', key(jid), e?.message); }
}
const say = (group, text) => io.send(group, text).catch((e) => console.error('Kirim grup gagal:', e?.message));

// Komposisi role sesuai jumlah pemain, lalu diacak
function buildRoles(n) {
  const roles = [];
  const wolves = Math.max(1, Math.floor(n / 4));
  for (let i = 0; i < wolves; i++) roles.push('werewolf');
  if (n >= 8) roles[0] = 'alpha';
  roles.push('seer', 'doctor');
  if (n >= 6) roles.push('vigilante', 'jester');
  if (n >= 7) roles.push('fool');
  if (n >= 9) roles.push('serial');
  while (roles.length < n) roles.push('villager');
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles.slice(0, n);
}

function newGame(group) {
  return { group, phase: 'lobby', players: [], round: 0, actions: new Map(), votes: new Map(), timer: null };
}

// Perintah lobi di grup: !ww create | join | leave | start | status | stop
export async function handleWW(group, sender, args, name = '') {
  const sub = (args[0] || '').toLowerCase();
  const g = games.get(group);
  switch (sub) {
    case 'create': {
      if (g) return 'Sudah ada game di grup ini. Cek dengan *!ww status*.';
      games.set(group, newGame(group));
      return `🐺 *WEREWOLF* — lobi dibuka!\nKetik *!ww join* untuk ikut (minimal ${MIN_PLAYERS} pemain).\nMulai dengan *!ww start*.`;
    }
    case 'join': {
      if (!g) return 'Belum ada lobi. Ketik *!ww create* dulu.';
      if (g.phase !== 'lobby') return 'Game sudah berjalan, tunggu sampai selesai.';
      const where = playerGame.get(key(sender));
      if (where === group) return 'Kamu sudah ikut lobi ini.';
      if (where) return 'Kamu sedang main Werewolf di grup lain.';
      g.players.push({ jid: sender, name: name || key(sender), num: g.players.length + 1, role: null, team: null, alive: true, lastHeal: null, infectUsed: false, shootUsed: false });
      playerGame.set(key(sender), group);
      return `✅ ${name || key(sender)} bergabung. Pemain: ${g.players.length}.`;
    }
    case 'leave': {
      if (!g || g.phase !== 'lobby') return 'Kamu hanya bisa keluar saat lobi, sebelum game dimulai.';
      const before = g.players.length;
      g.players = g.players.filter((p) => key(p.jid) !== key(sender));
      if (g.players.length === before) return 'Kamu belum ikut lobi ini.';
      g.players.forEach((p, i) => { p.num = i + 1; });
      playerGame.delete(key(sender));
      return `👋 ${name || key(sender)} keluar. Pemain: ${g.players.length}.`;
    }
    case 'start': {
      if (!g) return 'Belum ada lobi. Ketik *!ww create* dulu.';
      if (g.phase !== 'lobby') return 'Game sudah berjalan.';
      if (g.players.length < MIN_PLAYERS) return `Minimal ${MIN_PLAYERS} pemain untuk mulai (sekarang ${g.players.length}).`;
      await startGame(g);
      return null;
    }
    case 'stop': {
      if (!g) return 'Tidak ada game di grup ini.';
      await endGame(g, null, 'Game dihentikan paksa.');
      return null;
    }
    case 'status': {
      if (!g) return 'Tidak ada game di grup ini.';
      const phases = { lobby: 'lobi', night: 'malam', day: 'siang (diskusi)', vote: 'voting', over: 'selesai' };
      return `📊 Fase: *${phases[g.phase]}*${g.round ? ` (ronde ${g.round})` : ''}\n${listText(g) || 'Belum ada pemain.'}`;
    }
    default:
      return 'Perintah: *!ww create*, *join*, *leave*, *start*, *status*, *stop*.';
  }
}

// Voting di grup: !vote <nomor>
export async function handleVote(group, sender, args) {
  const g = games.get(group);
  if (!g || g.phase !== 'vote') return 'Voting belum dibuka.';
  const voter = g.players.find((p) => key(p.jid) === key(sender) && p.alive);
  if (!voter) return 'Kamu tidak ikut game atau sudah mati.';
  const target = g.players.find((p) => p.num === Number(args[0]) && p.alive);
  if (!target) return 'Nomor pemain tidak valid atau sudah mati.';
  if (target === voter) return 'Tidak bisa memilih diri sendiri.';
  g.votes.set(key(voter.jid), target.jid);
  return `🗳️ Kamu memilih nomor ${target.num}. Boleh ganti pilihan sampai voting ditutup.`;
}

// Aksi malam lewat DM. Balas null jika pesan ini bukan urusan Werewolf (misal !cek tanpa nomor).
export async function handleWWDM(sender, cmd, args) {
  if (!WW_DM_CMDS.includes(cmd)) return null;
  const group = playerGame.get(key(sender));
  const g = group && games.get(group);
  if (!g) return null;
  const me = g.players.find((p) => key(p.jid) === key(sender));
  if (!me) return null;
  if (cmd === 'cek' && !args.length) return null; // !cek tanpa nomor = cek energi
  const allowed = NIGHT_ACTS[cmd];
  if (!allowed.includes(me.role)) return `Perintah *!${cmd}* bukan untuk role kamu.`;
  if (g.phase !== 'night') return 'Aksi hanya bisa dikirim saat malam.';
  if (!me.alive) return 'Kamu sudah mati.';
  const target = g.players.find((p) => p.num === Number(args[0]) && p.alive);
  if (!target) return 'Nomor pemain tidak valid atau sudah mati.';
  if (target === me && cmd !== 'heal') return 'Tidak bisa memilih diri sendiri.';
  if (cmd === 'infect') {
    if (me.infectUsed) return 'Kemampuan infect kamu sudah habis.';
    if (WOLF_ROLES.includes(target.role)) return 'Target infect harus bukan serigala.';
  }
  if (cmd === 'heal' && target.jid === me.lastHeal) return 'Tidak boleh melindungi target yang sama 2 malam berturut-turut.';
  if (cmd === 'shoot') {
    if (g.round < 2) return 'Peluru baru bisa dipakai mulai malam ke-2.';
    if (me.shootUsed) return 'Peluru perakmu sudah habis.';
  }
  g.actions.set(`${key(sender)}|${cmd}`, { act: cmd, actor: me, target });
  return `✅ Aksi *!${cmd} ${target.num}* tercatat. Bisa kamu ubah sampai malam berakhir.`;
}

async function startGame(g) {
  const roles = buildRoles(g.players.length);
  g.players.forEach((p, i) => {
    p.role = roles[i];
    p.team = ROLE_INFO[p.role].team;
    p.alive = true;
  });
  g.round = 1;
  const wolves = g.players.filter((p) => WOLF_ROLES.includes(p.role));
  for (const p of g.players) {
    const info = ROLE_INFO[p.role];
    let text = `🎭 *Peran kamu: ${info.name}*\n${info.desc}`;
    if (WOLF_ROLES.includes(p.role)) {
      const mates = wolves.filter((w) => w !== p).map((w) => w.num).join(', ') || '-';
      text += `\n\nSesama serigala (nomor): ${mates}`;
    }
    await dm(p.jid, text);
  }
  await say(g.group, `🐺 *Game dimulai!* ${g.players.length} pemain.\n${listText(g)}\n\nPeran sudah dikirim lewat chat pribadi. Jangan bocorkan peranmu.`);
  startNight(g);
}

function startNight(g) {
  g.phase = 'night';
  g.actions = new Map();
  const list = alivePlayers(g).map((p) => `${p.num}. ${pname(p)}`).join('\n');
  for (const p of alivePlayers(g)) {
    if (!Object.values(NIGHT_ACTS).some((roles) => roles.includes(p.role))) continue;
    dm(p.jid, `🌙 *Malam ke-${g.round}*. Pemain hidup:\n${list}\n\nKirim aksimu dalam ${NIGHT_MS / 1000} detik sesuai role.`);
  }
  say(g.group, `🌙 *Malam ke-${g.round}* dimulai. Role malam sedang beraksi lewat chat pribadi.`);
  g.timer = setTimeout(() => resolveNight(g).catch((e) => console.error('Malam error:', e)), NIGHT_MS);
}

async function resolveNight(g) {
  if (g.phase !== 'night') return;
  const acts = [...g.actions.values()].filter((a) => a.actor.alive);
  const of = (name) => acts.filter((a) => a.act === name);

  // 1. Dokter
  const healAct = of('heal')[0];
  const healed = healAct ? healAct.target : null;
  g.players.forEach((p) => { if (p.role === 'doctor') p.lastHeal = null; });
  for (const a of of('heal')) a.actor.lastHeal = a.target.jid;

  // 2. Peramal dan Fool (hasil Fool acak 50%)
  for (const a of of('cek')) {
    const real = teamLabel(a.target);
    let result = real;
    if (a.actor.role === 'fool' && Math.random() < 0.5) {
      const others = ['Tim Serigala', 'Tim Manusia', 'Netral'].filter((l) => l !== real);
      result = others[Math.floor(Math.random() * others.length)];
    }
    await dm(a.actor.jid, `🔮 Hasil cek nomor ${a.target.num}: *${result}*`);
  }

  // 3. Infeksi Alpha: korban berubah jadi serigala, tidak mati karena serigala malam ini
  const infected = new Set();
  for (const a of of('infect')) {
    if (a.target.alive && !WOLF_ROLES.includes(a.target.role)) {
      infected.add(a.target);
      a.actor.infectUsed = true;
    }
  }

  // 4. Pembunuhan: Werewolf, Serial Killer, Vigilante
  const deaths = [];
  let savedByDoctor = false;
  const kill = (p, reason) => {
    if (!p.alive) return;
    if (p === healed) { savedByDoctor = true; return; }
    p.alive = false;
    deaths.push({ p, reason });
  };
  const wolfKill = of('kill').find((a) => WOLF_ROLES.includes(a.actor.role));
  if (wolfKill && !infected.has(wolfKill.target) && wolfKill.target.role !== 'serial') {
    kill(wolfKill.target, 'wolf');
  }
  const stab = of('stab')[0];
  if (stab) kill(stab.target, 'serial');
  const shot = of('shoot')[0];
  if (shot) {
    shot.actor.shootUsed = true;
    kill(shot.target, 'shot');
    if (shot.target.team === 'human' && shot.actor.alive) {
      shot.actor.alive = false;
      deaths.push({ p: shot.actor, reason: 'guilt' });
    }
  }

  // 5. Korban infeksi jadi Werewolf
  for (const p of infected) {
    if (!p.alive) continue;
    p.role = 'werewolf';
    p.team = 'wolf';
    await dm(p.jid, '🐺 Kamu digigit dan sekarang menjadi *Werewolf*!');
  }

  // 6. Pagi: umumkan tanpa membocorkan pelakunya
  let morning = `☀️ *Pagi, malam ke-${g.round} berakhir.*\n`;
  morning += deaths.length
    ? 'Yang tewas:\n' + deaths.map((d) => `• Nomor ${d.p.num}, role *${ROLE_INFO[d.p.role].name}*`).join('\n')
    : 'Tidak ada yang tewas malam ini.';
  if (savedByDoctor) morning += '\n💊 Ada pemain yang selamat berkat Dokter.';
  for (const d of deaths) await dm(d.p.jid, '☠️ Kamu tewas. Sekarang kamu hanya bisa menonton.');
  await say(g.group, morning);

  const winner = checkWin(g);
  if (winner) return endGame(g, winner);

  g.phase = 'day';
  await say(g.group, `💬 Diskusi ${DAY_MS / 1000} detik. Voting dibuka sesudahnya.`);
  g.timer = setTimeout(() => startVote(g).catch((e) => console.error('Voting error:', e)), DAY_MS);
}

async function startVote(g) {
  if (g.phase !== 'day') return;
  g.phase = 'vote';
  g.votes = new Map();
  await say(g.group, `🗳️ *VOTING* dibuka ${VOTE_MS / 1000} detik!\n${listText(g)}\n\nKetik *!vote <nomor>* (pemain hidup saja).`);
  g.timer = setTimeout(() => resolveVote(g).catch((e) => console.error('Vote error:', e)), VOTE_MS);
}

async function resolveVote(g) {
  if (g.phase !== 'vote') return;
  const tally = new Map();
  for (const target of g.votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);
  let top = 0;
  let leaders = [];
  for (const [jid, n] of tally) {
    if (n > top) { top = n; leaders = [jid]; } else if (n === top) leaders.push(jid);
  }
  if (leaders.length !== 1) {
    await say(g.group, '🤷 Tidak ada yang digantung (suara seri atau tidak ada suara).');
  } else {
    const p = g.players.find((x) => key(x.jid) === key(leaders[0]));
    p.alive = false;
    await say(g.group, `⚖️ Nomor *${p.num}* digantung. Role-nya: *${ROLE_INFO[p.role].name}*.`);
    if (p.role === 'jester') return endGame(g, 'jester');
  }
  const winner = checkWin(g);
  if (winner) return endGame(g, winner);
  g.round++;
  startNight(g);
}

// Menang: 'human' | 'wolf' | 'serial' | null
function checkWin(g) {
  const alive = alivePlayers(g);
  const wolves = alive.filter((p) => p.team === 'wolf').length;
  const serials = alive.filter((p) => p.role === 'serial').length;
  if (wolves === 0 && serials === 0) return 'human';
  if (serials > 0 && alive.length <= 2) return 'serial';
  if (wolves >= alive.length - wolves) return 'wolf';
  return null;
}

// Akhiri game: umumkan role semua pemain dan beri hadiah energi ke pemenang
async function endGame(g, winner, note = '') {
  clearTimeout(g.timer);
  g.phase = 'over';
  games.delete(g.group);
  const label = { human: 'Tim Manusia', wolf: 'Tim Serigala', serial: 'Serial Killer', jester: 'Jester' };
  const isWinner = (p) => ({
    human: p.team === 'human',
    wolf: p.team === 'wolf',
    serial: p.role === 'serial',
    jester: p.role === 'jester',
  })[winner];
  const winners = winner ? g.players.filter(isWinner) : [];
  const roles = g.players.map((p) => `${p.num}. ${pname(p)} — ${p.role ? ROLE_INFO[p.role].name : '-'}`).join('\n');
  let text = `🏁 *GAME SELESAI*${note ? `\n${note}` : ''}\n`;
  if (winner) text += `Pemenang: *${label[winner]}*\n`;
  text += `\nRole semua pemain:\n${roles || '-'}`;
  if (winners.length) text += `\n\n🎁 Hadiah +${REWARD} ⚡ untuk pemenang.`;
  await say(g.group, text);
  for (const p of winners) {
    await io.addEnergy(key(p.jid), REWARD).catch((e) => console.error('Hadiah gagal:', e?.message));
  }
  for (const p of g.players) playerGame.delete(key(p.jid));
}
