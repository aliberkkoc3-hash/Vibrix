/* Vibrix — ayarlar: ses, oynanış, görsel, genel */
import {
  api, auth, site, $, esc, settings, toast, confirmDialog, navigate, flushRemoteSave, setCleanup,
} from '../app.js';
import { icon } from '../icons.js';
import { NOTE_PALETTES, resolveLaneColors } from '../game/engine.js';

const KEY_LABELS = ['Sol (1. hat)', 'Aşağı (2. hat)', 'Yukarı (3. hat)', 'Sağ (4. hat)'];

function range(id, label, value, min, max, step, suffix = '') {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="range-row">
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <span class="range-value" id="${id}-val">${value}${suffix}</span>
      </div>
    </div>`;
}

function toggle(id, label, checked, hint = '') {
  return `
    <div class="field" style="flex-direction:row;align-items:center;justify-content:space-between;gap:14px">
      <div><label for="${id}" style="cursor:pointer">${label}</label>${hint ? `<div class="hint">${hint}</div>` : ''}</div>
      <label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label>
    </div>`;
}

export async function render({ main }) {
  if (!auth.user) {
    sessionStorage.setItem('vibrix.redirect', '/ayarlar');
    navigate('/giris');
    return;
  }
  const s = settings.data;
  let scoring = null;
  try { scoring = await api('/meta/scoring'); } catch { /* yoksay */ }
  await site.loadEditorStatus();

  main.innerHTML = `
    <div class="page narrow">
      <div class="page-head">
        <div>
          <div class="eyebrow">Ayarlar</div>
          <h1>Tercihler</h1>
          <p class="sub">Tüm ayarlar otomatik olarak kaydedilir ve hesabına eşitlenir.</p>
        </div>
        <button class="btn btn-danger btn-sm" id="reset-all">${icon('refresh')} Ayarları Sıfırla</button>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon(site.editorOpen ? 'unlock' : 'lock')} Chart Editor Kilidi</div>
        <p class="muted small" style="margin:0 0 12px">Kapalıyken site sahibi dışında kimse yeni grafik oluşturamaz. Kapatınca ziyaretçiler "Yeni şarkılar ekleneceği için şimdilik kapalı." mesajını görür.</p>
        <label class="check" style="margin-bottom:10px"><input type="checkbox" id="editor-lock" ${site.editorOpen ? 'checked' : ''}> Chart Editor herkese açık</label>
        ${site.isOwner ? '' : '<div class="field" style="margin:0 0 10px"><label for="editor-lock-pass">Site şifresi</label><input class="input" id="editor-lock-pass" type="password" placeholder="SITE_PASS değişkenindeki şifre" autocomplete="current-password"><span class="hint">Yalnızca site sahibi değiştirebilir.</span></div>'}
        <div class="row wrap" style="gap:8px">
          <button class="btn btn-primary btn-sm" id="editor-lock-save">${icon('save')} Kaydet</button>
          <span class="small ${site.editorOpen ? 'muted' : ''}" id="editor-lock-state">${site.editorOpen ? 'Şu an: açık' : '<b>Şu an: kapalı</b>'}</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon('headphones')} Ses</div>
        ${range('audio-master', 'Ana Ses', s.audio.master, 0, 100, 1, '%')}
        ${range('audio-music', 'Müzik Sesi', s.audio.music, 0, 100, 1, '%')}
        ${range('audio-sfx', 'Efekt Sesi', s.audio.sfx, 0, 100, 1, '%')}
        <button class="btn btn-ghost btn-sm" id="test-sfx">${icon('volume')} Efekt sesini dene</button>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon('gamepad')} Oynanış</div>
        ${range('gp-scroll', 'Kayma Hızı', s.gameplay.scrollSpeed, 0.5, 6, 0.1, 'x')}
        ${range('gp-offset', 'Girdi Gecikmesi (ms)', s.gameplay.inputOffset, -200, 200, 1, ' ms')}
        ${range('gp-notesize', 'Nota Boyutu', s.gameplay.noteSize, 60, 140, 5, '%')}
        ${range('gp-laneop', 'Hat Şeffaflığı', s.gameplay.laneOpacity, 20, 100, 5, '%')}
        <div class="field">
          <label class="check"><input type="checkbox" id="gp-persp" ${s.gameplay.perspective ? 'checked' : ''}> 3D Perspektif (AÇMA TAVSİYE ETMEM)</label>
          <span class="hint">Notalar uzaklaştıkça daralır ve ufukta birleşir; klasik 4K'nın düz görünümü yerine derinlikli bir sahne. UYARI: 'JUDGEMENT ÇİZGİSİ DÜZELTİLMEDİ 5 HAT VAR GİBİ GÖZÜKÜYOR'</span>
        </div>
        <div id="gp-persp-wrap" style="${s.gameplay.perspective ? '' : 'opacity:.45;pointer-events:none'}">
          ${range('gp-perspstr', 'Perspektif Derinliği', s.gameplay.perspectiveStrength, 10, 100, 5, '%')}
        </div>
        <div class="field">
          <label>Zamanlama Pencereleri</label>
          <select class="select" id="gp-windows">
            <option value="strict">Sıkı (Perfect ±35ms)</option>
            <option value="normal">Normal (Perfect ±45ms)</option>
            <option value="lenient">Rahat (Perfect ±60ms)</option>
          </select>
        </div>
        <div class="field">
          <label>Tuş Atamaları</label>
          <div class="grid cols-2" style="gap:10px">
            ${KEY_LABELS.map((l, i) => `<div class="field" style="margin:0"><span class="hint">${l}</span>
              <button class="btn btn-ghost keybind" data-lane="${i}" style="justify-content:space-between"><span>${esc((s.keys[i] || 'DFJK'[i]).toUpperCase())}</span>${icon('edit')}</button></div>`).join('')}
          </div>
          <span class="hint">Değiştirmek için bir kutuya tıkla, ardından bir tuşa bas.</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon('palette')} Görseller</div>
        ${range('vis-dim', 'Arka Plan Karartma', s.visual.backgroundDim, 0, 100, 5, '%')}
        ${toggle('vis-hit', 'Vuruş Efektleri', s.visual.hitEffects)}
        ${toggle('vis-combo', 'Kombo Efektleri', s.visual.comboEffects)}
        ${toggle('vis-shake', 'Ekran Sarsıntısı', s.visual.screenShake)}
        ${toggle('vis-anim', 'Arayüz Animasyonları', s.visual.animations)}
        ${toggle('vis-fps', 'FPS Göstergesi', s.visual.showFps, 'Oynanış sırasında skor panelinde gösterilir.')}
        <div class="field"><label>UI Ölçeği</label>
          <select class="select" id="vis-scale">
            <option value="0.9">Küçük (%90)</option><option value="1">Normal (%100)</option><option value="1.1">Büyük (%110)</option><option value="1.2">Çok Büyük (%120)</option>
          </select></div>
      </div>

      <div class="card" style="margin-bottom:18px" id="hud-card">
        <div class="card-title">${icon('gamepad')} Oyun İçi HUD</div>
        <p class="muted small" style="margin-top:-4px">Oynarken ekranda görünen panelleri buradan ayarla. Değişiklik bir sonraki oyunda geçerli olur.</p>
        <div class="field"><label>HUD Düzeni</label>
          <select class="select" id="hud-style">
            <option value="cards">Cam Paneller (önerilen)</option>
            <option value="compact">Sade / Minimal</option>
          </select>
          <span class="hint">Sade düzen, arka planı kapatır; sadece yazı ve çizgiler kalır.</span>
        </div>
        ${toggle('hud-combo', 'Kombo Sayacı', s.visual.hudCombo, 'Ekranın ortasında büyük kombo sayacı ve dolum çubuğu.')}
        ${toggle('hud-jacket', 'Kapak Görseli', s.visual.hudJacket, 'Sol üstteki şarkı kartında kapak resmini gösterir.')}
        ${toggle('hud-progress', 'İlerleme Çubuğu', s.visual.hudProgress, 'Ekranın kenarındaki şarkı ilerleme çubuğu.')}
        ${toggle('hud-pulse', 'Kombo Işıması', s.visual.comboPulse, '25+ komboda oyun alanında oluşan hafif nabız ışıması.')}
      </div>

      <div class="card" style="margin-bottom:18px" id="note-colors-card">
        <div class="card-title">${icon('palette')} Nota Renkleri</div>
        <p class="muted small" style="margin-top:-4px">Hazır bir palet seç ya da <b>Kendi Renklerim</b> ile 4 hattın rengini istediğin gibi belirle.</p>
        <div class="field">
          <label>Palet</label>
          <select class="select" id="nc-preset">
            ${Object.entries(NOTE_PALETTES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}
            <option value="custom">Kendi Renklerim (özel)</option>
          </select>
        </div>
        <div id="nc-presets" class="nc-presets"></div>
        <div id="nc-custom" style="display:none">
          <div class="nc-custom-grid">
            ${[0, 1, 2, 3].map((i) => `
              <div class="nc-custom-cell">
                <span class="hint">${esc(KEY_LABELS[i])}</span>
                <input type="color" id="nc-c${i}" class="nc-color" value="#C4B5FD">
                <span class="nc-hex mono" id="nc-c${i}-hex">#C4B5FD</span>
              </div>`).join('')}
          </div>
          <div class="row wrap" style="margin-top:10px">
            <button class="btn btn-ghost btn-sm" id="nc-copy">${icon('layers')} 1. hattın rengini hepsine uygula</button>
            <button class="btn btn-ghost btn-sm" id="nc-save">${icon('save')} Bu renkleri paletim olarak kaydet</button>
          </div>
          <div id="nc-mine" class="nc-mine"></div>
        </div>
        <div class="nc-preview" id="nc-preview">
          ${[0, 1, 2, 3].map((i) => `<div class="nc-preview-lane" data-lane="${i}"><span class="nc-preview-note"></span><span class="nc-preview-key mono">${esc((s.keys[i] || 'DFJK'[i]).toUpperCase())}</span></div>`).join('')}
        </div>
        <span class="hint">Değişiklik anında kaydedilir; oyuna girdiğinde bu renkler kullanılır.</span>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon('sliders')} Genel</div>
        <div class="field"><label>Dil</label><select class="select" id="gen-lang"><option value="tr">Türkçe</option></select><span class="hint">Vibrix şu anda yalnızca Türkçe olarak sunuluyor.</span></div>
        <div class="row wrap"><button class="btn btn-ghost btn-sm" id="fullscreen">${icon('maximize')} Tam Ekran</button>
          <button class="btn btn-ghost btn-sm" id="logout-all">${icon('logout')} Tüm oturumları kapat</button></div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-title">${icon('target')} Hesap ve Güvenlik</div>
        <div class="grid cols-2">
          <div class="field"><label>Mevcut Şifre</label><input class="input" type="password" id="cur-pw" autocomplete="current-password"></div>
          <div class="field"><label>Yeni Şifre</label><input class="input" type="password" id="new-pw" autocomplete="new-password"><span class="hint">En az 8 karakter.</span></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="change-pw">${icon('save')} Şifreyi Değiştir</button>
      </div>

      <div class="card" id="scoring">
        <div class="card-title">${icon('info')} Puanlama Sistemi</div>
        ${scoring ? `
          <div class="judge-grid">
            ${scoring.judgments.map((j) => `<div class="judge-cell judge-${j.key}"><div class="k">${j.label}</div><div class="v">${j.windowMs ? '±' + j.windowMs + 'ms' : '—'}</div><div class="muted small">${j.points} puan</div></div>`).join('')}
          </div>
          <p class="muted small" style="margin-top:14px"><b>Dereceler:</b> ${scoring.ranks.map((r) => `${r.rank} (${r.rule})`).join(' · ')}</p>
          <p class="muted small" style="margin-top:8px"><b>Rating:</b> ${esc(scoring.rating)}</p>
          <p class="muted small" style="margin-top:8px"><b>Sıralama:</b> ${esc(scoring.leaderboard)}</p>` : '<p class="muted small">Yüklenemedi.</p>'}
      </div>
    </div>`;

  /* --- Yardımcılar --- */
  const bindRange = (id, path, suffix = '') => {
    const el = $(`#${id}`);
    const val = $(`#${id}-val`);
    el.addEventListener('input', () => {
      const v = Number(el.value);
      val.textContent = `${v}${suffix}`;
      const [group, key] = path;
      settings.save({ [group]: { [key]: v } });
    });
  };
  bindRange('audio-master', ['audio', 'master'], '%');
  bindRange('audio-music', ['audio', 'music'], '%');
  bindRange('audio-sfx', ['audio', 'sfx'], '%');
  bindRange('gp-scroll', ['gameplay', 'scrollSpeed'], 'x');
  bindRange('gp-offset', ['gameplay', 'inputOffset'], ' ms');
  bindRange('gp-notesize', ['gameplay', 'noteSize'], '%');
  bindRange('gp-laneop', ['gameplay', 'laneOpacity'], '%');
  bindRange('gp-perspstr', ['gameplay', 'perspectiveStrength'], '%');
  const perspBox = $('#gp-persp');
  if (perspBox) {
    perspBox.addEventListener('change', () => {
      settings.save({ gameplay: { perspective: perspBox.checked } });
      const wrap = $('#gp-persp-wrap');
      if (wrap) {
        wrap.style.opacity = perspBox.checked ? '1' : '.45';
        wrap.style.pointerEvents = perspBox.checked ? '' : 'none';
      }
    });
  }
  bindRange('vis-dim', ['visual', 'backgroundDim'], '%');

  /* ---------- Nota renkleri ---------- */
  // Sayfadan ayrılırken bekleyen ayar yazımını hemen gönder
  const ncFlush = () => { flushRemoteSave(); };
  window.addEventListener('beforeunload', ncFlush);
  window.addEventListener('pagehide', ncFlush);
  setCleanup(() => {
    ncFlush();
    window.removeEventListener('beforeunload', ncFlush);
    window.removeEventListener('pagehide', ncFlush);
  });

  /* ---------- Chart Editor kilidi (yalnızca site sahibi) ---------- */
  const lockSave = $('#editor-lock-save');
  if (lockSave) {
    lockSave.addEventListener('click', async () => {
      const open = $('#editor-lock').checked;
      const passInput = $('#editor-lock-pass');
      const pass = site.isOwner ? undefined : (passInput?.value || site.sitePass);
      lockSave.disabled = true;
      try {
        await site.setEditorOpen(open, pass);
        if (pass) site.setSitePass(pass);
        $('#editor-lock-state').innerHTML = open ? 'Şu an: açık' : '<b>Şu an: kapalı</b>';
        toast(open ? 'Chart Editor açıldı.' : 'Chart Editor kapatıldı.', 'success');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        lockSave.disabled = false;
      }
    });
  }

  const presetSel = $('#nc-preset');
  const presetsBox = $('#nc-presets');
  const customBox = $('#nc-custom');
  const previewBox = $('#nc-preview');
  const mineBox = $('#nc-mine');

  const readCustom = () => [0, 1, 2, 3].map((i) => ($(`#nc-c${i}`).value || '#C4B5FD').toUpperCase());

  const paintPreview = (colors) => {
    previewBox.querySelectorAll('.nc-preview-lane').forEach((el, i) => {
      const c = colors[i] || '#888888';
      el.style.setProperty('--lane-color', c);
    });
  };

  const paintCustomInputs = (colors) => {
    [0, 1, 2, 3].forEach((i) => {
      const c = colors[i] || '#C4B5FD';
      $(`#nc-c${i}`).value = c.toLowerCase();
      $(`#nc-c${i}-hex`).textContent = c.toUpperCase();
    });
  };

  const renderPresetChips = (active) => {
    presetsBox.innerHTML = Object.entries(NOTE_PALETTES).map(([k, v]) => `
      <button class="nc-chip ${active === k ? 'active' : ''}" data-preset="${k}" title="${esc(v.name)}">
        <span class="nc-chip-dots">${v.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <span class="nc-chip-name">${esc(v.name.split(' — ')[0])}</span>
      </button>`).join('');
    presetsBox.querySelectorAll('.nc-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        presetSel.value = btn.dataset.preset;
        applyPreset(btn.dataset.preset);
      });
    });
  };

  const renderMine = () => {
    const mine = Array.isArray(s.visual.notePalettes) ? s.visual.notePalettes : [];
    if (!mine.length) {
      mineBox.innerHTML = '<span class="hint">Henüz kendi paletin yok. Renkleri seçip “Bu renkleri paletim olarak kaydet”e bas.</span>';
      return;
    }
    mineBox.innerHTML = `<div class="hint" style="margin-bottom:6px">Kaydettiğim paletler</div>
      <div class="nc-mine-list">${mine.map((p, idx) => `
        <div class="nc-mine-item">
          <button class="nc-mine-apply" data-idx="${idx}">
            <span class="nc-chip-dots">${p.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
            <span>${esc(p.name)}</span>
          </button>
          <button class="btn btn-ghost btn-sm nc-mine-del" data-idx="${idx}" title="Sil">${icon('trash')}</button>
        </div>`).join('')}</div>`;
    mineBox.querySelectorAll('.nc-mine-apply').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p2 = mine[Number(btn.dataset.idx)];
        paintCustomInputs(p2.colors);
        presetSel.value = 'custom';
        applyPreset('custom');
      });
    });
    mineBox.querySelectorAll('.nc-mine-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = mine.filter((_, i) => i !== Number(btn.dataset.idx));
        await settings.save({ visual: { notePalettes: next } });
        s.visual.notePalettes = next;
        renderMine();
        toast('Palet silindi');
      });
    });
  };

  const applyPreset = (key) => {
    const isCustom = key === 'custom';
    customBox.style.display = isCustom ? '' : 'none';
    renderPresetChips(key);
    if (isCustom) {
      paintPreview(readCustom());
    } else {
      paintPreview(resolveLaneColors({ noteColors: key }));
    }
    settings.save({ visual: { noteColors: key } });
    s.visual.noteColors = key;
  };

  // Başlangıç durumu
  const currentPreset = s.visual.noteColors || 'default';
  presetSel.value = currentPreset;
  paintCustomInputs(resolveLaneColors(s.visual));
  renderPresetChips(currentPreset);
  renderMine();
  applyPreset(currentPreset);

  presetSel.addEventListener('change', () => applyPreset(presetSel.value));

  [0, 1, 2, 3].forEach((i) => {
    $(`#nc-c${i}`).addEventListener('input', () => {
      const colors = readCustom();
      $(`#nc-c${i}-hex`).textContent = colors[i];
      paintPreview(colors);
      if (presetSel.value !== 'custom') { presetSel.value = 'custom'; customBox.style.display = ''; renderPresetChips('custom'); }
      settings.save({ visual: { noteColors: 'custom', customNoteColors: colors } });
      s.visual.noteColors = 'custom';
      s.visual.customNoteColors = colors;
    });
  });

  $('#nc-copy').addEventListener('click', () => {
    const c = readCustom()[0];
    paintCustomInputs([c, c, c, c]);
    paintPreview([c, c, c, c]);
    settings.save({ visual: { noteColors: 'custom', customNoteColors: [c, c, c, c] } });
    toast('1. hattın rengi tüm hatlara uygulandı');
  });

  $('#nc-save').addEventListener('click', async () => {
    const name = (prompt('Paletin adı nedir?', 'Paletim') || '').trim().slice(0, 28);
    if (!name) return;
    const colors = readCustom();
    const mine = Array.isArray(s.visual.notePalettes) ? [...s.visual.notePalettes] : [];
    mine.push({ name, colors });
    await settings.save({ visual: { notePalettes: mine } });
    s.visual.notePalettes = mine;
    renderMine();
    toast(`“${name}” paleti kaydedildi`);
  });

  const bindToggle = (id, key) => {
    const el = $(`#${id}`);
    el.addEventListener('change', () => settings.save({ visual: { [key]: el.checked } }));
  };
  bindToggle('vis-hit', 'hitEffects');
  bindToggle('vis-combo', 'comboEffects');
  bindToggle('vis-shake', 'screenShake');
  bindToggle('vis-anim', 'animations');
  bindToggle('vis-fps', 'showFps');
  bindToggle('hud-combo', 'hudCombo');
  bindToggle('hud-jacket', 'hudJacket');
  bindToggle('hud-progress', 'hudProgress');
  bindToggle('hud-pulse', 'comboPulse');

  const hudStyle = $('#hud-style');
  if (hudStyle) {
    hudStyle.value = s.visual.hudStyle || 'cards';
    hudStyle.addEventListener('change', (e) => settings.save({ visual: { hudStyle: e.target.value } }));
  }

  $('#gp-windows').value = s.gameplay.judgementWindows || 'normal';
  $('#gp-windows').addEventListener('change', (e) => settings.save({ gameplay: { judgementWindows: e.target.value } }));

  $('#vis-scale').value = String(s.visual.uiScale || 1);
  $('#vis-scale').addEventListener('change', (e) => settings.save({ visual: { uiScale: Number(e.target.value) } }));

  $('#test-sfx').addEventListener('click', async () => {
    const { sfx } = await import('../app.js');
    sfx.success();
  });

  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { toast('Tam ekran modu başlatılamadı.', 'error'); }
  });

  $('#logout-all').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Tüm oturumları kapat', message: 'Bu cihaz dahil tüm oturumların kapatılacak ve yeniden giriş yapman gerekecek.', confirmText: 'Tümünü kapat', danger: true });
    if (!ok) return;
    try {
      await api('/auth/logout-all', { method: 'POST' });
      auth.user = null;
      toast('Tüm oturumlar kapatıldı.', 'info');
      navigate('/giris');
    } catch (e) { toast(e.message, 'error'); }
  });

  $('#change-pw').addEventListener('click', async () => {
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: $('#cur-pw').value, newPassword: $('#new-pw').value } });
      toast('Şifren güncellendi.', 'success');
      $('#cur-pw').value = ''; $('#new-pw').value = '';
    } catch (e) { toast(e.message, 'error'); }
  });

  /* Tuş atama */
  main.querySelectorAll('.keybind').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lane = btn.dataset.lane;
      btn.innerHTML = `<span>Bir tuşa bas…</span>`;
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { render({ main }); return; }
        if (e.key.length !== 1) return;
        const used = Object.entries(settings.data.keys).filter(([k]) => k !== lane).map(([, v]) => v.toLowerCase());
        if (used.includes(e.key.toLowerCase())) { toast('Bu tuş başka bir hatta atanmış.', 'error'); return; }
        settings.save({ keys: { [lane]: e.key.toLowerCase() } });
        btn.innerHTML = `<span>${esc(e.key.toUpperCase())}</span>${icon('edit')}`;
        document.removeEventListener('keydown', onKey, true);
        toast('Tuş ataması güncellendi.', 'success');
      };
      document.addEventListener('keydown', onKey, true);
    });
  });

  $('#reset-all').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Ayarları sıfırla', message: 'Tüm ses, oynanış ve görsel ayarların varsayılana dönecek.', confirmText: 'Sıfırla', danger: true });
    if (!ok) return;
    settings.reset();
    toast('Ayarlar sıfırlandı.', 'info');
    render({ main });
  });
}
