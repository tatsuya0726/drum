// 根拠として確認した出典。safety データの src に id で参照する。
// checked: 内容を確認した日。 note: 確認の範囲と限界。
export const SOURCES = {
  ibaraki_tsuri: {
    title: '茨城県「釣りをされる方へ」',
    url: 'https://www.pref.ibaraki.jp/doboku/kako/tsuri.html',
    note: '検索結果の要約で確認 (本文は県サイト停止中で直接は読めていません)。鹿島港・波崎漁港の立入禁止の防波堤への進入と転落事故、魚釣園の案内。',
  },
  ibaraki_x: {
    title: '茨城県広報 (X) 2017年2月の投稿',
    url: 'https://x.com/Ibaraki_Kouhou/status/834918970423586817',
    note: '鹿島港・波崎漁港で立入禁止の防波堤への進入による転落事故が後を絶たないこと、魚釣園の利用の呼びかけ。',
  },
  livedoor_kashima: {
    title: '「海釣り堤防」鹿島港・南防波堤 (ライブドアニュース)',
    url: 'https://news.livedoor.com/article/detail/20350609/',
    note: '警察関係者の話として、立入禁止表示を無視した侵入は軽犯罪法違反、錠を壊せば器物損壊に問われうる。現地看板の死亡者数は開港からの累計 (2021年6月の記事)。',
  },
  daiwa_gyochoen: {
    title: 'ダイワ FISHING MAP 鹿島港魚釣園',
    url: 'https://www.daiwa.com/jp/partner/fishingmap/fishingfacility/list/kashimakouotsurien_1',
    note: '開園時間・休園日・貸し竿・安全柵。料金は情報源によって食い違うので載せていません。',
  },
  ibaraki_naisuimen: {
    title: '茨城県「川や湖沼で釣りなどをするには」',
    url: 'https://www.pref.ibaraki.jp/nourinsuisan/kasui/contents/tsuriqa.html',
    note: '霞ヶ浦・北浦を除く川や湖沼では遊漁承認証が必要。霞ヶ浦・北浦は釣り対象に関わらず遊漁券は不要で、ルールは別の規則。問い合わせ先 (霞ケ浦北浦水産事務所 / 県漁政課)。',
  },
  honda_kiken: {
    title: 'Honda Fishing「釣り場の危険な魚まとめ」',
    url: 'https://www.honda.co.jp/fishing/news/news-20190528/',
    note: 'アイゴ・ゴンズイ・ハオコゼ・アカエイ・ミノカサゴ・クサフグ・アオブダイ・ヒョウモンダコ。',
  },
  kyoto_kiken: {
    title: '京都府「丹後の海の危険な魚」',
    url: 'https://www.pref.kyoto.jp/suiji/1353306858120.html',
    note: 'フグ類・アオブダイ等は食べると危険、アイゴ・ゴンズイ・オニオコゼ・アカエイ等は触ると危険。',
  },
  tottori_chiba: {
    title: '鳥取県/千葉県「海の危険生物」',
    url: 'https://www.pref.tottori.lg.jp/secure/923265/kikenseibutu.pdf',
    note: 'ヒョウモンダコ: 体長10cm以下、青い輪、唾液に猛毒、咬まれると呼吸困難・麻痺、最悪死に至る。',
  },
  shimane_hyomon: {
    title: '島根県「ヒョウモンダコ」',
    url: 'https://www.pref.shimane.lg.jp/industry/suisan/shinkou/gyosei_info/hyoubondako/kikennseibutu.html',
    note: '毒はフグと同じテトロドトキシン。素手で触らない。',
  },
  shimano_line: {
    title: 'シマノ「ライン(釣り糸)とは」',
    url: 'https://fish.shimano.com/ja-JP/content/beginners/fishingtackle/line/index.html',
    note: '閲覧に失敗 (403) し、本文は確認できていません。結び方・糸の扱いの記述は一般的な釣りの定説で、このアプリの記述は未検証です。',
  },
  daiwa_harisu: {
    title: 'ダイワ「ハリスとは」',
    url: 'https://www.daiwa.com/jp/beginner/tackle/harisu',
    note: 'ハリスは道糸より細くして、根掛かり時にハリスから切れるようにする、という考え方。',
  },
};
