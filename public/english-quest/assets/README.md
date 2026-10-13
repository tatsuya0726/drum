# 画像(イラスト)の差し替え

ゲームの絵は、標準ではコードで描いたイラスト(SVG)です。
自分で作った画像(PNG / WebP。背景は透明がおすすめ)に差し替えるときは、この `assets/` に画像を置いて
`manifest.json` に書くだけです。書いていないものは標準のイラストのままです。

```json
{
  "enemies":   { "スライム": "enemies/slime.png", "ワードドラゴン": "enemies/dragon.png" },
  "bg":        { "0": "bg/plain.png", "1": "bg/forest.png", "2": "bg/dark.png", "3": "bg/boss.png" },
  "portraits": { "hero": "portraits/hero.png", "girl": "portraits/girl.png" }
}
```

- `enemies`: キーは敵の名前。縦横比はそのまま使われます(高さ約130で表示)。
- `bg`: 戦闘の背景。0=そうげん / 1=もり / 2=やみのだいち / 3=ボス戦。256:224 の比率がおすすめ。
- `portraits`: キャラの立ち絵。`hero` `girl` `granny` `keeper` `farmer` `elder` `kid` `guard`。縦長(約 200:262)がおすすめ。

画像を新しい敵として **追加** したいときは、`monsters/monsters.json` か、ゲームのタイトルにある「がぞうメーカー」を使います。
