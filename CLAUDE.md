# CLAUDE.md

Qiita の記事一覧から特定ユーザー / Organization の記事を隠す Chrome 拡張機能 (Manifest V3)。

## 最重要の制約: クラス名に依存しない

Qiita は Next.js + CSS Modules で、**クラス名・data 属性はビルドごとに変わる**。
`content.js` のセレクタでクラス名や data 属性を参照するコードは絶対に書かないこと。

記事カードの特定は URL 構造のみで行う:

- 記事リンク: `/^\/([A-Za-z0-9_-]+)\/(?:items|private|drafts)\/[0-9A-Za-z]+/` (第 1 セグメント = 著者 ID)
- カード検出: リンクの祖先を最大 15 階層たどり、`article` / `li` に当たるか「親の子要素のうち記事リンクを含むものが 2 つ以上」の階層で確定
- Organization: カード内の `/organizations/{id}` リンクで判定
- ガード: `html` / `body` / `main` / `header` / `footer` / `nav` / `#__next` と `main` を包含する要素は絶対に隠さない
- 現在ページ自身へのリンクはカード扱いしない (記事詳細ページの本文保護)

## セレクタ・カード検出ロジックを触ったら必ず `npm test`

`test/content.test.mjs` は jsdom 上で `content.js` を実際に実行し、どの要素が
隠れるかを検証する結合テスト。カード検出 (`findCard` / `containsArticleLink` /
`isForbidden`)、正規表現、注入 CSS のクラス名のいずれかを変更したら、
**必ず `npm test` を実行して全件パスを確認してから完了とすること**。

```sh
npm install  # 初回のみ (jsdom)
npm test
```

## その他の約束事

- 注入する CSS のクラスはすべて `qm-` 接頭辞 + `!important` (`content.css`)
- 設定キーは `enabled` / `mode` (`"hide" | "collapse"`) / `showMuteButton` / `mutedUsers` / `mutedOrgs`。ID は保存・比較の前に必ず正規化 (小文字化 + 先頭 `@` 除去)
- `content.js` は単体で完結させる (`common.js` は popup / options 専用)
- permissions は `storage` のみ、host_permissions は `https://qiita.com/*` のみ。増やさない
- UI 文言は日本語。ダークモードと `prefers-reduced-motion` への対応を壊さない
- アイコンは `npm run icons` (`scripts/generate-icons.mjs`) で再生成できる
