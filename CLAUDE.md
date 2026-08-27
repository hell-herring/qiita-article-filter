# CLAUDE.md

Qiita の記事一覧から特定ユーザー / Organization の記事を隠す Chrome 拡張機能 (Manifest V3)。

## 最重要の制約: クラス名に依存しない

Qiita は Next.js + CSS Modules で、**クラス名・data 属性はビルドごとに変わる**。
`content.js` のセレクタでクラス名や data 属性を参照するコードは絶対に書かないこと。

記事カードの特定は URL 構造のみで行う:

- 記事リンク: `/^\/([A-Za-z0-9_-]+)\/(?:items|private|drafts)\/[0-9A-Za-z]+/` (第 1 セグメント = 著者 ID)
- カード検出: リンクの祖先を最大 15 階層たどり、`article` / `li` に当たるか「親の子要素のうち**別の記事**へのリンクを含むものがある」階層で確定。同一カード内にはタイトル / いいね / コメント等、同じ記事へのリンクが複数並ぶため、リンクの有無ではなく記事キー (`/{userId}/items/{itemId}`) で区別する
- Organization: カード内の `/organizations/{id}` リンクで判定
- ガード: `html` / `body` / `main` / `header` / `footer` / `nav` / `#__next` と `main` を包含する要素は絶対に隠さない
- 現在ページ自身へのリンクはカード扱いしない (記事詳細ページの本文保護)

## セレクタ・カード検出ロジックを触ったら必ず `npm test`

`test/content.test.mjs` は jsdom 上で `content.js` を実際に実行し、どの要素が
隠れるかを検証する結合テスト。カード検出 (`findCard` / `containsArticleLink` /
`isForbidden`)、正規表現、注入 CSS のクラス名のいずれかを変更したら、
**必ず `npm test` を実行して全件パスを確認してから完了とすること**。

```sh
npm ci       # 初回のみ (jsdom / ESLint / Prettier)
npm test
```

## コミット前に `npm run check`

`npm run check` = ESLint + Prettier の差分チェック + テスト。GitHub Actions
(`.github/workflows/ci.yml`) が Pull Request で同じ内容を回すので、**変更を終える前に
必ずローカルで通しておくこと**。整形の差分は `npm run format` で解消できる。

- ESLint は flat config (`eslint.config.mjs`)。拡張機能本体は `sourceType: "script"` +
  browser グローバル、`scripts/` と `test/` の `.mjs` は Node の ESM として設定している。
  `common.js` が公開するグローバル (`QM_*` / `qm*`) は popup / options 用に
  config 側で宣言しているので、ヘルパーを増やしたら `eslint.config.mjs` にも追加すること
- Prettier の設定は `.prettierrc.json` (printWidth 100)。フォーマット系 ESLint ルールは
  `eslint-config-prettier` で無効化済みなので、整形は Prettier に一本化する
- CI は `icons/` が `npm run icons` の出力と一致することも検証する。
  `scripts/generate-icons.mjs` を変更したら再生成してコミットすること
- 依存は `package-lock.json` をコミットして CI では `npm ci` で入れている。
  依存を追加・更新したら lockfile も必ず一緒にコミットすること (ズレると CI が落ちる)

## その他の約束事

- 注入する CSS のクラスはすべて `qm-` 接頭辞 + `!important` (`content.css`)
- 設定キーは `enabled` / `mode` (`"hide" | "collapse"`) / `showMuteButton` / `mutedUsers` / `mutedOrgs`。ID は保存・比較の前に必ず正規化 (小文字化 + 先頭 `@` 除去)
- `content.js` は単体で完結させる (`common.js` は popup / options 専用)
- permissions は `storage` のみ、host_permissions は `https://qiita.com/*` のみ。増やさない
- UI 文言は日本語。ダークモードと `prefers-reduced-motion` への対応を壊さない
- アイコンは `npm run icons` (`scripts/generate-icons.mjs`) で再生成できる
