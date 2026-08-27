# qiita-article-filter

Qiita (https://qiita.com) の記事一覧から、特定のユーザーや Organization の記事を隠す Chrome 拡張機能です。

## 機能

- **ユーザー単位のミュート** — 指定したユーザーの記事カードを一覧 (トレンド・タイムライン・タグページ・関連記事など) から隠します
- **Organization 単位のミュート** — カード上に Organization リンクが表示されている記事をまとめて隠します
- **2 つの隠しかた**
  - `完全に隠す (hide)`: カードごと非表示にします
  - `折りたたむ (collapse)`: カードの中身を「◯◯ の記事を隠しています / 表示する」のバーに置き換えます。「表示する」を押すとそのカードだけ復帰します
- **カード上のミュートボタン** — カードにホバーすると右上にミュートボタンが現れ、ワンクリックでミュートできます (設定でオフ可)。Organization を検出したカードには Organization 用のボタンも出ます
- **ポップアップ** — 有効/無効の切り替え、モード切り替え、ユーザー/Organization の追加・削除。開いているページの URL から著者を検出してワンクリック追加できます。入力欄には ID のほか Qiita の URL をそのまま貼り付けても ID を抽出します
- **設定ページ** — textarea での一括編集と、JSON での書き出し/読み込み
- **無限スクロール・SPA 遷移に追従** — MutationObserver と history API のフックで、後から読み込まれた記事にも適用されます
- 設定は `chrome.storage.sync` に保存され、同じ Google アカウントの Chrome 間で同期されます
- ダークモード (`prefers-color-scheme`) と `prefers-reduced-motion` に対応

## ダウンロード

Chrome ウェブストアには公開していないため、ZIP をダウンロードして開発者モードで読み込みます。

| 種類                   | リンク                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 最新リリース (推奨)    | [qiita-article-filter-v1.0.1.zip](https://github.com/hell-herring/qiita-article-filter/archive/refs/tags/v1.0.1.zip) |
| 開発版 (`main` の最新) | [main.zip](https://github.com/hell-herring/qiita-article-filter/archive/refs/heads/main.zip)                         |
| 過去のバージョン       | [リリース一覧](https://github.com/hell-herring/qiita-article-filter/releases)                                        |

ZIP を展開すると `qiita-article-filter-1.0.1` のようなフォルダができ、その直下に `manifest.json` があります。
Chrome は読み込んだフォルダを参照し続けるので、**展開先は消したり移動したりしない場所** (例: `~/chrome-extensions/qiita-article-filter/`) に置いてください。

`git` が使える場合はクローンでも構いません (更新が `git pull` だけで済みます)。

```sh
git clone https://github.com/hell-herring/qiita-article-filter.git
```

## インストール (開発者モード)

1. 上のリンクから ZIP をダウンロードして展開します (またはリポジトリをクローンします)
2. Chrome で `chrome://extensions/` を開きます
3. 右上の「デベロッパー モード」をオンにします
4. 「パッケージ化されていない拡張機能を読み込む」を押し、展開したフォルダ (`manifest.json` があるフォルダ) を選択します
5. https://qiita.com/ を開き、ツールバーの拡張機能アイコンからミュート対象を登録します

## 更新手順

開発者モードで読み込んだ拡張機能は **自動更新されません**。新しいバージョンを使うには、ファイルを差し替えてから Chrome に再読み込みさせます。

### クローンした場合

```sh
cd path/to/qiita-article-filter
git pull
```

### ZIP でインストールした場合

1. [最新リリースの ZIP](https://github.com/hell-herring/qiita-article-filter/releases/latest) をダウンロードして展開します
2. **インストール時と同じフォルダパスのまま**、中身を新しいファイルで上書きします
   - フォルダを削除して置き直すとパスが変わりやすく、パスが変わると Chrome 上の拡張機能 ID も変わって設定が引き継がれません
   - パスを変えたい場合や「このアイテムを読み込めませんでした」と表示された場合は、いったん拡張機能を削除して、新しいフォルダを読み込み直してください

### Chrome に再読み込みさせる

1. `chrome://extensions/` を開きます
2. 「Qiita Article Filter」のカードにある再読み込みアイコン (⟳) を押します
   - デベロッパー モードが有効なら、右上の「更新」ボタンでまとめて再読み込みすることもできます
3. カードに表示されるバージョン番号が新しくなっていることを確認します
4. すでに開いている qiita.com のタブには古いスクリプトが残っているため、**タブを再読み込み**します

### 設定のバックアップ

ミュート設定は `chrome.storage.sync` に保存され、上書き更新と再読み込みでは消えません。
ただし拡張機能を削除して読み込み直したり、フォルダのパスを変えたりすると失われることがあるため、
心配な場合は事前に設定ページ (拡張機能の「詳細」→「拡張機能のオプション」) の **JSON 書き出し** でバックアップしておいてください。読み込み直したあとは、同じ画面の JSON 読み込みで復元できます。

## 仕組み

Qiita は Next.js + CSS Modules で構築されており、**クラス名がビルドごとに変わる**ため、クラス名や data 属性に依存したセレクタは使っていません。代わりに URL 構造だけを頼りに記事カードを特定します。

1. ページ内のすべての `<a>` から `/{userId}/items/{id}` 形式 (`private` / `drafts` も含む) のリンクを拾います
   (正規表現: `/^\/([A-Za-z0-9_-]+)\/(?:items|private|drafts)\/[0-9A-Za-z]+/`)
2. パスの第 1 セグメントがそのまま著者のユーザー ID なので、DOM の中身を読まずに著者が確定します
3. そのリンクの祖先を最大 15 階層たどり、「親の子要素のうち**別の記事**へのリンクを含むものがある」階層で停止し、そこを 1 件分のカードとみなします。途中で `article` / `li` に当たったらそこで確定します。1 枚のカード内にはタイトル・いいね・コメントなど同じ記事へのリンクが複数並ぶため、リンクの有無ではなく記事パス (`/{userId}/items/{itemId}`) で「別の記事かどうか」を判定します
4. カード内に `/organizations/{id}` へのリンクがあれば Organization も紐づけます
5. 誤爆でページ全体が消えないよう、`html` / `body` / `main` / `header` / `footer` / `nav` / `#__next`、および `main` を包含する要素は絶対に隠さないガードを入れています
6. 現在開いているページ自身へのリンク (記事詳細の見出しなど) はカード扱いしないため、記事詳細ページでは関連記事だけが隠れ、本文は残ります

注入する CSS はすべて `qm-` 接頭辞 + `!important` で、Qiita 側のスタイルと衝突しないようにしています。

## 開発

```sh
npm ci               # 開発用の依存 (jsdom / ESLint / Prettier) を lockfile どおりに導入
npm run check        # lint + format チェック + テストをまとめて実行 (CI と同じ内容)

npm run lint         # ESLint
npm run lint:fix     # ESLint (自動修正)
npm run format       # Prettier で整形
npm run format:check # Prettier の差分チェック
npm test             # jsdom 上で content.js を実行する結合テスト
npm run icons        # icons/ の PNG を再生成
```

- Linter: [ESLint](https://eslint.org/) (flat config / `eslint.config.mjs`)。拡張機能本体 (`content.js` / `common.js` / `popup.js` / `options.js`) はブラウザの古典スクリプト、`scripts/` と `test/` は Node の ESM として別々に設定しています
- Formatter: [Prettier](https://prettier.io/) (`.prettierrc.json`)。JS / CSS / HTML / JSON / Markdown を対象にしています。フォーマット系の ESLint ルールは `eslint-config-prettier` で無効化してあるため、両者は競合しません
- CI: GitHub Actions (`.github/workflows/ci.yml`)。`main` への push と Pull Request で、lint / format チェック / テスト / `icons/` が `npm run icons` の出力と一致するかを検証します。依存は `package-lock.json` をコミットしたうえで `npm ci` で再現インストールしています (依存を足したら lockfile も一緒にコミットすること)

## 既知の制約

- **Organization の自動判定は、カード上に Organization リンクが表示されている場合のみ**行えます。一覧のカードに Organization が表示されないページでは、ユーザー ID でのミュートを併用してください
- カードの検出は URL 構造のヒューリスティックに基づくため、Qiita 側の大幅な DOM 構造変更で検出精度が変わる可能性があります (クラス名の変更には影響されません)
- `chrome.storage.sync` の容量制限 (約 100KB) を超える数の ID は保存できません

## ライセンス

[MIT](LICENSE)
