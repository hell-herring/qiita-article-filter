// content.js の結合テスト。
// JSDOM (runScripts: "outside-only") 上で window.chrome をスタブし、
// content.js を実際に実行して「どの要素が qm-hidden になったか」を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const contentSource = readFileSync(new URL("../content.js", import.meta.url), "utf8");

// chrome.storage.sync / onChanged の同期スタブ
function makeChrome(initialStore = {}) {
  const store = { ...initialStore };
  const listeners = [];
  return {
    storage: {
      sync: {
        get(defaults, callback) {
          callback({ ...defaults, ...store });
        },
        set(items, callback) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = value;
          }
          if (callback) callback();
          for (const listener of listeners) listener(changes, "sync");
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
    _store: store,
  };
}

function launch(html, { url = "https://qiita.com/", storage = {} } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const chrome = makeChrome(storage);
  dom.window.chrome = chrome;
  dom.window.eval(contentSource);
  return { dom, window: dom.window, document: dom.window.document, chrome };
}

// トレンド一覧を模したフィクスチャ。クラス名は本物同様ランダム風にしてある。
const FEED_HTML = `<!DOCTYPE html>
<html><body>
<div id="__next">
  <header><nav><a href="/">Qiita</a><a href="/timeline">タイムライン</a></nav></header>
  <main>
    <div class="style-x1y2z3">
      <ul id="feed" class="style-a9b8c7">
        <li id="card-alice" class="style-q1w2e3">
          <h2><a href="/Alice/items/0123456789abcdef0123">Alice の記事</a></h2>
          <a href="/Alice">@Alice</a>
        </li>
        <li id="card-bob" class="style-r4t5y6">
          <h2><a href="/bob/items/fedcba9876543210fedc">Bob の記事</a></h2>
          <a href="/organizations/AcmeOrg">Acme Org</a>
        </li>
        <li id="card-carol" class="style-u7i8o9">
          <h2><a href="/carol/items/00112233445566778899">Carol の記事</a></h2>
          <a href="/organizations/acmeorg">Acme Org</a>
        </li>
      </ul>
    </div>
  </main>
  <footer><a href="/about">About</a></footer>
</div>
</body></html>`;

function hidden(document, id) {
  return document.getElementById(id).classList.contains("qm-hidden");
}

test("ユーザーを指定するとそのカードだけ隠れる", () => {
  const { document } = launch(FEED_HTML, { storage: { mutedUsers: ["alice"] } });
  assert.equal(hidden(document, "card-alice"), true);
  assert.equal(hidden(document, "card-bob"), false);
  assert.equal(hidden(document, "card-carol"), false);
  // ガード対象は決して隠れない
  for (const selector of ["html", "body", "main", "header", "footer", "#__next", "#feed"]) {
    assert.equal(document.querySelector(selector).classList.contains("qm-hidden"), false);
  }
});

test("Organization を指定すると所属者のカードがまとめて隠れる", () => {
  const { document } = launch(FEED_HTML, { storage: { mutedOrgs: ["acmeorg"] } });
  assert.equal(hidden(document, "card-alice"), false);
  assert.equal(hidden(document, "card-bob"), true);
  assert.equal(hidden(document, "card-carol"), true);
});

test("ユーザー ID の大文字小文字は区別しない (@ 付きも許容)", () => {
  const { document } = launch(FEED_HTML, { storage: { mutedUsers: ["@ALICE"] } });
  assert.equal(hidden(document, "card-alice"), true);
  assert.equal(hidden(document, "card-bob"), false);
});

test("一致するミュート対象がなければ何も隠さない", () => {
  const { document } = launch(FEED_HTML, {
    storage: { mutedUsers: ["nobody"], mutedOrgs: ["ghost-org"] },
  });
  assert.equal(document.querySelectorAll(".qm-hidden").length, 0);
});

test("enabled:false なら何も隠さない", () => {
  const { document } = launch(FEED_HTML, {
    storage: { enabled: false, mutedUsers: ["alice"], mutedOrgs: ["acmeorg"] },
  });
  assert.equal(document.querySelectorAll(".qm-hidden").length, 0);
  assert.equal(document.querySelectorAll(".qm-stub").length, 0);
});

test("collapse モードでは .qm-stub が挿入され「表示する」で復帰できる", () => {
  const { document } = launch(FEED_HTML, {
    storage: { mode: "collapse", mutedUsers: ["alice"] },
  });
  const card = document.getElementById("card-alice");
  assert.equal(card.classList.contains("qm-collapsed"), true);
  assert.equal(card.classList.contains("qm-hidden"), false);
  const stub = card.querySelector(".qm-stub");
  assert.ok(stub, "qm-stub が挿入されている");
  assert.match(stub.textContent, /@alice の記事を隠しています/);

  // 「表示する」でそのカードだけ復帰する
  stub.querySelector(".qm-stub-show").click();
  assert.equal(card.classList.contains("qm-collapsed"), false);
  assert.equal(card.querySelector(".qm-stub"), null);
});

test("ミュートボタンがユーザー用と Organization 用の 2 つ付く", () => {
  const { document, chrome } = launch(FEED_HTML, { storage: {} });
  const card = document.getElementById("card-bob");
  const wrap = card.querySelector(".qm-mute-wrap");
  assert.ok(wrap, "qm-mute-wrap が付いている");
  const userBtn = wrap.querySelector(".qm-mute-btn.qm-mute-user");
  const orgBtn = wrap.querySelector(".qm-mute-btn.qm-mute-org");
  assert.ok(userBtn, "ユーザー用ボタンがある");
  assert.ok(orgBtn, "Organization 用ボタンがある");
  assert.equal(wrap.querySelectorAll(".qm-mute-btn").length, 2);
  // Organization リンクがないカードはユーザー用のみ
  const aliceWrap = document.getElementById("card-alice").querySelector(".qm-mute-wrap");
  assert.equal(aliceWrap.querySelectorAll(".qm-mute-btn").length, 1);

  // ボタンを押すと storage に保存され、onChanged 経由でカードが隠れる
  userBtn.click();
  // jsdom の realm を跨ぐ配列なので JSON 化して比較する
  assert.equal(JSON.stringify(chrome._store.mutedUsers), JSON.stringify(["bob"]));
  assert.equal(hidden(document, "card-bob"), true);
});

test("showMuteButton:false ならミュートボタンを付けない", () => {
  const { document } = launch(FEED_HTML, { storage: { showMuteButton: false } });
  assert.equal(document.querySelectorAll(".qm-mute-wrap").length, 0);
});

test("記事詳細ページでは関連記事だけ隠れ、本文の article は残る", () => {
  const html = `<!DOCTYPE html>
  <html><body>
  <div id="__next">
    <header><nav><a href="/">Qiita</a></nav></header>
    <main>
      <article id="main-article">
        <h1><a href="/dave/items/aabbccddeeff00112233">記事タイトル</a></h1>
        <p>本文です。</p>
      </article>
      <aside>
        <h2>関連記事</h2>
        <ul>
          <li id="related-eve"><a href="/eve/items/11223344556677889900">関連 1</a></li>
          <li id="related-frank"><a href="/frank/items/99887766554433221100">関連 2</a></li>
        </ul>
      </aside>
    </main>
  </div>
  </body></html>`;
  const { document } = launch(html, {
    url: "https://qiita.com/dave/items/aabbccddeeff00112233",
    storage: { mutedUsers: ["dave", "eve"] },
  });
  assert.equal(hidden(document, "related-eve"), true);
  assert.equal(hidden(document, "related-frank"), false);
  const article = document.getElementById("main-article");
  assert.equal(article.classList.contains("qm-hidden"), false);
  assert.equal(article.classList.contains("qm-collapsed"), false);
});

test("カードが 1 件しかなくても article / li なら検出できる", () => {
  const html = `<!DOCTYPE html>
  <html><body>
  <div id="__next">
    <main>
      <div>
        <article id="only-card">
          <a href="/zoe/items/0f1e2d3c4b5a69788796">唯一の記事</a>
        </article>
      </div>
    </main>
  </div>
  </body></html>`;
  const { document } = launch(html, { storage: { mutedUsers: ["zoe"] } });
  assert.equal(hidden(document, "only-card"), true);
  // main やその祖先は巻き込まれない
  assert.equal(document.querySelector("main").classList.contains("qm-hidden"), false);
  assert.equal(document.getElementById("__next").classList.contains("qm-hidden"), false);
});
