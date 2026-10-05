# 🥁 ドラム練習プレイヤー

ドラム譜の PDF を読み込んで音を鳴らし、テンポ変更や指定小節のループ再生で練習できる Web アプリです。
ブラウザだけで動作し、PDF はどこにもアップロードされません。

## できること

- **PDF の自動認識 (ベータ)**: 5線のドラム譜から小節線・符頭 (●/×/○) を検出し、五線上の位置から楽器を、音符の間隔から拍位置を推定します
- **生ドラムの音で再生**: 実際のドラムセットを録音した [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (CC0) の音源を使用。再生位置は楽譜上にカーソルで表示
- **テンポ変更**: 30〜300 BPM。PDF のテンポ表記 (♩=92 など) を読み取り、50% / 75% / 100% ワンタッチ
- **区間ループ**: 楽譜上の小節をドラッグ (または Shift+クリック) で範囲指定。ループのたびにテンポを少しずつ上げる練習モードあり
- **ミキサー**: 楽器ごとの音量とミュート (自分が叩くパートを消してマイナスワン練習)
- **メトロノーム / カウントイン**
- テンポ・ループ範囲・ミキサーの設定は PDF ごとにブラウザへ保存され、次に同じ PDF を開くと復元

### キーボード操作

| キー | 動作 |
| --- | --- |
| Space | 再生 / 一時停止 |
| ← / → | 前 / 次の小節 |
| ↑ / ↓ | テンポ ±1 |
| L | ループ ON/OFF |

## 認識について

- MuseScore・Finale・Sibelius・Dorico・LilyPond などから**書き出した PDF** を想定しています。スキャン画像や手書き譜は精度が落ちます。
- 楽器の配置は一般的な記譜 (HH = 第5線の上、ライド = 第5線、クラッシュ = 上第1線、スネア = 第3間、バスドラ = 第1間 など) を初期値にしています。
  楽譜によって書き方が違う場合は「認識の設定」の対応表で直すと全小節に反映されます。
- 拍子は自動判定しないので、4/4 以外は「認識の設定」で選んでください。
- 反復記号 (リピート・D.S.・コーダ) は展開しません。楽譜に書かれた順に再生します。
- 装飾音・アクセント・オープンハイハットの「o」などの記号は今のところ読み取りません。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm test         # 認識エンジンとシーケンサーのテスト
npm run build    # dist/ に静的ファイルを出力
```

`samples/*.ly` は LilyPond で作ったテスト用の譜面です (`lilypond -o public/samples/groove samples/groove.ly` で PDF を再生成)。
`tests/fixtures/` の PNG は同じ譜面を画像化したもので、認識結果を正解と照合しています。

### 構成

```
src/
  main.js            画面とイベント処理
  pdf.js             pdf.js による描画・テキスト読み取り・解析の呼び出し
  drums.js           楽器定義と、五線上の位置 → 楽器の対応表
  omr/analyze.js     画像から五線・小節線・符頭を検出 (Web Worker で実行)
  omr/rhythm.js      符頭の間隔から拍位置を推定 (動的計画法)
  omr/buildScore.js  解析結果から譜面データを組み立てる
  audio/sampler.js   生ドラムのサンプル音源 (public/sounds/virtuosity)
  audio/synth.js     合成音 (サンプル読み込み前の予備とメトロノーム)
  audio/sequencer.js テンポ・ループ・カウントインを扱うシーケンサー
  audio/player.js    シーケンサーを AudioContext 上で鳴らす
```

## 音源について

`public/sounds/virtuosity/` は Versilian Studios / Karoryfer Lecolds の
[Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (CC0 1.0) から
楽器ごとに 2 テイクずつ抜き出し、キック・スネア・オーバーヘッドの各マイクをミックスして MP3 にしたものです
(合計 約 800KB)。詳細は同フォルダの README.md を参照してください。

## 公開 (GitHub Pages)

`main` ブランチに push すると `.github/workflows/deploy.yml` がビルドして GitHub Pages に公開します。
初回はリポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。
