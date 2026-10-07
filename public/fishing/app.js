import { FISH } from './data/fish.js';
import { BAITS, METHODS, PLACES, MONTHS } from './data/filters.js';
import { RIGS, GEAR } from './data/tackle.js';
import { KNOTS } from './data/knots.js';
import { SPOTS, HAZARDS, GENERAL_SAFETY } from './data/safety.js';
import { FUNA_CAUSES, FUNA_RIG_ADVICE, FUNA_CHECKLIST } from './data/funa.js';
import { SOURCES } from './data/sources.js';
import { EAT, TRIVIA, EAT_GENERAL } from './data/eat.js';
import { fishSvg, rigSvg, KNOT_DIAGRAMS } from './svg.js';
import { searchFish } from './search.js';

const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const TABS = [['fish', '図鑑'], ['tackle', '釣具・仕掛け'], ['knots', '結び方'], ['funa', 'フナの大型対策'], ['eat', '食べ方'], ['trivia', '豆知識'], ['safety', '立入・安全']];
const state = { q: '', month: 0, bait: '', method: '', place: '' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byId = (list, id) => list.find((x) => x.id === id);
const opts = (obj, cur, any) => `<option value="">${any}</option>` + Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(v.name)}</option>`).join('');

function srcLinks(ids = []) {
  const items = ids.map((id) => SOURCES[id]).filter(Boolean);
  if (!items.length) return '<p class="src">出典: なし (一般的な目安。未検証)</p>';
  return `<p class="src">出典: ${items.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(' / ')}</p>`;
}
const basisBadge = (b) => `<span class="basis ${b === 'source' ? 'source' : 'general'}">${b === 'source' ? '出典' : '一般'}</span>`;
const levelLabel = { ng: '立入禁止', ok: '利用できる', check: '要確認' };

function monthsBar(f) {
  return `<div class="months" aria-label="狙いやすい月">${MONTHS.map((m) => `<span class="${f.months.includes(m) ? 'on' : ''}">${m}</span>`).join('')}</div>`;
}

/* ---------- 図鑑 ---------- */
function viewFishList() {
  $app.innerHTML = `
    <div class="filters">
      <input type="search" id="q" placeholder="魚の名前で探す (例: あじ / ヒラメ)" value="${esc(state.q)}" aria-label="魚の名前">
      <div class="row">
        <label>季節 <select id="month">${`<option value="">いつでも</option>` + MONTHS.map((m) => `<option value="${m}"${m === state.month ? ' selected' : ''}>${m}月</option>`).join('')}</select></label>
        <label>餌 <select id="bait">${opts(BAITS, state.bait, 'すべて')}</select></label>
        <label>釣り方 <select id="method">${opts(METHODS, state.method, 'すべて')}</select></label>
        <label>場所 <select id="place">${opts(PLACES, state.place, 'すべて')}</select></label>
        <button class="linkbtn" id="reset">条件をクリア</button>
      </div>
    </div>
    <p class="count" id="count" aria-live="polite"></p>
    <div class="grid" id="list"></div>`;
  const draw = () => {
    const list = searchFish(state);
    document.getElementById('count').textContent = `${list.length} 種`;
    document.getElementById('list').innerHTML = list.map((f) => `
      <a class="card fishcard" href="#fish/${f.id}">
        <div class="art">${fishSvg({ ...f.art, label: `${f.name}のイラスト` })}</div>
        <h3>${esc(f.name)}<span class="kana">${esc(f.kana)}</span></h3>
        ${f.hazard ? '<span class="badge ng">⚠ 危険</span>' : ''}
        ${f.methods.slice(0, 2).map((m) => `<span class="badge">${esc(METHODS[m].name)}</span>`).join('')}
        ${monthsBar(f)}
      </a>`).join('') || '<p>条件に合う魚がいません。条件を減らしてみてください。</p>';
  };
  const bind = (id, key, num) => document.getElementById(id).addEventListener('input', (e) => { state[key] = num ? Number(e.target.value) : e.target.value; draw(); });
  bind('q', 'q'); bind('month', 'month', true); bind('bait', 'bait'); bind('method', 'method'); bind('place', 'place');
  document.getElementById('reset').addEventListener('click', () => { Object.assign(state, { q: '', month: 0, bait: '', method: '', place: '' }); viewFishList(); });
  draw();
}

function viewFish(id) {
  const f = byId(FISH, id);
  if (!f) return viewFishList();
  const hz = f.hazard ? byId(HAZARDS, f.hazard) : null;
  const rigs = RIGS.filter((r) => r.targets.includes(f.id));
  $app.innerHTML = `
    <a class="back" href="#fish">← 図鑑にもどる</a>
    <div class="detail">
      <h2>${esc(f.name)} <small class="kana">${esc(f.kana)}</small></h2>
      <div class="art">${fishSvg({ ...f.art, label: `${f.name}のイラスト` }, { width: 420 })}</div>
      ${hz ? `<div class="alert ng"><strong>⚠ ${esc(hz.name)}: ${esc(hz.where)}</strong><br>${esc(hz.effect)}<br><strong>対処:</strong> ${esc(hz.action)}${srcLinks(hz.src)}</div>` : ''}
      <p>${esc(f.summary)}</p>
      <h3>狙いやすい月 (目安)</h3>${monthsBar(f)}
      <table class="kv">
        <tr><th>大きさ</th><td>${esc(f.size)}</td></tr>
        <tr><th>餌・ルアー</th><td>${f.baits.map((b) => `<span class="badge">${esc(BAITS[b].name)}</span>`).join('') || '釣りの対象ではありません'}</td></tr>
        <tr><th>釣り方</th><td>${f.methods.map((m) => `<span class="badge">${esc(METHODS[m].name)}</span>`).join('') || '—'}</td></tr>
        <tr><th>場所</th><td>${f.places.map((p) => `<span class="badge">${esc(PLACES[p].name)}</span>`).join('')}</td></tr>
      </table>
      ${eatBlock(f)}
      <h3>釣り方のコツ</h3><ul class="plain">${f.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${f.note ? `<div class="alert check">${esc(f.note)}</div>` : ''}
      ${triviaBlock(f.id)}
      ${rigs.length ? `<h3>おすすめの仕掛け</h3><ul class="plain">${rigs.map((r) => `<li><a href="#tackle/${r.id}">${esc(r.name)}</a></li>`).join('')}</ul>` : ''}
      ${f.id === 'funa' || f.id === 'koi' ? '<p><a href="#funa">→ 大型フナで糸や結び目が切れるときの対策</a></p>' : ''}
      ${srcLinks(f.src)}
      <p class="src">季節・餌・サイズは一般的な目安で、年や海況で変わります。</p>
    </div>`;
}


function eatBlock(f) {
  const e = EAT[f.id];
  if (!e) return '';
  if (e.ng) return `<h3>食べ方</h3><div class="alert ng"><strong>食べ方は載せません。</strong> ${esc(e.caution)}${srcLinks(e.src)}</div>`;
  return `<h3>食べ方・調理法</h3>
    <ul class="plain">${e.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>下ごしらえ</h3><ul class="plain">${e.prep.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${e.caution ? `<div class="alert check">${esc(e.caution)}</div>` : ''}
    ${e.src.length ? srcLinks(e.src) : '<p class="src">調理法は一般的な家庭料理の例で、出典はありません (未検証)。</p>'}
    <p class="src"><a href="#eat">持ち帰り方・食の安全の基本</a></p>`;
}
function triviaBlock(id) {
  const t = TRIVIA[id];
  if (!t || !t.length) return '';
  return `<h3>豆知識</h3><ul class="plain">${t.map((x) => `<li>${esc(x.t)} ${basisBadge(x.basis)}</li>`).join('')}</ul>`;
}

/* ---------- 釣具・仕掛け ---------- */
function viewTackle(id) {
  const rigs = id ? RIGS.filter((r) => r.id === id) : RIGS;
  $app.innerHTML = `
    <h2>仕掛けの種類</h2>
    ${rigs.map((r) => `
      <section class="card" id="${r.id}">
        <h3>${esc(r.name)} <span class="badge">${esc(r.difficulty)}</span> <span class="badge">${esc(r.place)}</span></h3>
        <div class="rig">
          ${rigSvg(r.rig)}
          <div>
            <p>${esc(r.desc)}</p>
            <h3>道具</h3><ul class="plain">${r.parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            <h3>手順</h3><ol class="plain">${r.steps.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
            <div class="alert check">${esc(r.caution)}</div>
            <p>対象: ${r.targets.map((t) => { const f = byId(FISH, t); return f ? `<a class="badge" href="#fish/${t}">${esc(f.name)}</a>` : ''; }).join('')}</p>
            ${srcLinks(r.src)}
          </div>
        </div>
      </section>`).join('')}
    ${id ? '<p><a href="#tackle">すべての仕掛けを見る</a></p>' : `<h2>釣具の基本</h2>${GEAR.map((g) => `<div class="card"><h3>${esc(g.name)}</h3><p>${esc(g.desc)}</p>${g.tips.length ? `<ul class="plain">${g.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>`).join('')}`}
    <p class="src">サイズや号数は入門の一般的な目安で、このアプリでは検証していません。釣具店で相談するのが確実です。</p>`;
}

/* ---------- 結び方 ---------- */
function viewKnots() {
  $app.innerHTML = `
    <h2>糸の結び方</h2>
    <div class="alert check"><strong>結ぶときの3つの基本:</strong> ① 濡らす ② ゆっくり締める ③ 結んだあと引いて確かめる。<br>大型のフナ・コイが相手のときは、<a href="#funa">フナの大型対策</a>も読んでください。</div>
    ${KNOTS.map((k) => `
      <section class="card" id="${k.id}">
        <h3>${esc(k.name)} <span class="badge">用途: ${esc(k.use)}</span> <span class="badge">強さ ${esc(k.strength)}</span> <span class="badge">難易度 ${esc(k.diff)}</span></h3>
        <p>${esc(k.desc)}</p>
        <ol class="steps">${k.steps.map((s, i) => `<li>${KNOT_DIAGRAMS[k.id][i] || ''}<p>${esc(s)}</p></li>`).join('')}</ol>
        <div class="alert check">${esc(k.warn)}</div>
      </section>`).join('')}
    <p class="src">図は結び方を説明する簡略図です。実際の糸の通し方は、手元で糸を持って確かめながら練習してください。
    結び方の手順は一般的な説明で、このアプリでは強度を実測していません。参考にしたシマノの解説ページは閲覧できず、本文は未確認です。</p>`;
}

/* ---------- フナ対策 ---------- */
function viewFuna() {
  const adv = FUNA_RIG_ADVICE[0];
  $app.innerHTML = `
    <h2>大きなフナで糸や結び目が切れるとき</h2>
    <div class="alert check">以下は一般的な釣りの定説をまとめたものです。<span class="basis general">一般</span> は出典なし (このアプリでは検証していません)、<span class="basis source">出典</span> は出典あり。</div>
    ${FUNA_CAUSES.map((c) => `
      <section class="card">
        <h3>${esc(c.title)} <span class="basis ${c.basis}">${c.basis === 'source' ? '出典' : '一般'}</span></h3>
        <p>${esc(c.why)}</p>
        <ul class="plain">${c.fix.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${c.extra ? `<p class="src">${esc(c.extra)}</p>${srcLinks(c.extraSrc)}` : ''}
      </section>`).join('')}
    <section class="card"><h3>${esc(adv.label)}</h3>
      <table class="kv">${adv.rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>
      <p class="src">${esc(adv.note)}</p></section>
    <section class="card"><h3>釣る前のチェック</h3>
      <ul class="check-list">${FUNA_CHECKLIST.map((c, i) => `<li><label><input type="checkbox" data-i="${i}">${esc(c)}</label></li>`).join('')}</ul></section>
    <p><a href="#knots">結び方の手順を見る →</a></p>
    <div class="alert check">フナを釣る川・湖沼は、場所によって遊漁券や禁止区域が違います。<a href="#safety">立入・安全</a>で「要確認」の表示を確認してください。</div>`;
}


/* ---------- 食べ方 ---------- */
function viewEat() {
  $app.innerHTML = `
    <h2>釣った魚の持ち帰りと食の安全</h2>
    <div class="alert check"><span class="basis general">一般</span> は出典なしの一般的な説明、<span class="basis source">出典</span> は出典あり。食べるのは自己責任で、迷う魚は食べないでください。</div>
    ${EAT_GENERAL.map((g) => `<section class="card"><h3>${esc(g.title)} ${basisBadge(g.basis)}</h3><ul class="plain">${g.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>${g.src ? srcLinks(g.src) : ''}</section>`).join('')}
    <h2>魚ごとの食べ方</h2>
    <div class="grid">${FISH.map((f) => { const e = EAT[f.id]; return `<a class="card" href="#fish/${f.id}"><strong>${esc(f.name)}</strong>${e?.ng ? ' <span class="badge ng">食べない</span>' : ''}<br><span class="src">${e && !e.ng ? esc(e.how[0]) : esc(e?.caution || '')}</span></a>`; }).join('')}</div>`;
}

/* ---------- 豆知識 ---------- */
function viewTrivia() {
  $app.innerHTML = `
    <h2>釣りと魚の豆知識</h2>
    <div class="alert check"><span class="basis source">出典</span> は出典あり、<span class="basis general">一般</span> は一般的に言われること (未検証・諸説あり)。</div>
    ${FISH.filter((f) => (TRIVIA[f.id] || []).length).map((f) => `
      <section class="card"><h3><a href="#fish/${f.id}">${esc(f.name)}</a></h3>
      <ul class="plain">${TRIVIA[f.id].map((x) => `<li>${esc(x.t)} ${basisBadge(x.basis)}${(x.src || []).length ? srcLinks(x.src) : ''}</li>`).join('')}</ul></section>`).join('')}`;
}

/* ---------- 立入・安全 ---------- */
function viewSafety() {
  $app.innerHTML = `
    <h2>安全の基本</h2>
    <div class="alert ng"><ul class="plain">${GENERAL_SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <h2>釣り場の立入制限</h2>
    <p class="src">「立入禁止」「利用できる」は出典で確認できたものだけ。確認できなかった場所は「要確認」と表示しています。</p>
    ${SPOTS.map((s) => `
      <section class="card"><h3>${esc(s.name)} <span class="badge ${s.level}">${levelLabel[s.level]}</span></h3>
      <p>${esc(s.text)}</p>${srcLinks(s.src)}</section>`).join('')}
    <h2>危険な魚・生き物</h2>
    <p class="src">神栖・鹿嶋での確認状況はこのアプリでは調べきれていません。釣り場で出会いうる魚として、出典のあるものを掲載しています。</p>
    ${HAZARDS.map((h) => `
      <section class="card" id="${h.id}"><h3>⚠ ${esc(h.name)}</h3>
      <table class="kv"><tr><th>危険な部分</th><td>${esc(h.where)}</td></tr><tr><th>起きること</th><td>${esc(h.effect)}</td></tr><tr><th>対処</th><td>${esc(h.action)}</td></tr></table>
      ${h.note ? `<p class="src">${esc(h.note)}</p>` : ''}${srcLinks(h.src)}</section>`).join('')}
    <h2>確認した出典と、その限界</h2>
    <ul class="plain">${Object.values(SOURCES).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> — ${esc(s.note)}</li>`).join('')}</ul>`;
}

/* ---------- ルーティング ---------- */
function route() {
  const [name = 'fish', arg] = (location.hash.slice(1) || 'fish').split('/');
  $tabs.innerHTML = TABS.map(([k, t]) => `<a href="#${k}"${k === name ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('');
  ({ fish: () => (arg ? viewFish(arg) : viewFishList()), tackle: () => viewTackle(arg), knots: viewKnots, funa: viewFuna, eat: viewEat, trivia: viewTrivia, safety: viewSafety }[name] || viewFishList)();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
