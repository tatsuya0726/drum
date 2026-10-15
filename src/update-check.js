// 新しい版が公開されていたら知らせて、再読み込みできるようにする
// (iPhone の Safari は古いページを覚えていることがあり、古い版のまま新しいデータを開くと表示が崩れるため)

const current = [...document.querySelectorAll('script[type="module"][src]')].map((s) => s.getAttribute('src')).find((src) => /assets\/index-[^/]+\.js$/.test(src));

async function check() {
  if (!current) return; // 開発中は確かめない
  try {
    const res = await fetch(`./?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const latest = html.match(/assets\/index-[^"']+\.js/)?.[0];
    if (latest && !current.endsWith(latest)) show();
  } catch {
    // オフラインなどは無視
  }
}

function show() {
  if (document.getElementById('update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.className = 'update-banner';
  bar.innerHTML = '<span>新しい版があります</span><button class="btn btn-accent">更新する</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(bar);
}

check();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') check();
});
