// ドラム上達ゲーム: フレーズ一覧 (ハブ) と練習画面 (テンポ・録音・採点・成長記録・ずらし)
import { INSTRUMENTS, PPQ, instrumentById } from '../drums.js';
import { measureTicks, ticksPerBeat } from '../audio/sequencer.js';
import { CLICK_MODES, clickTicks, isRestBar } from '../audio/clicks.js';
import { analyzeTake } from './analysis.js';
import { initSongImport } from './song-import.js';
import { SongSync, deleteSong, songBuffer } from './songs.js';
import { CATEGORIES, PRESETS, presetById } from './presets.js';
import { shiftLabel, shiftMeasures } from './shift.js';
import { TakeRecorder } from './recorder.js';
import { detectOnsets } from './onsets.js';
import { WINDOWS, estimateLatency, rankOf, scoreTake, starsOf } from './scoring.js';
import { allStats, deleteTake, levelOf, listTakes, saveTake, xpOf } from './takes.js';
import { deleteDoc, deleteDocs, listDocs, loadDoc, makeDoc, saveDoc, saveDocs } from '../library.js';
import { parsePack } from './pack.js';
import { mixdownTake } from './mixdown.js';
import { LiveListener } from './live.js';
import { getSetting, initSettings, setSetting } from '../settings-store.js';

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

const PREF_DEFAULTS = { loops: 2, metronome: true, clickInRec: false, guide: false, headphones: false, sensitivity: 0.5, video: false, facing: 'user', clickMode: 'all', autoUp: false, upPass: 90, upStep: 5, withSong: true, songVol: 0.8 };
const msStr = (s) => `${s > 0 ? '+' : ''}${Math.round(s * 1000)}ms`;

function loadPrefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...PREF_DEFAULTS };
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
    shift: { ticks: 0, target: 'all', unit: PPQ / 4 },
    range: null, // 一部の小節だけ練習するとき { from, to } (0 始まり)
    playRange: null, // 鳴らしている譜面が元の何小節目からか { from, len }
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

  // お気に入り (フレーズの id の並び)。消えないよう IndexedDB にも保存する
  const FAV_KEY = 'drum-practice:favorites';
  const favs = () => new Set(getSetting(FAV_KEY) ?? []);
  function toggleFav(id) {
    const list = [...(getSetting(FAV_KEY) ?? [])];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    setSetting(FAV_KEY, list);
    return i < 0;
  }

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
    const favIds = getSetting(FAV_KEY) ?? [];
    const all = [...mine, ...presets];
    const favItems = favIds.map((id) => all.find((p) => p.id === id)).filter(Boolean);
    if (favItems.length) tabs.push({ id: 'favs', name: '★ お気に入り', items: favItems });
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
    const levels = tab.id === 'favs' ? [] : [...new Set(tab.items.map((p) => p.level).filter(Boolean))].sort((a, b) => a - b);
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
    const isFav = favs().has(p.id);
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
      <button class="icon-btn pc-fav ${isFav ? 'on' : ''}" data-fav="${esc(p.id)}" aria-label="${isFav ? 'お気に入りから外す' : 'お気に入りに追加'}" aria-pressed="${isFav}">${isFav ? '★' : '☆'}</button>
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
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const on = toggleFav(fav.dataset.fav);
      toast(on ? 'お気に入りに追加しました' : 'お気に入りから外しました', 1800);
      // タブの件数や有無も変わるので描き直す (スクロール位置は保つ)
      const y = window.scrollY;
      renderHub();
      window.scrollTo(0, y);
      return;
    }
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
        const songs = new Set(ids.map((id) => loadDoc(id)?.song?.id).filter(Boolean));
        deleteDocs(ids);
        // ほかのフレーズが使っていない曲のファイルも消す
        const still = new Set(listDocs().map((d) => loadDoc(d.id)?.song?.id).filter(Boolean));
        for (const id of songs) if (!still.has(id)) deleteSong(id).catch(() => {});
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
    g.shift = { ticks: 0, target: 'all', unit: g.shift.unit ?? PPQ / 4 };
    g.range = null;
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
    renderNav();
    renderShiftUI();
    renderRangeUI();
    syncPrefsUI();
    setBpm(bpm);
    loadSongFor(p);
    await renderPracticeNotation();
    await refreshHistory();
  }

  // 今のフレーズと同じ並び (同じ教本・同じカテゴリ・マイフレーズ) の前後
  function phraseList() {
    const p = g.phrase;
    if (!p) return [];
    // お気に入りタブから開いたときはお気に入りの中で前後に動く
    if (hub.tab === 'favs' && favs().has(p.id)) return (getSetting(FAV_KEY) ?? []).filter((id) => loadPhrase(id));
    if (p.preset) return PRESETS.filter((x) => x.category === p.category).map((x) => x.id);
    const { mine } = allPhrases();
    if (p.group) return mine.filter((x) => x.group === p.group).sort(byOrder).map((x) => x.id);
    return mine.filter((x) => !x.group).map((x) => x.id);
  }

  function renderNav() {
    const list = phraseList();
    const i = list.indexOf(g.phrase?.id);
    const blocked = g.mode === 'record' || g.mode === 'calibrate';
    $('pv-prev').disabled = blocked || i <= 0;
    $('pv-next').disabled = blocked || i < 0 || i >= list.length - 1;
    const p = g.phrase;
    const where = hub.tab === 'favs' && favs().has(p?.id) ? 'お気に入り' : p?.group ? `${p.group}${p.section ? ` · ${p.section}` : ''}` : p?.preset ? (CATEGORIES.find((c) => c.id === p.category)?.name ?? '') : 'マイフレーズ';
    $('pv-pos').textContent = i >= 0 ? `${where}  ${i + 1} / ${list.length}` : '';
  }

  function goNeighbor(d) {
    const list = phraseList();
    const i = list.indexOf(g.phrase?.id);
    const id = list[i + d];
    if (id) openPhrase(id);
  }
  $('pv-prev').addEventListener('click', () => goNeighbor(-1));
  $('pv-next').addEventListener('click', () => goNeighbor(1));

  function renderPracticeHeader() {
    const p = g.phrase;
    const st = allStats().phrases[p.id];
    $('pv-title').textContent = p.title;
    const stars = starsOf(st?.best ?? 0);
    $('pv-meta').innerHTML = `${p.level ? `<span class="pc-level">Lv${p.level}</span>` : `<span class="pc-level mine">${p.group ? esc(p.kind ?? 'フレーズ') : 'MY'}</span>`}
      <span class="pc-stars ${stars ? '' : 'none'}">${starStr(stars)}</span>
      <span>${st ? `ベスト ${st.best}点 (${st.bestBpm}BPM) · 録音 ${st.takes}回${st.maxBpmCleared ? ` · 80点以上の最速 ${st.maxBpmCleared}BPM` : ''}` : 'まだ録音がありません'}</span>`;
    $('pv-edit').textContent = p.mine ? '編集' : 'コピーして編集';
    const on = favs().has(p.id);
    $('pv-fav').textContent = on ? '★' : '☆';
    $('pv-fav').classList.toggle('on', on);
    $('pv-fav').setAttribute('aria-pressed', String(on));
    $('pv-fav').setAttribute('aria-label', on ? 'お気に入りから外す' : 'お気に入りに追加');
  }

  let notationModule = null;
  async function renderPracticeNotation() {
    notationModule ??= await import('../notation/render.js');
    await notationModule.loadNotationFonts();
    const v = variant();
    const el = $('pv-notation');
    try {
      g.notation = notationModule.renderScore(el, v, { width: el.clientWidth });
    } catch (err) {
      console.error(err);
      g.notation = null;
      el.innerHTML = `<p class="note notation-error">譜面を表示できませんでした (${esc(err.message)})。ページを再読み込みしても直らないときは、このフレーズを教えてください。</p>`;
      $('pv-overlay').innerHTML = '';
      return;
    }
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
    markRange();
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
      for (const tick of ticks) out.push({ measure: mi, tick, insts: m.notes.filter((n) => n.tick === tick).map((n) => n.inst) });
    });
    return out;
  }

  $('pv-back').addEventListener('click', () => {
    stopAll();
    setView('home');
  });

  $('pv-fav').addEventListener('click', () => {
    if (!g.phrase) return;
    const on = toggleFav(g.phrase.id);
    renderPracticeHeader();
    renderNav();
    toast(on ? 'お気に入りに追加しました' : 'お気に入りから外しました', 1800);
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

  let liveRestart = null;
  let listenRestart = null;
  function setBpm(v, { quiet = false } = {}) {
    const prev = g.bpm;
    g.bpm = Math.min(300, Math.max(30, Math.round(Number(v) || 100)));
    // ライブ採点中にテンポを変えたら、新しいテンポで数え直す (スライダーを動かしている間は待つ)
    // quiet: 自動テンポアップで演奏中に変わったとき (数え直さない)
    if (g.mode === 'live' && prev !== g.bpm && !quiet) {
      clearTimeout(liveRestart);
      liveRestart = setTimeout(() => {
        if (g.mode !== 'live') return;
        stopAll();
        startLive();
      }, 400);
    }
    $('pv-bpm').value = g.bpm;
    $('pv-bpm-range').value = g.bpm;
    $('pv-bpm-range').style.setProperty('--fill', `${((g.bpm - 30) / 270) * 100}%`);
    if (!quiet) seq.bpm = g.bpm;
    // 原曲と一緒に手本を聴いているときは、新しいテンポで鳴らし直す
    if (g.mode === 'listen' && g.songSync?.job && prev !== g.bpm) {
      clearTimeout(listenRestart);
      listenRestart = setTimeout(() => {
        if (g.mode !== 'listen') return;
        stopAll();
        $('pv-listen').click();
      }, 400);
    }
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
    $('pv-video').checked = prefs.video;
    $('pv-facing').value = prefs.facing;
    $('pv-facing').disabled = !prefs.video;
    const hasSong = !!g.phrase?.song;
    document.querySelectorAll('.song-only').forEach((el) => el.classList.toggle('hidden', !hasSong));
    $('pv-with-song').checked = prefs.withSong;
    $('pv-song-vol').value = String(prefs.songVol);
    $('pv-song-vol').disabled = !prefs.withSong;
    $('pv-click-mode').value = prefs.clickMode;
    $('pv-click-mode').disabled = !prefs.metronome;
    $('pv-autoup').checked = prefs.autoUp;
    $('pv-up-pass').value = String(prefs.upPass);
    $('pv-up-step').value = String(prefs.upStep);
    $('pv-up-pass').disabled = $('pv-up-step').disabled = !prefs.autoUp;
    updateButtons();
  }
  $('pv-click-mode').innerHTML = CLICK_MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  $('pv-click-mode').addEventListener('change', (e) => {
    prefs.clickMode = e.target.value;
    savePrefs();
    restartLive();
  });
  $('pv-autoup').addEventListener('change', (e) => {
    prefs.autoUp = e.target.checked;
    savePrefs();
    syncPrefsUI();
  });
  $('pv-up-pass').addEventListener('change', (e) => {
    prefs.upPass = Number(e.target.value);
    savePrefs();
  });
  $('pv-up-step').addEventListener('change', (e) => {
    prefs.upStep = Number(e.target.value);
    savePrefs();
  });

  /** ライブ採点中に設定を変えたら最初から数え直す */
  function restartLive() {
    if (g.mode !== 'live') return;
    stopAll();
    startLive();
  }

  // ------------------------------------------------------------ 原曲と一緒に練習 (曲から作ったフレーズ)

  let songLoad = null;
  function loadSongFor(p) {
    g.songBuf = null;
    if (!p.song) return;
    player.ensureContext();
    const id = p.song.id;
    songLoad = songBuffer(player.ctx, id)
      .then((buf) => {
        if (g.phrase?.song?.id === id) g.songBuf = buf;
        if (!buf) toast('このフレーズの原曲のファイルが見つかりません (曲から作り直すと鳴らせます)', 5000);
      })
      .catch((err) => {
        console.error(err);
        toast('原曲を読み込めませんでした', 4000);
      });
  }

  /** loopAt(l) → { time, bpm } に合わせて原曲を鳴らす。bars = 1回分の小節数 */
  async function startSong(loopAt, bars) {
    const song = g.phrase?.song;
    if (!song || !prefs.withSong) return;
    if (!g.songBuf) await songLoad;
    if (!g.songBuf || g.mode === 'idle') return;
    g.songSync ??= new SongSync(player.ctx, player.synth.master);
    g.songSync.volume = prefs.songVol;
    const from = g.mode === 'record' ? 0 : (g.range?.from ?? 0);
    g.songSync.start({ buffer: g.songBuf, start: song.start + (from * 240) / song.bpm, songBpm: song.bpm, bars, loopAt });
  }

  $('pv-with-song').addEventListener('change', (e) => {
    prefs.withSong = e.target.checked;
    savePrefs();
    if (!prefs.withSong) g.songSync?.stop();
    syncPrefsUI();
  });
  $('pv-song-vol').addEventListener('input', (e) => {
    prefs.songVol = Number(e.target.value);
    if (g.songSync) g.songSync.volume = prefs.songVol;
    savePrefs();
  });

  // 曲から楽譜を作る
  initSongImport({
    player,
    toast,
    renderScore: (el, score, opts) => {
      (async () => {
        notationModule ??= await import('../notation/render.js');
        await notationModule.loadNotationFonts();
        notationModule.renderScore(el, score, opts);
      })().catch((err) => {
        el.textContent = `譜面を表示できませんでした (${err.message})`;
      });
    },
    onCreated: (name) => setHub({ tab: 'books', book: name }),
  });

  // ------------------------------------------------------------ 一部の小節だけ練習

  function practicePhrase() {
    const v = variant();
    if (!g.range) return v;
    return { ...v, measures: v.measures.slice(g.range.from, g.range.to + 1) };
  }

  function setRange(from, to) {
    const n = g.phrase.measures.length;
    from = Math.max(0, Math.min(n - 1, from));
    to = Math.max(from, Math.min(n - 1, to));
    g.range = from === 0 && to === n - 1 ? null : { from, to };
    renderRangeUI();
    markRange();
    updateButtons();
    restartLive();
  }

  function renderRangeUI() {
    const n = g.phrase.measures.length;
    $('pv-range-row').classList.toggle('hidden', n < 2);
    const opts = Array.from({ length: n }, (_, i) => `<option value="${i}">${i + 1}小節目</option>`).join('');
    $('pv-range-from').innerHTML = opts;
    $('pv-range-to').innerHTML = opts;
    $('pv-range-from').value = String(g.range?.from ?? 0);
    $('pv-range-to').value = String(g.range?.to ?? n - 1);
    $('pv-range-banner').classList.toggle('hidden', !g.range);
    if (g.range) {
      const { from, to } = g.range;
      $('pv-range-label').textContent = `${from === to ? `${from + 1}小節目` : `${from + 1}〜${to + 1}小節目`}だけ練習中 (手本・ライブ採点)`;
    }
  }

  /** 練習しない小節を薄くする */
  function markRange() {
    $('pv-overlay')
      .querySelectorAll('.mbox')
      .forEach((el) => {
        const i = Number(el.dataset.measure);
        el.classList.toggle('out-range', !!g.range && (i < g.range.from || i > g.range.to));
      });
  }

  $('pv-range-from').addEventListener('change', (e) => {
    const from = Number(e.target.value);
    setRange(from, Math.max(from, Number($('pv-range-to').value)));
  });
  $('pv-range-to').addEventListener('change', (e) => {
    const to = Number(e.target.value);
    setRange(Math.min(to, Number($('pv-range-from').value)), to);
  });
  $('pv-range-clear').addEventListener('click', () => setRange(0, g.phrase.measures.length - 1));

  // 分析の「この小節をループ練習」
  function onWeakClick(e) {
    const b = e.target.closest('[data-weak]');
    if (!b) return;
    const m = Number(b.dataset.weak);
    setRange(m, m);
    toast(`${m + 1}小節目だけを繰り返します。ライブ採点(◎)で練習しましょう`, 3500);
    if (g.mode !== 'live') document.querySelector('.pv-buttons')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('pv-result').addEventListener('click', onWeakClick);
  $('pv-live-panel').addEventListener('click', onWeakClick);
  $('pv-video').addEventListener('change', (e) => {
    prefs.video = e.target.checked;
    savePrefs();
    syncPrefsUI();
    renderLatencyUI();
  });
  $('pv-facing').addEventListener('change', (e) => {
    prefs.facing = e.target.value;
    savePrefs();
  });
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
    renderLatencyUI();
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
    if (g.mode === 'live') stopLive();
    if (player.playing) player.stop();
    player.drumsMuted = false;
    seq.clickMode = 'all';
    seq.restSilence = false;
    seq.nextBpm = null;
    seq.onWrap = null;
    g.songSync?.stop();
    g.playRange = null;
    g.mode = 'idle';
    updateButtons();
  }

  function updateButtons() {
    const listening = g.mode === 'listen';
    const recording = g.mode === 'record';
    $('pv-listen').classList.toggle('active', listening);
    $('pv-listen').querySelector('use').setAttribute('href', listening ? '#i-stop' : '#i-play');
    $('pv-listen').setAttribute('aria-label', listening ? '止める' : '手本を聴く');
    $('pv-listen').title = listening ? '止める' : '手本を聴く';
    $('pv-record').classList.toggle('active', recording);
    const what = prefs.video ? '録画' : '録音';
    $('pv-record').setAttribute('aria-label', recording ? `${what}をやめる` : `${what}する`);
    $('pv-record').title = recording ? `${what}をやめる` : `${what}する`;
    $('pv-record').querySelector('.rec-dot').classList.toggle('hidden', prefs.video && !recording);
    $('pv-record').querySelector('.rec-cam').classList.toggle('hidden', !prefs.video || recording);
    const live = g.mode === 'live';
    $('pv-live').classList.toggle('active', live);
    $('pv-live').querySelector('use').setAttribute('href', live ? '#i-stop' : '#i-target');
    $('pv-live').setAttribute('aria-label', live ? 'ライブ採点を止める' : 'ライブ採点');
    if (g.phrase) renderNav();
    $('pv-listen').disabled = g.mode === 'record' || g.mode === 'calibrate';
    $('pv-live').disabled = g.mode === 'record' || g.mode === 'calibrate';
    $('pv-record').disabled = g.mode === 'live' || g.mode === 'calibrate' || !!g.range;
    if (g.range) $('pv-record').title = '一部の小節だけ練習しているときは録音できません (全体に戻すと録音できます)';
  }

  $('pv-listen').addEventListener('click', async () => {
    if (g.mode === 'listen') {
      stopAll();
      return;
    }
    stopAll();
    const v = practicePhrase();
    g.playRange = { from: g.range?.from ?? 0, len: v.measures.length };
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
    const listenDur = (v.measures.length * measureTicks(v.timeSig) * 60) / (g.bpm * PPQ);
    const t0 = player.startTime;
    const bpm0 = g.bpm;
    startSong((l) => ({ time: t0 + l * listenDur, bpm: bpm0 }), v.measures.length);
  });

  // ------------------------------------------------------------ ライブ採点 (録音しない)

  let liveState = null;

  $('pv-live').addEventListener('click', async () => {
    if (g.mode === 'live') {
      stopAll();
      return;
    }
    stopAll();
    try {
      player.ensureContext();
      player.resume();
      g.recorder ??= new TakeRecorder(player.ctx, player.synth.clickBus);
      // ライブ採点はカメラを使わない
      await g.recorder.open({ headphones: prefs.headphones, video: false });
      if (!g.recorder.workletLoaded) throw new Error('このブラウザはライブ採点に対応していません');
    } catch (err) {
      toast(err.message?.includes('対応') ? err.message : 'マイクを使えませんでした。ブラウザのマイクの許可を確認してください', 6000);
      return;
    }
    await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2500))]);
    startLive();
  });

  // ループごとのテンポ (自動テンポアップで途中から変わる) から時刻を求める
  const segOfLoop = (L, l) => L.segs.reduce((s, x) => (x.loop <= l ? x : s), L.segs[0]);
  const loopStart = (L, l) => {
    const s = segOfLoop(L, l);
    return s.start + (l - s.loop) * s.dur;
  };
  const loopAt = (L, t) => {
    const s = L.segs.reduce((a, x) => (x.start <= t ? x : a), L.segs[0]);
    return s.loop + Math.floor((t - s.start) / s.dur);
  };
  const noteTime = (L, l, i) => loopStart(L, l) + (L.oneTicks[i] / L.total) * segOfLoop(L, l).dur;

  function startLive() {
    const phrase = practicePhrase();
    player.setScore(phrase);
    seq.bpm = g.bpm;
    seq.metronome = true; // ライブ採点はメトロノームを鳴らし続ける
    seq.clickMode = prefs.clickMode;
    seq.restSilence = true;
    seq.loop = { enabled: true, start: 0, end: phrase.measures.length - 1 };
    seq.tempoUp = { ...seq.tempoUp, enabled: false };
    seq.nextBpm = null;
    player.countIn = true;
    player.drumsMuted = !prefs.guide;
    g.playRange = { from: g.range?.from ?? 0, len: phrase.measures.length };
    player.play(0);
    g.mode = 'live';
    updateButtons();

    const mt = measureTicks(phrase.timeSig);
    const total = phrase.measures.length * mt;
    const durOf = (bpm) => (total * 60) / (bpm * PPQ);
    const lat = savedLatency(prefs.headphones ? 'headphones' : 'speaker') ?? latency();
    const ons = expectedOnsets(phrase);
    const L = {
      phrase,
      ons,
      oneTicks: ons.map((o) => o.measure * mt + o.tick),
      total,
      // カウントインの後からループ 0
      segs: [{ loop: 0, start: player.startTime + (mt * 60) / (g.bpm * PPQ), bpm: g.bpm, dur: durOf(g.bpm) }],
      lat,
      clickMode: prefs.clickMode,
      judged: new Map(), // "ループ:番号" → { grade, offset }
      loopDone: new Set(),
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      offsets: [],
      combo: 0,
      shownLoop: -1,
      listener: null,
    };
    liveState = L;
    // 自動テンポアップ: シーケンサーがループの先頭でテンポを変えたら、そこからの時刻の数え方を変える
    seq.onWrap = (time, bpm) => {
      if (liveState !== L) return;
      const last = L.segs[L.segs.length - 1];
      if (bpm === last.bpm) return;
      L.segs.push({ loop: last.loop + Math.round((time - last.start) / last.dur), start: time, bpm, dur: durOf(bpm) });
      setTimeout(
        () => {
          if (liveState !== L) return;
          setBpm(bpm, { quiet: true });
          toast(`合格! ♩=${bpm} に上げました`, 2000);
        },
        Math.max(0, (time - player.ctx.currentTime) * 1000),
      );
    };
    startSong((l) => (liveState === L ? { time: loopStart(L, l), bpm: segOfLoop(L, l).bpm } : null), phrase.measures.length);
    L.listener = new LiveListener(player.ctx, g.recorder.source, { sensitivity: prefs.sensitivity, onHit: (t) => liveHit(t - lat) });
    L.listener.start();
    $('pv-live-panel').classList.remove('hidden');
    $('pv-live-last').textContent = 'カウントのあとに叩いてください';
    $('pv-live-last').className = 'live-last';
    $('pv-live-advice').classList.add('hidden');
    renderLiveStats();
  }

  // 開発中だけ: テストから打音を入れられるようにする
  if (import.meta.env?.DEV) window.__drumLive = { hit: (t) => liveHit(t), state: () => liveState, noteTime: (l, i) => noteTime(liveState, l, i) };

  function stopLive() {
    liveState?.listener?.stop();
    liveState = null;
    $('pv-live-panel').classList.add('hidden');
    player.drumsMuted = false;
  }

  /** 叩いた音 (補正済みの時刻) を一番近い手本の音に結びつける */
  function liveHit(t) {
    const L = liveState;
    if (!L) return;
    const loop = loopAt(L, t);
    let best = null;
    for (let l = loop - 1; l <= loop + 1; l++) {
      if (l < 0) continue;
      L.oneTicks.forEach((_, i) => {
        const key = `${l}:${i}`;
        if (L.judged.has(key)) return;
        const d = t - noteTime(L, l, i);
        if (Math.abs(d) <= WINDOWS.good && (!best || Math.abs(d) < Math.abs(best.d))) best = { key, d, l };
      });
    }
    if (!best) {
      L.extra = (L.extra ?? 0) + 1; // 手本にない音 (点数には入れない)
      return;
    }
    const ad = Math.abs(best.d);
    const grade = ad <= WINDOWS.perfect ? 'perfect' : ad <= WINDOWS.great ? 'great' : 'good';
    L.judged.set(best.key, { grade, offset: best.d });
    L.counts[grade]++;
    L.offsets.push(best.d);
    if (L.offsets.length > 64) L.offsets.shift();
    L.combo++;
    const ms = Math.round(best.d * 1000);
    const el = $('pv-live-last');
    el.textContent = `${GRADE[grade].label} ${ms > 0 ? '+' : ''}${ms}ms ${Math.abs(best.d) < 0.008 ? 'ジャスト' : best.d < 0 ? '早い' : '遅い'}`;
    el.className = `live-last ${grade}`;
    renderLiveStats();
  }

  /** 毎フレーム: 時間が過ぎても叩かれなかった音を Miss にし、ループごとの点数を出す */
  function liveTick() {
    const L = liveState;
    if (!L || g.mode !== 'live') return;
    // 叩いた音が届くまでの遅れの分だけ待ってから Miss にする
    const now = player.ctx.currentTime - L.lat - 0.05;
    const loopNow = loopAt(L, now);
    for (let l = Math.max(0, loopNow - 1); l <= loopNow; l++) {
      L.oneTicks.forEach((_, i) => {
        const key = `${l}:${i}`;
        if (L.judged.has(key)) return;
        if (noteTime(L, l, i) + WINDOWS.good < now) {
          L.judged.set(key, { grade: 'miss', offset: null });
          L.counts.miss++;
          L.combo = 0;
          renderLiveStats();
        }
      });
      // 1ループ分そろったら点数を出す
      if (!L.loopDone.has(l) && L.oneTicks.every((_, i) => L.judged.has(`${l}:${i}`))) {
        L.loopDone.add(l);
        const js = L.oneTicks.map((_, i) => L.judged.get(`${l}:${i}`));
        const pts = js.reduce((sum, j) => sum + ({ perfect: 1, great: 0.8, good: 0.45, miss: 0 })[j.grade], 0);
        L.prevScore = Math.round((pts / js.length) * 100);
        // 合格したら次のループの頭からテンポを上げる (上げる前のテンポのループだけで判断する)
        if (prefs.autoUp && L.prevScore >= prefs.upPass && !seq.nextBpm && segOfLoop(L, l).bpm === seq.bpm && seq.bpm < 300) {
          seq.nextBpm = Math.min(300, seq.bpm + prefs.upStep);
        }
        renderLiveAdvice(l);
        renderLiveStats();
      }
    }
    // 楽譜の上の印: 今のループの判定
    const showLoop = Math.max(0, loopAt(L, player.ctx.currentTime));
    drawLiveJudgments(showLoop);
  }

  /** 直近 4ループの判定から傾向とアドバイスを出す */
  function renderLiveAdvice(last) {
    const L = liveState;
    const first = Math.max(0, last - 3);
    const judgments = [];
    for (let l = first; l <= last; l++) L.oneTicks.forEach((_, i) => judgments.push(L.judged.get(`${l}:${i}`)));
    const M = L.phrase.measures.length;
    const a = analyzeTake({
      judgments,
      onsets: L.ons,
      measures: M,
      beatTicks: ticksPerBeat(L.phrase.timeSig),
      restBar: L.clickMode !== 'all' ? (b) => isRestBar(L.clickMode, b + first * M) : null,
    });
    const el = $('pv-live-advice');
    if (!a?.tips.length) {
      el.classList.add('hidden');
      return;
    }
    const from = g.range?.from ?? 0;
    const weak = !g.range && a.weak[0];
    el.innerHTML = `<small>直近${last - first + 1}ループの傾向</small><ul>${a.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${
      weak ? `<button class="btn btn-ghost small" data-weak="${weak.measure + from}">${weak.measure + from + 1}小節目だけループ練習</button>` : ''
    }`;
    el.classList.remove('hidden');
  }

  function drawLiveJudgments(loop) {
    const L = liveState;
    if (!g.notation) return;
    const overlay = $('pv-overlay');
    const from = g.playRange?.from ?? 0;
    if (L.shownLoop !== loop) {
      overlay.querySelectorAll('.judge').forEach((el) => el.remove());
      L.shownLoop = loop;
      L.drawn = new Set();
    }
    L.ons.forEach((o, i) => {
      const j = L.judged.get(`${loop}:${i}`);
      const mi = o.measure + from;
      if (!j || L.drawn.has(i) || !g.notation.boxes[mi]) return;
      L.drawn.add(i);
      const box = g.notation.boxes[mi];
      const el = document.createElement('div');
      el.className = `judge ${j.grade}`;
      el.style.left = `${g.notation.cursorX(mi, o.tick)}px`;
      el.style.top = `${box.y + 2}px`;
      overlay.appendChild(el);
    });
  }

  function renderLiveStats() {
    const L = liveState;
    if (!L) return;
    const now = player.ctx.currentTime;
    $('pv-live-loop').textContent = now < L.segs[0].start ? '-' : String(loopAt(L, now) + 1);
    $('pv-live-prev').textContent = L.prevScore != null ? `${L.prevScore}点` : '-';
    $('pv-live-combo').textContent = String(L.combo);
    const mean = L.offsets.length ? L.offsets.reduce((a, b) => a + b, 0) / L.offsets.length : null;
    $('pv-live-mean').textContent = mean == null ? '-' : `${mean > 0 ? '+' : ''}${Math.round(mean * 1000)}ms`;
    $('pv-live-counts').dataset.extra = String(L.extra ?? 0);
    $('pv-live-counts').innerHTML = ['perfect', 'great', 'good', 'miss'].map((k) => `<span class="cnt ${k}"><i></i>${GRADE[k].label}<b>${L.counts[k]}</b></span>`).join('');
  }

  // ------------------------------------------------------------ 録音と採点



  // 補正値は「スピーカー / イヤホン」×「録音 / 録画」の 4通りを別々に持つ
  // (録画ではカメラと一緒にマイクを開くので、スマホがマイクの処理を切り替えて遅れが変わることがある)
  const LAT_MODES = [
    { id: 'speaker', label: 'スピーカー' },
    { id: 'headphones', label: 'イヤホン・ヘッドホン' },
    { id: 'speaker-video', label: '録画・スピーカー' },
    { id: 'headphones-video', label: '録画・イヤホン' },
  ];
  const currentLatMode = () => `${prefs.headphones ? 'headphones' : 'speaker'}${prefs.video ? '-video' : ''}`;

  /** 保存済みの補正値 (秒)。mode を省くと今の設定のもの (録画用が未設定なら録音用を使う) */
  function savedLatency(mode) {
    const read = (m) => {
      const v = getSetting(LAT_KEY + m);
      return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    };
    if (mode) return read(mode);
    const cur = currentLatMode();
    return read(cur) ?? (cur.endsWith('-video') ? read(cur.replace('-video', '')) : null);
  }

  function setLatency(mode, sec) {
    setSetting(LAT_KEY + mode, sec == null ? null : Math.round(sec * 1000) / 1000);
    renderLatencyUI();
  }

  function latency() {
    const v = savedLatency();
    if (v != null) return v;
    const ctx = player.ctx;
    return (ctx?.outputLatency || 0.02) + (ctx?.baseLatency || 0.01) + 0.01;
  }

  function latencyLabel() {
    const v = savedLatency();
    return v == null ? '未調整' : `${Math.round(v * 1000)}ms`;
  }

  // 設定パネルの「タイミング補正」: 4通りの値を数値で変えられる
  function renderLatencyUI() {
    $('hub-latency').textContent = latencyLabel();
    for (const m of LAT_MODES) {
      const v = savedLatency(m.id);
      const input = $(`lat-${m.id}`);
      if (document.activeElement !== input) input.value = v == null ? '' : String(Math.round(v * 1000));
    }
    const cur = LAT_MODES.find((m) => m.id === currentLatMode());
    const own = savedLatency(cur.id) != null;
    $('lat-current').textContent = own || !cur.id.endsWith('-video') ? cur.label : `${cur.label} (未設定のため ${LAT_MODES.find((m) => m.id === cur.id.replace('-video', '')).label} の値)`;
  }
  for (const m of LAT_MODES) {
    $(`lat-${m.id}`).addEventListener('change', (e) => {
      const ms = e.target.value === '' ? null : Number(e.target.value);
      if (ms != null && (!Number.isFinite(ms) || ms < -200 || ms > 1000)) {
        toast('-200〜1000ms の範囲で入れてください');
        renderLatencyUI();
        return;
      }
      setLatency(m.id, ms == null ? null : ms / 1000);
      toast(ms == null ? `${m.label}の補正値を消しました` : `${m.label}の補正値を ${ms}ms にしました`);
    });
  }
  $('lat-measure').addEventListener('click', () => {
    $('panel-close').click(); // 叩くあいだは設定を閉じる
    calibrate();
  });
  initSettings().then(renderLatencyUI);
  renderLatencyUI();


  async function ensureRecorder() {
    player.ensureContext();
    player.resume();
    g.recorder ??= new TakeRecorder(player.ctx, player.synth.clickBus);
    await g.recorder.open({ headphones: prefs.headphones, video: prefs.video, facing: prefs.facing });
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
      toast(prefs.video ? 'カメラかマイクを使えませんでした。ブラウザの許可を確認してください' : 'マイクを使えませんでした。ブラウザのマイクの許可を確認してください', 6000);
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
    seq.clickMode = prefs.clickMode;
    seq.restSilence = true;
    seq.loop = { enabled: false, start: 0, end: 0 };
    seq.tempoUp = { ...seq.tempoUp, enabled: false };
    player.countIn = true;
    player.drumsMuted = !prefs.guide;
    // 録音に入れるメトロノームはタイミング補正の値だけ遅らせて、録音した自分の音とそろえる
    g.recorder.start({ includeClick: prefs.metronome && prefs.clickInRec, clickDelay: latency() });
    player.play(0);
    g.mode = 'record';
    updateButtons();
    $('pv-rec-overlay').classList.remove('hidden');
    const preview = $('pv-rec-preview');
    preview.classList.toggle('hidden', !g.recorder.videoTrack);
    preview.classList.toggle('mirror', g.recorder.facing === 'user');
    if (g.recorder.videoTrack) {
      preview.srcObject = new MediaStream([g.recorder.videoTrack]);
      preview.play().catch(() => {});
    }

    const spt = 60 / (g.bpm * PPQ);
    const mt = measureTicks(phrase.timeSig);
    const start = player.startTime + mt * spt; // カウントインの後
    const one = expectedOnsets(phrase);
    const expected = [];
    for (let l = 0; l < loops; l++) {
      for (const o of one) expected.push(start + ((l * phrase.measures.length + o.measure) * mt + o.tick) * spt);
    }
    const end = start + loops * phrase.measures.length * mt * spt;
    // メトロノームを鳴らす予定の時刻 (カウントインから最後まで。間引きも反映)
    const clicks = [];
    if (prefs.metronome) {
      const bt = ticksPerBeat(phrase.timeSig);
      for (let bar = -1; bar < loops * phrase.measures.length; bar++) {
        for (const c of clickTicks(prefs.clickMode, bar, phrase.timeSig.beats, bt)) clicks.push({ time: start + (bar * mt + c.tick) * spt, accent: c.accent });
      }
    }
    const job = { phrase, loops, expected, start, end, bpm: g.bpm, clicks, clickMode: prefs.metronome ? prefs.clickMode : 'all', cancelled: false };
    const loopDur = phrase.measures.length * mt * spt;
    startSong((l) => (l < loops && !job.cancelled ? { time: start + l * loopDur, bpm: job.bpm } : null), phrase.measures.length);
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

  function hidePreview() {
    const preview = $('pv-rec-preview');
    preview.srcObject = null;
    preview.classList.add('hidden');
  }

  function cancelRecording() {
    if (recordJob) recordJob.cancelled = true;
    recordJob = null;
    $('pv-rec-overlay').classList.add('hidden');
    hidePreview();
    if (g.recorder?.media?.state === 'recording') g.recorder.stop().catch(() => {});
  }

  async function finishRecording(job) {
    recordJob = null;
    if (player.playing) player.stop();
    player.drumsMuted = false;
    g.mode = 'idle';
    updateButtons();
    $('pv-rec-overlay').classList.add('hidden');
    hidePreview();
    const rec = await g.recorder.stop();
    const lat = latency();
    const onsets = detectOnsets(rec.pcm, rec.sampleRate, { sensitivity: prefs.sensitivity });
    const lo = job.expected[0] - 0.3;
    const hi = job.end + 0.1;
    const hits = onsets.map((o) => ({ time: rec.pcmStart + o.time - lat, level: o.level })).filter((h) => h.time >= lo && h.time <= hi);
    const result = scoreTake(job.expected, hits);
    result.loops = job.loops;
    const analysis = analyzeTake({
      judgments: result.judgments,
      onsets: expectedOnsets(job.phrase),
      measures: job.phrase.measures.length,
      beatTicks: ticksPerBeat(job.phrase.timeSig),
      restBar: job.clickMode !== 'all' ? (b) => isRestBar(job.clickMode, b) : null,
    });
    // 聞き返し用の音 (録画でないとき): 採点に使った録音から作り、メトロノームを入れるならぴったりの位置に置く
    let blob = rec.blob;
    let mime = rec.mime;
    if (!rec.isVideo && rec.pcm.length) {
      try {
        blob = mixdownTake({ pcm: rec.pcm, sampleRate: rec.sampleRate, pcmStart: rec.pcmStart, latency: lat, clicks: prefs.clickInRec ? job.clicks : [] });
        mime = 'audio/wav';
      } catch (err) {
        console.error(err);
      }
    }

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
      blob,
      mime,
      video: rec.isVideo,
      latency: lat,
      latMode: currentLatMode(),
      clickMode: job.clickMode,
      timeline: rec.isVideo ? videoTimeline(job, result, hits, rec.mediaStart) : undefined,
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
    // 合格したら次の録音のテンポを上げておく
    let upTo = null;
    if (prefs.autoUp && take.score >= prefs.upPass && g.bpm < 300 && g.phrase?.id === job.phrase.id) {
      upTo = Math.min(300, job.bpm + prefs.upStep);
      setBpm(upTo);
    }
    showResult(result, take, { newBest: take.score > prevBest && prevBest > 0, firstTake: !before.phrases[job.phrase.id], levelUp: newLevel > prevLevel ? newLevel : null, xp: xpOf(take), analysis, upTo });
    drawJudgments();
    renderPracticeHeader();
    await refreshHistory();
    if (take.video) openCompareFor(take);
  }

  /** 録画の比較再生に使う時刻表 (どれも録画ファイルの先頭からの秒数) */
  function videoTimeline(job, result, hits, mediaStart) {
    const phrase = job.phrase;
    const spt = 60 / (job.bpm * PPQ);
    const mt = measureTicks(phrase.timeSig);
    const M = phrase.measures.length;
    const notes = [];
    for (let l = 0; l < job.loops; l++) {
      phrase.measures.forEach((m, mi) => {
        for (const n of m.notes) notes.push({ t: job.start + ((l * M + mi) * mt + n.tick) * spt - mediaStart, inst: n.inst, vel: n.vel ?? 1 });
      });
    }
    notes.sort((a, b) => a.t - b.t);
    const matched = result.judgments.filter((j) => j.offset != null).map((j) => j.expected + j.offset);
    return {
      notes,
      judgments: result.judgments.map((j) => ({ t: j.expected - mediaStart, offset: j.offset, grade: j.grade })),
      extra: hits.filter((h) => !matched.some((m) => Math.abs(m - h.time) < 1e-6)).map((h) => h.time - mediaStart),
      start: job.start - mediaStart,
      end: job.end - mediaStart,
      phraseDur: M * mt * spt,
      loops: job.loops,
      bpm: job.bpm,
      countIn: phrase.timeSig.beats,
      // 後でフレーズを直しても、撮ったときの譜面で比べられるようにしておく
      phrase: { title: phrase.title, timeSig: phrase.timeSig, measures: phrase.measures },
    };
  }

  let compareModule = null;
  async function openCompareFor(take) {
    try {
      compareModule ??= await import('./compare.js');
      notationModule ??= await import('../notation/render.js');
      await notationModule.loadNotationFonts();
      const phrase = take.timeline?.phrase ?? g.phrase;
      await compareModule.openCompare({ take, phrase, player, renderScore: notationModule.renderScore });
    } catch (err) {
      console.error(err);
      toast(`比較画面を開けませんでした: ${err.message}`, 6000);
    }
  }

  function showResult(r, take, { newBest, levelUp, xp, analysis, upTo }) {
    const el = $('pv-result');
    el.classList.remove('hidden');
    const tendency =
      Math.abs(r.meanOffset) < 0.008 ? 'ジャスト' : r.meanOffset < 0 ? `走り気味 (${Math.round(-r.meanOffset * 1000)}ms 早い)` : `もたり気味 (${Math.round(r.meanOffset * 1000)}ms 遅い)`;
    const banners = [];
    if (levelUp) banners.push(`<div class="banner level">レベルアップ! Lv${levelUp}</div>`);
    if (newBest) banners.push('<div class="banner best">自己ベスト更新!</div>');
    if (upTo) banners.push(`<div class="banner up">合格! 次は ♩=${upTo} に上げました</div>`);
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
        <div><small>使った補正値</small><b>${take.latency != null ? `${Math.round(take.latency * 1000)}ms` : '-'}</b><small>${LAT_MODES.find((m) => m.id === take.latMode)?.label ?? ''}</small></div>
      </div>
      ${timingStrip(r)}
      ${analysisHtml(analysis)}
      <audio controls src="${URL.createObjectURL(take.blob)}"></audio>
      <p class="note">楽譜の上の印は最後の1回分の判定です (緑 Perfect / 青 Great / 黄 Good / 赤 Miss)。</p>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** 詳しい分析 (アドバイス・楽器別・拍の位置別・苦手な小節) */
  function analysisHtml(a) {
    if (!a) return '';
    const cls = (m) => (m == null ? '' : m < -0.008 ? 'early' : m > 0.008 ? 'late' : 'just');
    const row = (x) =>
      `<tr><th>${esc(x.name)}</th><td class="${cls(x.mean)}">${x.mean == null ? '-' : msStr(x.mean)}</td><td>${x.spread == null ? '-' : `±${Math.round(x.spread * 1000)}ms`}</td><td>${x.miss ? `${x.miss}/${x.n}` : '0'}</td></tr>`;
    const table = (title, rows) =>
      rows.length ? `<h4>${title}</h4><table class="an-table"><thead><tr><th></th><th>平均のずれ</th><th>ばらつき</th><th>Miss</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table>` : '';
    const gap = a.gap ? table('クリックの有無', [{ name: 'クリックあり', ...a.gap.click }, { name: 'クリックなし', ...a.gap.rest }]) : '';
    const drift = a.drift != null && Math.abs(a.drift) >= 0.008 ? `<p class="note">前半→後半で ${msStr(a.drift)} (${a.drift < 0 ? 'だんだん走っています' : 'だんだんもたっています'})</p>` : '';
    const weak = a.weak.length
      ? `<h4>苦手な小節</h4><div class="an-weak">${a.weak.map((w) => `<button class="btn btn-ghost small" data-weak="${w.measure}">${w.measure + 1}小節目 (${w.score}点) をループ練習</button>`).join('')}</div>`
      : '';
    return `<details class="analysis" open><summary>詳しい分析</summary>
      ${a.tips.length ? `<ul class="an-tips">${a.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${gap}${drift}${table('楽器別', a.byInst)}${table('拍の位置別', a.byPos)}${weak}
      <p class="note">ずれは + が遅い、− が早い。ばらつきはプロのレコーディングで ±10ms 前後が目安です。</p>
    </details>`;
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
        ${t.video && t.timeline ? `<button class="tool" data-cmp-take="${t.id}" title="映像で手本と比べる"><svg class="ic"><use href="#i-camera" /></svg></button>` : ''}
        <button class="tool" data-play-take="${t.id}" title="聞く">▶</button>
        <button class="tool danger" data-del-take="${t.id}" title="削除"><svg class="ic"><use href="#i-trash" /></svg></button>`;
      list.appendChild(item);
    }
  }

  $('pv-takes').addEventListener('click', async (e) => {
    const cmp = e.target.closest('[data-cmp-take]');
    if (cmp) {
      const t = g.takes.find((x) => x.id === cmp.dataset.cmpTake);
      if (t) openCompareFor(t);
      return;
    }
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
      setLatency(currentLatMode(), lat);
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
      if (pos && pos.measure >= 0 && (g.mode === 'listen' || g.mode === 'record' || g.mode === 'live')) {
        const nm = g.notation.boxes.length;
        const mi = g.playRange ? g.playRange.from + (pos.measure % g.playRange.len) : pos.measure % nm;
        const box = overlay.querySelector(`.mbox[data-measure="${mi}"]`);
        if (box) {
          box.classList.add('playing');
          box.querySelector('.cursor').style.left = `${g.notation.cursorX(mi, pos.tick) - box.offsetLeft}px`;
        }
      }
      if (g.mode === 'live') liveTick();
      g.songSync?.tick();
      if (g.mode === 'record') {
        const c = $('pv-rec-count');
        if (pos && pos.measure === -1) c.textContent = String(Math.floor(pos.tick / PPQ) + 1);
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
