// ドラム上達ゲーム: フレーズ一覧 (ハブ) と練習画面 (テンポ・録音・採点・成長記録・ずらし)
import { INSTRUMENTS, instrumentById } from '../drums.js';
import { measureTicks } from '../audio/sequencer.js';
import { CATEGORIES, PRESETS, presetById } from './presets.js';
import { shiftLabel, shiftMeasures } from './shift.js';
import { TakeRecorder } from './recorder.js';
import { detectOnsets } from './onsets.js';
import { estimateLatency, rankOf, scoreTake, starsOf } from './scoring.js';
import { allStats, deleteTake, levelOf, listTakes, saveTake, xpOf } from './takes.js';
import { deleteDoc, deleteDocs, listDocs, loadDoc, makeDoc, saveDoc, saveDocs } from '../library.js';
import { parsePack } from './pack.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'drum-practice:game-prefs';
const LAT_KEY = 'drum-practice:latency:';

const GRADE = {
  perfect: { label: 'Perfect', color: 'var(--g-perfect)' },
  great: { label: 'Great', color: 'var(--g-great)' },
  good: { label: 'Good', color: 'var(--g-good)' },
  miss: { label: 'Miss', color: 'var(--g-miss)' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function loadPrefs() {
  try {
    return { loops: 2, metronome: true, clickInRec: false, guide: false, headphones: false, sensitivity: 0.5, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { loops: 2, metronome: true, clickInRec: false, guide: false, headphones: false, sensitivity: 0.5 };
  }
}

export function initGame({ player, toast, setView, openDoc, onPracticeEnter }) {
  const seq = player.seq;
  const prefs = loadPrefs();
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // 無視
    }
  };

  const g = {
    phrase: null, // 元のフレーズ
    shift: { ticks: 0, target: 'all', unit: 12 },
    bpm: 100,
    mode: 'idle', // idle | listen | record | calibrate
    recorder: null,
    notation: null,
    lastResult: null,
    takes: [],
    audioUrl: null,
  };

  // ------------------------------------------------------------ フレーズの取得

  function allPhrases() {
    const mine = listDocs().map((d) => ({ id: d.id, title: d.title, mine: true, category: 'mine', group: d.group, section: d.section, kind: d.kind, order: d.order, level: null, bpm: d.bpm }));
    return { mine, presets: PRESETS };
  }

  function loadPhrase(id) {
    if (id.startsWith('preset:')) {
      const p = presetById(id);
      return p ? JSON.parse(JSON.stringify(p)) : null;
    }
    const d = loadDoc(id);
    return d ? { ...d, mine: true } : null;
  }

  function variant() {
    const p = g.phrase;
    if (!g.shift.ticks) return p;
    const insts = g.shift.target === 'all' ? null : [g.shift.target];
    return { ...p, measures: shiftMeasures(p, g.shift.ticks, insts) };
  }

  // ------------------------------------------------------------ ハブ (ホーム)

  // ホームで選んでいるタブと難易度 (次に開いたときも同じ画面にする)
  const HUB_KEY = 'drum-practice:hub';
  const hub = (() => {
    try {
      return { tab: null, level: 0, book: null, ...JSON.parse(localStorage.getItem(HUB_KEY)) };
    } catch {
      return { tab: null, level: 0, book: null };
    }
  })();
  function setHub(patch) {
    Object.assign(hub, patch);
    try {
      localStorage.setItem(HUB_KEY, JSON.stringify(hub));
    } catch {
      // 無視
    }
    renderHub();
  }

  const OPEN_GROUPS_KEY = 'drum-practice:open-groups';
  const openGroups = new Set(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY)) ?? [];
      } catch {
        return [];
      }
    })(),
  );

  function renderHub() {
    const stats = allStats();
    const lv = levelOf(stats.xp);
    $('hub-level').textContent = lv.level;
    $('hub-xp-fill').style.width = `${Math.round(lv.progress * 100)}%`;
    $('hub-xp-text').textContent = `次のレベルまで ${lv.toNext} XP`;
    $('hub-takes').textContent = stats.takes;
    $('hub-cleared').textContent = Object.values(stats.phrases).filter((p) => p.best >= 80).length;
    $('hub-latency').textContent = latencyLabel();

    const root = $('phrase-sections');
    root.innerHTML = '';
    const { mine, presets } = allPhrases();
    const own = mine.filter((p) => !p.group);
    const imported = mine.filter((p) => p.group);

    // 種類ごとのタブ (基本ビート・16ビート…・マイフレーズ・取り込んだ教本)
    // 教本は一番よく使うので先頭に置く
    const tabs = [];
    if (imported.length) tabs.push({ id: 'books', name: '教本', items: imported });
    if (own.length) tabs.push({ id: 'mine', name: 'マイフレーズ', items: own });
    tabs.push(...CATEGORIES.map((c) => ({ id: c.id, name: c.name, items: presets.filter((p) => p.category === c.id) })));
    if (!tabs.some((t) => t.id === hub.tab)) hub.tab = tabs[0].id;
    const tab = tabs.find((t) => t.id === hub.tab);

    const bar = document.createElement('div');
    bar.className = 'hub-tabs';
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = tabs
      .map((t) => `<button role="tab" data-hub-tab="${t.id}" aria-selected="${t.id === tab.id}">${esc(t.name)}<small>${t.items.length}</small></button>`)
      .join('');
    root.appendChild(bar);
    const sel = bar.querySelector('[aria-selected="true"]');
    bar.scrollLeft = Math.max(0, sel.offsetLeft - (bar.clientWidth - sel.offsetWidth) / 2);

    // 難易度のしぼり込み (レベルのあるフレーズだけ)
    const levels = [...new Set(tab.items.map((p) => p.level).filter(Boolean))].sort((a, b) => a - b);
    if (levels.length > 1) {
      if (hub.level && !levels.includes(hub.level)) hub.level = 0;
      const lvBar = document.createElement('div');
      lvBar.className = 'hub-levels';
      lvBar.innerHTML = [0, ...levels]
        .map((l) => `<button data-hub-level="${l}" aria-pressed="${l === hub.level}">${l ? `Lv${l}` : 'すべて'}</button>`)
        .join('');
      root.appendChild(lvBar);
    }

    if (tab.id === 'books') {
      const groups = [...new Set(imported.map((p) => p.group))].sort((a, b) => a.localeCompare(b, 'ja'));
      if (hub.book && groups.includes(hub.book)) renderBook(hub.book, imported.filter((p) => p.group === hub.book), stats);
      else renderBookList(groups, imported, stats);
    } else {
      const items = levels.length > 1 && hub.level ? tab.items.filter((p) => p.level === hub.level) : tab.items;
      const sec = document.createElement('section');
      sec.className = 'phrase-section';
      sec.innerHTML = '<div class="phrase-grid"></div>';
      const grid = sec.querySelector('.phrase-grid');
      for (const p of items) grid.appendChild(phraseCard(p, stats.phrases[p.id]));
      root.appendChild(sec);
    }
  }

  // 取り込んだ教本・曲の一覧
  function renderBookList(groups, imported, stats) {
    const list = document.createElement('div');
    list.className = 'book-list';
    for (const name of groups) {
      const items = imported.filter((p) => p.group === name);
      const sections = new Set(items.map((p) => p.section).filter(Boolean)).size;
      const done = items.filter((p) => stats.phrases[p.id]).length;
      const b = document.createElement('button');
      b.className = 'book-card';
      b.dataset.hubBook = name;
      b.innerHTML = `<b>${esc(name)}</b><small>${items.length}フレーズ${sections ? ` · ${sections}パート` : ''}${done ? ` · ${done}個練習済み` : ''}</small><svg class="ic"><use href="#i-next" /></svg>`;
      list.appendChild(b);
    }
    $('phrase-sections').appendChild(list);
  }

  const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.title.localeCompare(b.title, 'ja', { numeric: true });

  // 1冊 (1曲) の中: パート (序盤・中盤… / ページ) ごとに折りたたみ、中をフレーズとフィルインに分けて順番に並べる
  function renderBook(name, items, stats) {
    const root = $('phrase-sections');
    const head = document.createElement('div');
    head.className = 'book-head';
    head.innerHTML = `<button class="icon-btn" data-hub-book="" aria-label="教本の一覧へ"><svg class="ic"><use href="#i-prev" /></svg></button>
      <div><b>${esc(name)}</b><small>${items.length}フレーズ</small></div>
      <button class="icon-btn" data-del-group="${esc(name)}" title="この教本ごと削除" aria-label="この教本ごと削除"><svg class="ic"><use href="#i-trash" /></svg></button>`;
    root.appendChild(head);
    const sorted = [...items].sort(byOrder);
    const sections = [];
    for (const p of sorted) {
      const key = p.section ?? 'フレーズ';
      let sec = sections.find((x) => x.name === key);
      if (!sec) sections.push((sec = { name: key, items: [] }));
      sec.items.push(p);
    }
    const anyOpen = sections.some((x) => openGroups.has(`${name}/${x.name}`));
    sections.forEach((sec, i) => {
      const key = `${name}/${sec.name}`;
      const el = document.createElement('details');
      el.className = 'phrase-section phrase-group';
      el.open = openGroups.has(key) || (!anyOpen && i === 0);
      el.innerHTML = `<summary><h3>${esc(sec.name)}</h3><span class="count">${sec.items.length}</span></summary><div class="book-body"></div>`;
      const fill = () => {
        const body = el.querySelector('.book-body');
        if (body.childElementCount) return;
        const kinds = [...new Set(sec.items.map((p) => p.kind ?? ''))];
        const order = ['フレーズ', 'フィルイン'];
        kinds.sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9));
        for (const k of kinds) {
          const list = sec.items.filter((p) => (p.kind ?? '') === k);
          if (kinds.length > 1 || k) {
            const h = document.createElement('h4');
            h.className = 'kind-head';
            h.textContent = `${k || 'その他'} (${list.length})`;
            body.appendChild(h);
          }
          const grid = document.createElement('div');
          grid.className = 'phrase-grid';
          for (const p of list) grid.appendChild(phraseCard(p, stats.phrases[p.id]));
          body.appendChild(grid);
        }
      };
      if (el.open) fill();
      el.addEventListener('toggle', () => {
        if (el.open) openGroups.add(key);
        else openGroups.delete(key);
        try {
          localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...openGroups]));
        } catch {
          // 無視
        }
        if (el.open) fill();
      });
      root.appendChild(el);
    });
  }

  function phraseCard(p, st) {
    const card = document.createElement('div');
    card.className = 'phrase-card';
    const best = st?.best ?? 0;
    const stars = starsOf(best);
    card.innerHTML = `
      <button class="pc-main" data-phrase="${esc(p.id)}">
        <span class="pc-top">
          ${p.level ? `<span class="pc-level">Lv${p.level}</span>` : `<span class="pc-level mine">${p.group ? esc(p.kind ?? 'フレーズ') : 'MY'}</span>`}
          <span class="pc-stars ${stars ? '' : 'none'}" aria-label="星${stars}つ">${starStr(stars)}</span>
        </span>
        <b class="pc-title">${esc(p.title)}</b>
        <small>${st ? `ベスト ${st.best}点 · ${st.bestBpm}BPM · ${st.takes}回` : `目安 ♩=${p.bpm ?? 100} · まだ録音なし`}</small>
      </button>
      ${p.mine ? `<button class="icon-btn pc-del" data-del-phrase="${esc(p.id)}" title="削除" aria-label="削除"><svg class="ic"><use href="#i-trash" /></svg></button>` : ''}`;
    return card;
  }

  // フレーズ集の取り込み。JSON を複数、または zip ごと選べる。
  // 同じ名前の教本・曲がすでにあれば入れ替える (タイトルが同じフレーズは練習の記録を引き継ぐ)
  $('pack-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    try {
      const texts = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // zip は先頭が "PK" (名前や種類が変わっていても中身で見分ける)
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          const { unzipSync, strFromU8 } = await import('fflate');
          const entries = unzipSync(bytes);
          for (const [name, data] of Object.entries(entries)) if (/\.json$/i.test(name) && !name.includes('__MACOSX')) texts.push(strFromU8(data));
        } else {
          texts.push(new TextDecoder().decode(bytes));
        }
      }
      if (!texts.length) throw new Error('フレーズ集の JSON が見つかりません');
      const phrases = texts.flatMap((t) => {
        try {
          return parsePack(t);
        } catch {
          throw new Error('フレーズ集のファイル (.json か .zip) を選んでください');
        }
      });
      const groups = new Set(phrases.map((p) => p.group));
      const old = listDocs().filter((d) => groups.has(d.group));
      const oldIds = new Map(old.map((d) => [`${d.group}\n${d.title}`, d.id]));
      const docs = phrases.map((p) => {
        const doc = makeDoc(p);
        const reuse = oldIds.get(`${p.group}\n${p.title}`);
        if (reuse) {
          doc.id = reuse;
          oldIds.delete(`${p.group}\n${p.title}`);
        }
        return doc;
      });
      // 古いフレーズを先に消して容量を空ける
      deleteDocs(old.map((d) => d.id));
      const saved = saveDocs(docs);
      if (hub.book && !groups.has(hub.book)) hub.book = null;
      renderHub();
      const replaced = old.length ? ` (${[...groups].filter((g) => old.some((d) => d.group === g)).length}冊を入れ替え)` : '';
      if (saved < docs.length) toast(`保存容量が足りず、${docs.length}個中${saved}個だけ取り込みました。使わない教本を削除してください`, 8000);
      else toast(`${groups.size}冊・${docs.length}個のフレーズを取り込みました${replaced}`, 5000);
    } catch (err) {
      toast(`読み込めませんでした: ${err.message}`, 6000);
    }
  });

  $('phrase-sections').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-hub-tab]');
    if (tabBtn) {
      setHub({ tab: tabBtn.dataset.hubTab, level: 0 });
      return;
    }
    const bookBtn = e.target.closest('[data-hub-book]');
    if (bookBtn) {
      setHub({ book: bookBtn.dataset.hubBook || null });
      window.scrollTo({ top: $('phrase-sections').offsetTop - 70 });
      return;
    }
    const lvBtn = e.target.closest('[data-hub-level]');
    if (lvBtn) {
      setHub({ level: Number(lvBtn.dataset.hubLevel) });
      return;
    }
    const delGroup = e.target.closest('[data-del-group]');
    if (delGroup) {
      e.preventDefault();
      const name = delGroup.dataset.delGroup;
      const ids = listDocs().filter((d) => d.group === name).map((d) => d.id);
      if (confirm(`「${name}」の${ids.length}個のフレーズを削除しますか? (録音は残ります)`)) {
        deleteDocs(ids);
        renderHub();
      }
      return;
    }
    const del = e.target.closest('[data-del-phrase]');
    if (del) {
      if (confirm('このフレーズを削除しますか? (録音は残ります)')) {
        deleteDoc(del.dataset.delPhrase);
        renderHub();
      }
      return;
    }
    const b = e.target.closest('[data-phrase]');
    if (b) openPhrase(b.dataset.phrase);
  });

  // ------------------------------------------------------------ 練習画面

  async function openPhrase(id) {
    const p = loadPhrase(id);
    if (!p) {
      toast('フレーズを読み込めませんでした');
      return;
    }
    stopAll();
    g.phrase = p;
    g.shift = { ticks: 0, target: 'all', unit: g.shift.unit ?? 12 };
    g.lastResult = null;
    let bpm = p.bpm ?? 100;
    try {
      bpm = Number(localStorage.getItem(`drum-practice:phrase-bpm:${id}`)) || bpm;
    } catch {
      // 無視
    }
    g.bpm = bpm;
    setView('practice');
    onPracticeEnter?.();
    player.preload();
    $('pv-result').classList.add('hidden');
    renderPracticeHeader();
    renderShiftUI();
    syncPrefsUI();
    setBpm(bpm);
    await renderPracticeNotation();
    await refreshHistory();
  }

  function renderPracticeHeader() {
    const p = g.phrase;
    const st = allStats().phrases[p.id];
    $('pv-title').textContent = p.title;
    const stars = starsOf(st?.best ?? 0);
    $('pv-meta').innerHTML = `${p.level ? `<span class="pc-level">Lv${p.level}</span>` : '<span class="pc-level mine">MY</span>'}
      <span class="pc-stars ${stars ? '' : 'none'}">${starStr(stars)}</span>
      <span>${st ? `ベスト ${st.best}点 (${st.bestBpm}BPM) · 録音 ${st.takes}回${st.maxBpmCleared ? ` · 80点以上の最速 ${st.maxBpmCleared}BPM` : ''}` : 'まだ録音がありません'}</span>`;
    $('pv-edit').textContent = p.mine ? '編集' : 'コピーして編集';
  }

  let notationModule = null;
  async function renderPracticeNotation() {
    notationModule ??= await import('../notation/render.js');
    await notationModule.loadNotationFonts();
    const v = variant();
    const el = $('pv-notation');
    g.notation = notationModule.renderScore(el, v, { width: el.clientWidth });
    const overlay = $('pv-overlay');
    overlay.innerHTML = '';
    overlay.style.height = `${g.notation.height}px`;
    g.notation.boxes.forEach((b, i) => {
      const box = document.createElement('div');
      box.className = 'mbox';
      box.dataset.measure = i;
      Object.assign(box.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      box.innerHTML = '<span class="cursor"></span>';
      overlay.appendChild(box);
    });
    drawJudgments();
  }

  /** 採点結果を楽譜の上に色付きの印で表示 */
  function drawJudgments() {
    const overlay = $('pv-overlay');
    overlay.querySelectorAll('.judge').forEach((el) => el.remove());
    const r = g.lastResult;
    if (!r || !g.notation) return;
    const onsets = expectedOnsets(variant());
    const nm = variant().measures.length;
    onsets.forEach((o, i) => {
      // 最後のループの判定を表示
      const j = r.judgments[(r.loops - 1) * onsets.length + i];
      if (!j || o.measure >= nm) return;
      const box = g.notation.boxes[o.measure];
      const el = document.createElement('div');
      el.className = `judge ${j.grade}`;
      el.style.left = `${g.notation.cursorX(o.measure, o.tick)}px`;
      el.style.top = `${box.y + 2}px`;
      el.title = `${GRADE[j.grade].label}${j.offset != null ? ` ${j.offset > 0 ? '+' : ''}${Math.round(j.offset * 1000)}ms` : ''}`;
      overlay.appendChild(el);
    });
  }

  /** フレーズ1回分の発音位置 (同じ瞬間の音はまとめる) */
  function expectedOnsets(phrase) {
    const out = [];
    phrase.measures.forEach((m, mi) => {
      const ticks = [...new Set(m.notes.map((n) => n.tick))].sort((a, b) => a - b);
      for (const tick of ticks) out.push({ measure: mi, tick });
    });
    return out;
  }

  $('pv-back').addEventListener('click', () => {
    stopAll();
    setView('home');
  });

  $('pv-edit').addEventListener('click', () => {
    stopAll();
    const p = g.phrase;
    if (p.mine && !g.shift.ticks) {
      openDoc(loadDoc(p.id));
      return;
    }
    const v = variant();
    const doc = makeDoc({ title: `${p.title}${g.shift.ticks ? ` (${currentShiftLabel()})` : ''}`, timeSig: v.timeSig, bpm: g.bpm, measures: v.measures });
    saveDoc(doc);
    openDoc(doc);
  });

  // ------------------------------------------------------------ テンポ

  function setBpm(v) {
    g.bpm = Math.min(300, Math.max(30, Math.round(Number(v) || 100)));
    $('pv-bpm').value = g.bpm;
    $('pv-bpm-range').value = g.bpm;
    $('pv-bpm-range').style.setProperty('--fill', `${((g.bpm - 30) / 270) * 100}%`);
    seq.bpm = g.bpm;
    if (g.phrase) {
      try {
        localStorage.setItem(`drum-practice:phrase-bpm:${g.phrase.id}`, String(g.bpm));
      } catch {
        // 無視
      }
    }
  }
  $('pv-bpm').addEventListener('change', (e) => setBpm(e.target.value));
  $('pv-bpm-range').addEventListener('input', (e) => setBpm(e.target.value));
  document.querySelectorAll('[data-pv-tempo]').forEach((b) => b.addEventListener('click', () => setBpm(g.bpm + Number(b.dataset.pvTempo))));

  // ------------------------------------------------------------ 設定 (録音まわり)

  function syncPrefsUI() {
    $('pv-loops').value = String(prefs.loops);
    $('pv-metro').checked = prefs.metronome;
    $('pv-click-rec').checked = prefs.clickInRec;
    $('pv-click-rec').disabled = !prefs.metronome;
    $('pv-guide').checked = prefs.guide;
    $('pv-headphones').checked = prefs.headphones;
  }
  $('pv-loops').addEventListener('change', (e) => {
    prefs.loops = Number(e.target.value);
    savePrefs();
  });
  $('pv-metro').addEventListener('change', (e) => {
    prefs.metronome = e.target.checked;
    if (!prefs.metronome) prefs.clickInRec = false;
    syncPrefsUI();
    savePrefs();
  });
  $('pv-click-rec').addEventListener('change', (e) => {
    prefs.clickInRec = e.target.checked;
    savePrefs();
  });
  $('pv-guide').addEventListener('change', (e) => {
    prefs.guide = e.target.checked;
    savePrefs();
  });
  $('pv-headphones').addEventListener('change', (e) => {
    prefs.headphones = e.target.checked;
    savePrefs();
    $('hub-latency').textContent = latencyLabel();
  });

  // ------------------------------------------------------------ ずらし

  function currentShiftLabel() {
    const inst = g.shift.target === 'all' ? '' : instrumentById[g.shift.target]?.name;
    return shiftLabel(g.shift.ticks, inst);
  }

  function renderShiftUI() {
    const sel = $('pv-shift-target');
    const used = new Set(g.phrase.measures.flatMap((m) => m.notes.map((n) => n.inst)));
    sel.innerHTML = '<option value="all">フレーズ全体</option>';
    for (const inst of INSTRUMENTS) if (used.has(inst.id)) sel.append(new Option(inst.name, inst.id));
    sel.value = used.has(g.shift.target) ? g.shift.target : 'all';
    g.shift.target = sel.value;
    $('pv-shift-unit').value = String(g.shift.unit);
    const label = currentShiftLabel();
    $('pv-shift-label').textContent = label || 'ずらしていません';
    $('pv-shift-reset').disabled = !g.shift.ticks;
    $('pv-shift-save').disabled = !g.shift.ticks;
  }

  function changeShift(dir) {
    stopAll();
    g.shift.ticks += dir * g.shift.unit;
    const total = measureTicks(g.phrase.timeSig) * g.phrase.measures.length;
    if (Math.abs(g.shift.ticks) >= total) g.shift.ticks = 0;
    g.lastResult = null;
    $('pv-result').classList.add('hidden');
    renderShiftUI();
    renderPracticeNotation();
  }
  $('pv-shift-left').addEventListener('click', () => changeShift(-1));
  $('pv-shift-right').addEventListener('click', () => changeShift(1));
  $('pv-shift-target').addEventListener('change', (e) => {
    g.shift.target = e.target.value;
    g.shift.ticks = 0;
    renderShiftUI();
    renderPracticeNotation();
  });
  $('pv-shift-unit').addEventListener('change', (e) => {
    g.shift.unit = Number(e.target.value);
    renderShiftUI();
  });
  $('pv-shift-reset').addEventListener('click', () => {
    g.shift.ticks = 0;
    renderShiftUI();
    renderPracticeNotation();
  });
  $('pv-shift-save').addEventListener('click', () => {
    saveVariantAsPhrase();
    toast('新しいフレーズとして保存しました (マイフレーズ)');
  });

  /** ずらしたパターンをマイフレーズとして保存して、それを開いた状態にする */
  function saveVariantAsPhrase() {
    const v = variant();
    const doc = makeDoc({ title: `${g.phrase.title} (${currentShiftLabel()})`, timeSig: v.timeSig, bpm: g.bpm, measures: v.measures });
    saveDoc(doc);
    g.phrase = { ...doc, mine: true };
    g.shift.ticks = 0;
    renderPracticeHeader();
    renderShiftUI();
    renderPracticeNotation();
    refreshHistory();
    return doc;
  }

  // ------------------------------------------------------------ 再生 (手本を聴く)

  function loopScore(phrase, loops) {
    const measures = [];
    for (let i = 0; i < loops; i++) measures.push(...phrase.measures);
    return { timeSig: phrase.timeSig, measures };
  }

  function stopAll() {
    if (g.mode === 'record' || g.mode === 'calibrate') cancelRecording();
    if (player.playing) player.stop();
    player.drumsMuted = false;
    g.mode = 'idle';
    updateButtons();
  }

  function updateButtons() {
    $('pv-listen').classList.toggle('active', g.mode === 'listen');
    $('pv-listen-label').textContent = g.mode === 'listen' ? '止める' : '手本を聴く';
    $('pv-record').classList.toggle('active', g.mode === 'record');
    $('pv-record-label').textContent = g.mode === 'record' ? '録音をやめる' : '録音する';
    $('pv-listen').disabled = g.mode === 'record' || g.mode === 'calibrate';
  }

  $('pv-listen').addEventListener('click', async () => {
    if (g.mode === 'listen') {
      stopAll();
      return;
    }
    stopAll();
    const v = variant();
    player.setScore(v);
    seq.bpm = g.bpm;
    seq.metronome = prefs.metronome;
    seq.loop = { enabled: true, start: 0, end: v.measures.length - 1 };
    seq.tempoUp = { ...seq.tempoUp, enabled: false };
    player.countIn = false;
    player.drumsMuted = false;
    player.resume();
    await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2500))]);
    player.play(0);
    g.mode = 'listen';
    updateButtons();
  });

  // ------------------------------------------------------------ 録音と採点

  function latencyKey() {
    return LAT_KEY + (prefs.headphones ? 'headphones' : 'speaker');
  }

  function latency() {
    try {
      const v = localStorage.getItem(latencyKey());
      if (v != null) return Number(v);
    } catch {
      // 無視
    }
    const ctx = player.ctx;
    return (ctx?.outputLatency || 0.02) + (ctx?.baseLatency || 0.01) + 0.01;
  }

  function latencyLabel() {
    let v = null;
    try {
      v = localStorage.getItem(latencyKey());
    } catch {
      // 無視
    }
    return v == null ? '未調整' : `${Math.round(Number(v) * 1000)}ms`;
  }

  async function ensureRecorder() {
    player.ensureContext();
    player.resume();
    g.recorder ??= new TakeRecorder(player.ctx, player.synth.clickBus);
    await g.recorder.open({ headphones: prefs.headphones });
  }

  let recordJob = null;

  $('pv-record').addEventListener('click', async () => {
    if (g.mode === 'record') {
      stopAll();
      toast('録音をやめました');
      return;
    }
    stopAll();
    try {
      await ensureRecorder();
    } catch (err) {
      toast('マイクを使えませんでした。ブラウザのマイクの許可を確認してください', 6000);
      console.error(err);
      return;
    }
    if (g.shift.ticks) {
      saveVariantAsPhrase();
      toast('ずらしたパターンをマイフレーズに保存して録音します', 3500);
    }
    await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2500))]);
    startRecording();
  });

  function startRecording() {
    const phrase = g.phrase;
    const loops = prefs.loops;
    const score = loopScore(phrase, loops);
    player.setScore(score);
    seq.bpm = g.bpm;
    seq.metronome = prefs.metronome;
    seq.loop = { enabled: false, start: 0, end: 0 };
    seq.tempoUp = { ...seq.tempoUp, enabled: false };
    player.countIn = true;
    player.drumsMuted = !prefs.guide;
    g.recorder.start({ includeClick: prefs.metronome && prefs.clickInRec });
    player.play(0);
    g.mode = 'record';
    updateButtons();
    $('pv-rec-overlay').classList.remove('hidden');

    const spt = 60 / (g.bpm * 48);
    const mt = measureTicks(phrase.timeSig);
    const start = player.startTime + mt * spt; // カウントインの後
    const one = expectedOnsets(phrase);
    const expected = [];
    for (let l = 0; l < loops; l++) {
      for (const o of one) expected.push(start + ((l * phrase.measures.length + o.measure) * mt + o.tick) * spt);
    }
    const end = start + loops * phrase.measures.length * mt * spt;
    const job = { phrase, loops, expected, start, end, bpm: g.bpm, cancelled: false };
    recordJob = job;
    const wait = () => {
      if (job.cancelled) return;
      if (player.ctx.currentTime < end + 0.6) {
        requestAnimationFrame(wait);
        return;
      }
      finishRecording(job);
    };
    requestAnimationFrame(wait);
  }

  function cancelRecording() {
    if (recordJob) recordJob.cancelled = true;
    recordJob = null;
    $('pv-rec-overlay').classList.add('hidden');
    if (g.recorder?.media?.state === 'recording') g.recorder.stop().catch(() => {});
  }

  async function finishRecording(job) {
    recordJob = null;
    if (player.playing) player.stop();
    player.drumsMuted = false;
    g.mode = 'idle';
    updateButtons();
    $('pv-rec-overlay').classList.add('hidden');
    const rec = await g.recorder.stop();
    const lat = latency();
    const onsets = detectOnsets(rec.pcm, rec.sampleRate, { sensitivity: prefs.sensitivity });
    const lo = job.expected[0] - 0.3;
    const hi = job.end + 0.1;
    const hits = onsets.map((o) => ({ time: rec.pcmStart + o.time - lat, level: o.level })).filter((h) => h.time >= lo && h.time <= hi);
    const result = scoreTake(job.expected, hits);
    result.loops = job.loops;

    const before = allStats();
    const prevBest = before.phrases[job.phrase.id]?.best ?? 0;
    const prevLevel = levelOf(before.xp).level;
    const take = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      phraseId: job.phrase.id,
      date: Date.now(),
      bpm: job.bpm,
      loops: job.loops,
      score: result.score,
      rank: result.rank,
      counts: result.counts,
      extra: result.extra,
      meanOffset: result.meanOffset,
      spread: result.spread,
      offsets: result.judgments.map((j) => (j.offset == null ? null : Math.round(j.offset * 1000))),
      withClick: prefs.metronome && prefs.clickInRec,
      guide: prefs.guide,
      blob: rec.blob,
      mime: rec.mime,
    };
    try {
      await saveTake(take);
    } catch (err) {
      console.error(err);
      toast('録音を保存できませんでした (ブラウザの保存容量を確認してください)', 6000);
    }
    const after = allStats();
    const newLevel = levelOf(after.xp).level;
    g.lastResult = result;
    showResult(result, take, { newBest: take.score > prevBest && prevBest > 0, firstTake: !before.phrases[job.phrase.id], levelUp: newLevel > prevLevel ? newLevel : null, xp: xpOf(take) });
    drawJudgments();
    renderPracticeHeader();
    await refreshHistory();
  }

  function showResult(r, take, { newBest, levelUp, xp }) {
    const el = $('pv-result');
    el.classList.remove('hidden');
    const tendency =
      Math.abs(r.meanOffset) < 0.008 ? 'ジャスト' : r.meanOffset < 0 ? `走り気味 (${Math.round(-r.meanOffset * 1000)}ms 早い)` : `もたり気味 (${Math.round(r.meanOffset * 1000)}ms 遅い)`;
    const banners = [];
    if (levelUp) banners.push(`<div class="banner level">レベルアップ! Lv${levelUp}</div>`);
    if (newBest) banners.push('<div class="banner best">自己ベスト更新!</div>');
    el.innerHTML = `
      ${banners.join('')}
      <div class="result-main">
        <div class="result-score"><span class="rank rank-${r.rank}">${r.rank}</span><b>${r.score}</b><small>点</small></div>
        <div class="result-stars">${starStr(starsOf(r.score))}</div>
        <div class="result-xp">+${xp} XP</div>
      </div>
      <div class="result-counts">
        ${['perfect', 'great', 'good', 'miss'].map((k) => `<span class="cnt ${k}"><i></i>${GRADE[k].label}<b>${r.counts[k]}</b></span>`).join('')}
        <span class="cnt extra">余計な音<b>${r.extra}</b></span>
      </div>
      <div class="result-feel">
        <div><small>タイミングの傾向</small><b>${tendency}</b></div>
        <div><small>ばらつき</small><b>${r.spread ? `±${Math.round(r.spread * 1000)}ms` : '-'}</b></div>
        <div><small>テンポ</small><b>${take.bpm} BPM</b></div>
      </div>
      ${timingStrip(r)}
      <audio controls src="${URL.createObjectURL(take.blob)}"></audio>
      <p class="note">楽譜の上の印は最後の1回分の判定です (緑 Perfect / 青 Great / 黄 Good / 赤 Miss)。</p>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** 各音のずれ (早い/遅い) を並べた図 */
  function timingStrip(r) {
    const n = r.judgments.length;
    if (!n) return '';
    const w = 600;
    const h = 90;
    const mid = h / 2;
    const scale = (h / 2 - 8) / 0.09;
    const step = w / n;
    const bars = r.judgments
      .map((j, i) => {
        const x = i * step + step / 2;
        if (j.offset == null) return `<g><title>${i + 1}音目: Miss</title><text x="${x}" y="${mid + 4}" class="miss-x" text-anchor="middle">×</text></g>`;
        const y = mid + j.offset * scale;
        return `<g><title>${i + 1}音目: ${GRADE[j.grade].label} ${j.offset > 0 ? '+' : ''}${Math.round(j.offset * 1000)}ms</title><line x1="${x}" x2="${x}" y1="${mid}" y2="${y}" class="tick ${j.grade}" /><circle cx="${x}" cy="${y}" r="3.5" class="dot ${j.grade}" /></g>`;
      })
      .join('');
    return `<div class="strip-wrap"><div class="strip-labels"><span>早い</span><span>ジャスト</span><span>遅い</span></div>
      <svg class="timing-strip" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="各音のタイミングのずれ">
        <rect x="0" y="${mid - 0.025 * scale}" width="${w}" height="${0.05 * scale}" class="zone" />
        <line x1="0" x2="${w}" y1="${mid}" y2="${mid}" class="axis" />${bars}
      </svg></div>`;
  }

  // ------------------------------------------------------------ 成長の記録

  async function refreshHistory() {
    try {
      g.takes = await listTakes(g.phrase.id);
    } catch {
      g.takes = [];
    }
    renderChart();
    renderTakeList();
  }

  function renderChart() {
    const takes = g.takes;
    const el = $('pv-chart');
    if (!takes.length) {
      el.innerHTML = '<p class="note">録音すると、ここに点数の推移が表示されます。</p>';
      return;
    }
    const w = Math.max(280, el.clientWidth || 640);
    const h = 190;
    const pad = { l: 34, r: 14, t: 14, b: 26 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const x = (i) => pad.l + (takes.length === 1 ? iw / 2 : (i / (takes.length - 1)) * iw);
    const y = (s) => pad.t + ih - (s / 100) * ih;
    const grid = [60, 80, 92]
      .map((s, k) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(s)}" y2="${y(s)}" class="gl" /><text x="${pad.l - 6}" y="${y(s) + 4}" text-anchor="end" class="gt">${'★'.repeat(k + 1)}</text>`)
      .join('');
    const path = takes.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t.score).toFixed(1)}`).join('');
    let best = 0;
    const pts = takes
      .map((t, i) => {
        const isBest = t.score > best;
        best = Math.max(best, t.score);
        const d = new Date(t.date);
        return `<g class="pt"><circle cx="${x(i)}" cy="${y(t.score)}" r="${isBest ? 5 : 4}" class="${isBest ? 'best' : ''}" />
          <circle cx="${x(i)}" cy="${y(t.score)}" r="14" class="hit" />
          <title>${i + 1}回目 ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n${t.score}点 (${t.rank}) · ${t.bpm}BPM</title></g>`;
      })
      .join('');
    // テンポが変わった点にラベル
    const bpmLabels = takes
      .map((t, i) => (i === 0 || takes[i - 1].bpm !== t.bpm ? `<text x="${x(i)}" y="${h - 8}" text-anchor="${i === 0 && takes.length > 1 ? 'start' : 'middle'}" class="bl">${t.bpm}</text>` : ''))
      .join('');
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="progress-chart" role="img" aria-label="点数の推移 (縦軸: 点数、横軸: 録音した順、下の数字はテンポ)">
      <text x="${pad.l - 8}" y="${h - 8}" class="bl" text-anchor="end">BPM</text>
      ${grid}<path d="${path}" class="ln" />${pts}${bpmLabels}</svg>`;
  }

  function renderTakeList() {
    const list = $('pv-takes');
    list.innerHTML = '';
    if (!g.takes.length) return;
    const sorted = [...g.takes].reverse();
    for (const t of sorted) {
      const d = new Date(t.date);
      const item = document.createElement('div');
      item.className = 'take';
      item.innerHTML = `
        <span class="rank rank-${t.rank}">${t.rank}</span>
        <span class="take-main"><b>${t.score}点</b> <small>${t.bpm}BPM · ${t.loops}回 · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${t.withClick ? ' · クリック入り' : ''}</small></span>
        <button class="tool" data-play-take="${t.id}" title="聞く">▶</button>
        <button class="tool danger" data-del-take="${t.id}" title="削除"><svg class="ic"><use href="#i-trash" /></svg></button>`;
      list.appendChild(item);
    }
  }

  $('pv-takes').addEventListener('click', async (e) => {
    const play = e.target.closest('[data-play-take]');
    if (play) {
      const t = g.takes.find((x) => x.id === play.dataset.playTake);
      if (!t) return;
      const audio = $('pv-take-audio');
      if (g.audioUrl) URL.revokeObjectURL(g.audioUrl);
      g.audioUrl = URL.createObjectURL(t.blob);
      audio.src = g.audioUrl;
      audio.play().catch(() => {});
      return;
    }
    const del = e.target.closest('[data-del-take]');
    if (del && confirm('この録音を削除しますか?')) {
      await deleteTake(del.dataset.delTake, g.phrase.id);
      renderPracticeHeader();
      await refreshHistory();
    }
  });

  // ------------------------------------------------------------ タイミング補正 (遅延の計測)

  async function calibrate() {
    if (g.mode !== 'idle') stopAll();
    try {
      await ensureRecorder();
    } catch {
      toast('マイクを使えませんでした。ブラウザのマイクの許可を確認してください', 6000);
      return;
    }
    toast('クリックに合わせて8回叩いてください (手拍子でもOK)', 4000);
    const bpm = 90;
    const score = { timeSig: { beats: 4, beatUnit: 4 }, measures: [{ grid: 4, notes: [] }, { grid: 4, notes: [] }] };
    player.setScore(score);
    seq.bpm = bpm;
    seq.metronome = true;
    seq.loop = { enabled: false, start: 0, end: 0 };
    player.countIn = true;
    player.drumsMuted = true;
    g.recorder.start({ includeClick: false });
    player.play(0);
    g.mode = 'calibrate';
    updateButtons();
    const beat = 60 / bpm;
    const start = player.startTime + 4 * beat;
    const clicks = Array.from({ length: 8 }, (_, k) => start + k * beat);
    const end = clicks[7] + 0.8;
    const wait = async () => {
      if (g.mode !== 'calibrate') return;
      if (player.ctx.currentTime < end) {
        requestAnimationFrame(wait);
        return;
      }
      g.mode = 'idle';
      if (player.playing) player.stop();
      player.drumsMuted = false;
      updateButtons();
      const rec = await g.recorder.stop();
      const hits = detectOnsets(rec.pcm, rec.sampleRate, { sensitivity: prefs.sensitivity }).map((o) => ({ time: rec.pcmStart + o.time }));
      const lat = estimateLatency(clicks, hits);
      if (lat == null) {
        toast('うまく計れませんでした。クリックに合わせてもう一度叩いてみてください', 5000);
        return;
      }
      try {
        localStorage.setItem(latencyKey(), String(lat));
      } catch {
        // 無視
      }
      $('hub-latency').textContent = latencyLabel();
      toast(`タイミング補正: ${Math.round(lat * 1000)}ms に設定しました`, 4000);
    };
    requestAnimationFrame(wait);
  }

  $('hub-calibrate').addEventListener('click', calibrate);
  $('pv-calibrate').addEventListener('click', calibrate);

  // 再生中のカーソル・カウント表示
  function frame() {
    if (document.body.dataset.view === 'practice' && g.notation) {
      const pos = player.position();
      const overlay = $('pv-overlay');
      overlay.querySelectorAll('.mbox.playing').forEach((el) => el.classList.remove('playing'));
      if (pos && pos.measure >= 0 && (g.mode === 'listen' || g.mode === 'record')) {
        const nm = g.notation.boxes.length;
        const mi = pos.measure % nm;
        const box = overlay.querySelector(`.mbox[data-measure="${mi}"]`);
        if (box) {
          box.classList.add('playing');
          box.querySelector('.cursor').style.left = `${g.notation.cursorX(mi, pos.tick) - box.offsetLeft}px`;
        }
      }
      if (g.mode === 'record') {
        const c = $('pv-rec-count');
        if (pos && pos.measure === -1) c.textContent = String(Math.floor(pos.tick / 48) + 1);
        else if (pos) c.textContent = `${Math.floor(pos.measure / g.phrase.measures.length) + 1} / ${prefs.loops}`;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $('pv-rec-stop').addEventListener('click', () => {
    stopAll();
    toast('録音をやめました');
  });

  return { renderHub, openPhrase, stopAll, rerender: () => g.phrase && renderPracticeNotation() };
}

export { rankOf };
