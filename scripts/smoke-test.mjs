'use strict';
/** Sunucu API duman testi — çalışan sunucuya karşı temel akışları doğrular. */
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
let pass = 0, fail = 0;
const results = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`✓ ${name}`); }
  else { fail++; results.push(`✗ ${name} ${extra}`); }
}

function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const c = sc.find((x) => x && x.startsWith('vibrix_sid='));
  return c ? c.split(';')[0] : '';
}

async function req(path, { method = 'GET', body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) data = await res.json();
  return { status: res.status, data, cookie: cookieFrom(res) };
}

(async () => {
  const uniq = Date.now().toString(36);
  const user = { username: `t${uniq}`.slice(0, 18), email: `t${uniq}@example.com`, password: 'parola1234', passwordConfirm: 'parola1234' };

  const health = await req('/api/health');
  ok('Sağlık ucu yanıt veriyor', health.status === 200 && health.data.ok);

  const reg = await req('/api/auth/register', { method: 'POST', body: user });
  ok('Kayıt başarılı', reg.status === 201 && reg.data.user.username === user.username, JSON.stringify(reg.data));
  const cookie = reg.cookie;

  const dup = await req('/api/auth/register', { method: 'POST', body: user });
  ok('Aynı kullanıcı adı reddedildi', dup.status === 409);

  const shortPw = await req('/api/auth/register', { method: 'POST', body: { ...user, username: user.username + 'x', email: 'a' + user.email, password: '123', passwordConfirm: '123' } });
  ok('Kısa şifre reddedildi', shortPw.status === 400);

  const badLogin = await req('/api/auth/login', { method: 'POST', body: { identifier: user.username, password: 'yanlis123' } });
  ok('Hatalı giriş reddedildi', badLogin.status === 401);

  const login = await req('/api/auth/login', { method: 'POST', body: { identifier: user.email, password: user.password } });
  ok('E-posta ile giriş', login.status === 200 && !!login.cookie);

  const me = await req('/api/auth/me', { cookie });
  ok('Oturum çerezi çalışıyor', me.status === 200 && me.data.user && me.data.user.username === user.username);

  const noAuthMe = await req('/api/auth/me');
  ok('Oturumsuz istek kullanıcı döndürmüyor', noAuthMe.data.user === null);

  const patch = await req('/api/auth/me', { method: 'PATCH', cookie, body: { bio: 'Test biyografi' } });
  ok('Profil güncellendi', patch.status === 200 && patch.data.user.bio === 'Test biyografi');

  const charts = await req('/api/charts?limit=3');
  ok('Grafik listesi geliyor', charts.status === 200 && Array.isArray(charts.data.charts));

  const demo = charts.data.charts.find((c) => c.isDemo) || charts.data.charts[0];
  ok('Demo grafik mevcut', !!demo);

  const detail = await req(`/api/charts/${demo.id}?play=1`);
  ok('Grafik detayı ve notalar', detail.status === 200 && Array.isArray(detail.data.chart.chartData.notes));

  // Nota verisi sahip olmayanlara verilmemeli
  const priv = await req(`/api/charts/${demo.id}`);
  ok('Nota verisi sahibi olmayana gizli', priv.status === 200 && priv.data.chart.chartData === undefined);

  // Geçerli oynanış gönderimi
  const notes = detail.data.chart.chartData.notes;
  const seq = [];
  for (let i = 0; i < notes.length; i++) seq.push(i % 10 === 0 ? 'great' : 'perfect');
  const counts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
  for (const j of seq) counts[j]++;
  const S = await import('../public/js/shared/scoring.js');
  const computed = S.scoreFromSequence(seq);
  const acc = S.computeAccuracy(counts);
  const rank = S.computeRank(acc, counts);
  const play = await req('/api/scores', {
    method: 'POST', cookie,
    body: { chartId: demo.id, score: computed.score, accuracy: acc, maxCombo: computed.maxCombo, rank, durationMs: detail.data.chart.lengthMs, judgments: counts },
  });
  ok('Geçerli skor kabul edildi', play.status === 200 && play.data.accepted === true, JSON.stringify(play.data));
  ok('Yeni rekor işaretlendi', play.data.isNewBest === true);
  ok('Rating kazanıldı', play.data.ratingDelta > 0);

  const cheat = await req('/api/scores', {
    method: 'POST', cookie,
    body: { chartId: demo.id, score: 9999999, accuracy: 100, maxCombo: notes.length + 50, rank: 'SS', durationMs: 500, judgments: { perfect: notes.length, great: 0, good: 0, bad: 0, miss: 0 } },
  });
  ok('Hileli skor reddedildi', cheat.data.accepted === false);

  const wrongTotal = await req('/api/scores', {
    method: 'POST', cookie,
    body: { chartId: demo.id, score: 1000, accuracy: 100, maxCombo: 5, rank: 'SS', durationMs: detail.data.chart.lengthMs, judgments: { perfect: 5, great: 0, good: 0, bad: 0, miss: 0 } },
  });
  ok('Judgment toplamı uyuşmazlığı yakalandı', wrongTotal.data.accepted === false);

  const lb = await req(`/api/charts/${demo.id}/leaderboard`);
  ok('Harita liderlik tablosunda oyuncu var', lb.data.entries.some((e) => e.username === user.username));

  const global = await req('/api/leaderboard?period=all');
  ok('Global liderlik tablosunda oyuncu var', global.data.entries.some((e) => e.username === user.username));
  const weekly = await req('/api/leaderboard?period=weekly');
  ok('Haftalık tablo çalışıyor', weekly.status === 200 && weekly.data.period === 'weekly');

  const profile = await req(`/api/users/${user.username}`);
  ok('Oyuncu profili gerçek veri döndürüyor', profile.status === 200 && profile.data.stats.plays >= 1);

  const settingsRes = await req('/api/me/settings', { method: 'PUT', cookie, body: { audio: { master: 55 } } });
  ok('Ayarlar kaydedildi', settingsRes.status === 200 && settingsRes.data.settings.audio.master === 55);
  const settingsGet = await req('/api/me/settings', { cookie });
  ok('Ayarlar okunabiliyor', settingsGet.data.settings.audio.master === 55);

  const scoring = await req('/api/meta/scoring');
  ok('Puanlama açıklaması servis ediliyor', scoring.status === 200 && scoring.data.judgments.length === 5);

  const logout = await req('/api/auth/logout', { method: 'POST', cookie });
  ok('Çıkış başarılı', logout.status === 200);
  const afterLogout = await req('/api/auth/me', { cookie });
  ok('Oturum iptal edildi', afterLogout.data.user === null);

  console.log(results.join('\n'));
  console.log(`\nSonuç: ${pass} başarılı, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Test çalıştırılamadı:', e); process.exit(2); });
