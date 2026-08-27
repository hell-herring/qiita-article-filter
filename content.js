// Qiita Article Filter - content script
//
// Qiita は Next.js + CSS Modules でクラス名がビルドごとに変わるため、
// クラス名や data 属性には一切依存しない。記事カードの特定は
// 「/{userId}/items/{id} 形式のリンク + 祖先の構造」だけで行う。
// セレクタまわりを変更したら必ず `npm test` を実行すること (CLAUDE.md 参照)。
(() => {
  "use strict";

  // /{userId}/items/{id} (private/drafts 含む)。第1セグメントが著者のユーザー ID。
  const ARTICLE_PATH_RE = /^\/([A-Za-z0-9_-]+)\/(?:items|private|drafts)\/[0-9A-Za-z]+/;
  const ORG_PATH_RE = /^\/organizations\/([A-Za-z0-9_-]+)(?:[/?#]|$)/;
  const MAX_CLIMB = 15;
  // これらは絶対に隠さない (ページ全体が消える事故を防ぐガード)
  const FORBIDDEN_TAGS = new Set(["HTML", "BODY", "MAIN", "HEADER", "FOOTER", "NAV"]);

  const DEFAULTS = {
    enabled: true,
    mode: "hide", // "hide" | "collapse"
    showMuteButton: true,
    mutedUsers: [],
    mutedOrgs: [],
  };

  const state = {
    enabled: true,
    mode: "hide",
    showMuteButton: true,
    mutedUsers: new Set(),
    mutedOrgs: new Set(),
  };

  // collapse モードで「表示する」を押したカード。設定変更時にリセットする。
  let revealedCards = new WeakSet();
  // この拡張が手を加えたカード (巻き戻し用)
  const touchedCards = new Set();

  function normalizeId(raw) {
    return String(raw ?? "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
  }

  function setState(items) {
    state.enabled = items.enabled !== false;
    state.mode = items.mode === "collapse" ? "collapse" : "hide";
    state.showMuteButton = items.showMuteButton !== false;
    state.mutedUsers = new Set((items.mutedUsers || []).map(normalizeId).filter(Boolean));
    state.mutedOrgs = new Set((items.mutedOrgs || []).map(normalizeId).filter(Boolean));
  }

  // ---- URL ユーティリティ ----------------------------------------------

  function pathOf(anchor) {
    const href = anchor.getAttribute("href");
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (url.host !== location.host) return null;
    return url.pathname;
  }

  function articleMatchOf(anchor) {
    const path = pathOf(anchor);
    if (!path) return null;
    const m = ARTICLE_PATH_RE.exec(path);
    if (!m) return null;
    // 現在開いているページ自身へのリンク (記事詳細の見出し等) はカード扱いしない
    if (path.replace(/\/+$/, "") === location.pathname.replace(/\/+$/, "")) return null;
    return m;
  }

  function articleAuthorOf(anchor) {
    const m = articleMatchOf(anchor);
    return m ? normalizeId(m[1]) : null;
  }

  // 記事を一意に識別するキー (/{userId}/items/{itemId} 部分)。
  // 1 枚のカードにはタイトル・いいね・コメント等、同じ記事へのリンクが
  // 複数あるため、「リンクの有無」ではなくこのキーで記事を区別する。
  function articleKeyOf(anchor) {
    const m = articleMatchOf(anchor);
    return m ? m[0].toLowerCase() : null;
  }

  // ---- カード検出 -------------------------------------------------------

  function articleKeysIn(node) {
    const keys = new Set();
    if (!node || node.nodeType !== 1) return keys;
    if (node.tagName === "A") {
      const key = articleKeyOf(node);
      if (key) keys.add(key);
    }
    for (const a of node.querySelectorAll("a[href]")) {
      const key = articleKeyOf(a);
      if (key) keys.add(key);
    }
    return keys;
  }

  function isForbidden(el, mainEl) {
    if (!el || el.nodeType !== 1) return true;
    if (FORBIDDEN_TAGS.has(el.tagName)) return true;
    if (el.id === "__next") return true;
    // main を包含する要素を隠すとページ全体が消えるので除外
    if (mainEl && el.contains(mainEl)) return true;
    return false;
  }

  // リンクから記事カード 1 件分に相当する祖先要素を探す。
  // - article / li に当たったらそこで確定
  // - 「親の子要素のうち、el とは別の記事へのリンクを含むものがある」なら
  //   その階層 (el) で確定。同一カード内にはタイトル・いいね・コメント等、
  //   同じ記事へのリンクが複数並ぶため、「記事リンクの有無」だけで数えると
  //   カード内部 (タイトルの階層など) で誤って止まってしまう。
  // - ガード対象に到達したら諦める (null)
  function findCard(link, mainEl) {
    let el = link;
    for (let depth = 0; depth < MAX_CLIMB; depth++) {
      if (isForbidden(el, mainEl)) return null;
      if (el.tagName === "ARTICLE" || el.tagName === "LI") return el;
      const parent = el.parentElement;
      if (!parent) return null;
      const ownKeys = articleKeysIn(el);
      let atCardLevel = false;
      for (const child of parent.children) {
        if (child === el) continue;
        for (const key of articleKeysIn(child)) {
          if (!ownKeys.has(key)) {
            atCardLevel = true;
            break;
          }
        }
        if (atCardLevel) break;
      }
      if (atCardLevel) return el;
      if (isForbidden(parent, mainEl)) return null;
      el = parent;
    }
    return null;
  }

  function orgsOf(card) {
    const orgs = new Set();
    for (const a of card.querySelectorAll("a[href]")) {
      const path = pathOf(a);
      if (!path) continue;
      const m = ORG_PATH_RE.exec(path);
      if (m) orgs.add(normalizeId(m[1]));
    }
    return orgs;
  }

  // ---- ミュートの適用 / 巻き戻し ---------------------------------------

  function removeInjected(card) {
    card.classList.remove("qm-hidden", "qm-collapsed", "qm-card");
    for (const el of card.querySelectorAll(":scope > .qm-stub, :scope > .qm-mute-wrap")) {
      el.remove();
    }
  }

  function revertAll() {
    for (const card of touchedCards) {
      if (card.isConnected) removeInjected(card);
    }
    touchedCards.clear();
  }

  function saveMute(kind, id) {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      const key = kind === "org" ? "mutedOrgs" : "mutedUsers";
      const list = (items[key] || []).map(normalizeId).filter(Boolean);
      if (!list.includes(id)) list.push(id);
      chrome.storage.sync.set({ [key]: list });
    });
  }

  function ensureMuteButtons(card, author, orgs) {
    // Organization リンクが遅れて描画されるケースがあるので、
    // 対象 (著者 + Organization) が変わっていたら作り直す
    const signature = JSON.stringify([author, ...orgs]);
    const existing = card.querySelector(":scope > .qm-mute-wrap");
    if (existing) {
      if (existing.dataset.qmFor === signature) return;
      existing.remove();
    }
    const wrap = document.createElement("div");
    wrap.className = "qm-mute-wrap";
    wrap.dataset.qmFor = signature;

    const userBtn = document.createElement("button");
    userBtn.type = "button";
    userBtn.className = "qm-mute-btn qm-mute-user";
    userBtn.textContent = `@${author} をミュート`;
    userBtn.title = `@${author} の記事を今後表示しません`;
    userBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveMute("user", author);
    });
    wrap.appendChild(userBtn);

    for (const org of orgs) {
      const orgBtn = document.createElement("button");
      orgBtn.type = "button";
      orgBtn.className = "qm-mute-btn qm-mute-org";
      orgBtn.textContent = `${org} をミュート (Organization)`;
      orgBtn.title = `Organization「${org}」所属の記事を今後表示しません`;
      orgBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveMute("org", org);
      });
      wrap.appendChild(orgBtn);
    }
    card.appendChild(wrap);
  }

  function ensureStub(card, label) {
    let stub = card.querySelector(":scope > .qm-stub");
    if (stub) return;
    stub = document.createElement("div");
    stub.className = "qm-stub";
    stub.setAttribute("role", "note");

    const text = document.createElement("span");
    text.className = "qm-stub-label";
    text.textContent = `${label} の記事を隠しています`;
    stub.appendChild(text);

    const show = document.createElement("button");
    show.type = "button";
    show.className = "qm-stub-show";
    show.textContent = "表示する";
    show.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      revealedCards.add(card);
      card.classList.remove("qm-collapsed");
      stub.remove();
    });
    stub.appendChild(show);

    card.insertBefore(stub, card.firstChild);
  }

  function collectCards() {
    const mainEl = document.querySelector("main");
    const cards = new Map(); // card element -> { author, orgs }
    for (const a of document.querySelectorAll("a[href]")) {
      const author = articleAuthorOf(a);
      if (author === null) continue;
      const card = findCard(a, mainEl);
      if (!card || cards.has(card)) continue;
      cards.set(card, { author, orgs: orgsOf(card) });
    }
    return cards;
  }

  function apply() {
    if (!state.enabled) {
      revertAll();
      return;
    }
    const cards = collectCards();
    for (const [card, { author, orgs }] of cards) {
      touchedCards.add(card);
      card.classList.add("qm-card");

      let mutedLabel = null;
      if (state.mutedUsers.has(author)) {
        mutedLabel = `@${author}`;
      } else {
        for (const org of orgs) {
          if (state.mutedOrgs.has(org)) {
            mutedLabel = org;
            break;
          }
        }
      }

      if (state.showMuteButton) {
        ensureMuteButtons(card, author, orgs);
      } else {
        card.querySelector(":scope > .qm-mute-wrap")?.remove();
      }

      if (mutedLabel === null) {
        card.classList.remove("qm-hidden", "qm-collapsed");
        card.querySelector(":scope > .qm-stub")?.remove();
        continue;
      }

      if (state.mode === "hide") {
        card.classList.add("qm-hidden");
        card.classList.remove("qm-collapsed");
        card.querySelector(":scope > .qm-stub")?.remove();
      } else {
        card.classList.remove("qm-hidden");
        if (revealedCards.has(card)) {
          card.classList.remove("qm-collapsed");
          card.querySelector(":scope > .qm-stub")?.remove();
        } else {
          card.classList.add("qm-collapsed");
          ensureStub(card, mutedLabel);
        }
      }
    }
  }

  // ---- 再適用のトリガ (無限スクロール / SPA 遷移 / 設定変更) ------------

  const raf =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    raf(() => {
      scheduled = false;
      apply();
    });
  }

  function startObservers() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (typeof original !== "function") continue;
      history[method] = function (...args) {
        const result = original.apply(this, args);
        schedule();
        return result;
      };
    }
    window.addEventListener("popstate", schedule);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    chrome.storage.sync.get(DEFAULTS, (items) => {
      // 設定変更時は既存の適用をすべて巻き戻してから再適用する
      revertAll();
      revealedCards = new WeakSet();
      setState(items);
      apply();
    });
  });

  chrome.storage.sync.get(DEFAULTS, (items) => {
    setState(items);
    apply();
    startObservers();
  });
})();
