// popup / options で共有するヘルパー (content.js は単体で完結させるため含めない)
"use strict";

const QM_DEFAULTS = {
  enabled: true,
  mode: "hide",
  showMuteButton: true,
  mutedUsers: [],
  mutedOrgs: [],
};

// Qiita のユーザー ID として使えない予約パス (URL からの抽出時に除外)
const QM_RESERVED_SEGMENTS = new Set([
  "organizations", "items", "tags", "search", "trend", "timeline", "milestones",
  "official-columns", "advent-calendar", "question", "questions", "drafts",
  "private", "settings", "notifications", "login", "signup", "sessions",
  "about", "terms", "privacy", "api", "jobs", "release-notes", "opportunities",
]);

function qmNormalizeId(raw) {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function qmTryParseQiitaUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!/^(https?:\/\/|\/)/i.test(text)) return null;
  try {
    const url = new URL(text, "https://qiita.com/");
    if (!/(^|\.)qiita\.com$/.test(url.hostname)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

// 入力 (ID / @ID / Qiita の URL) からユーザー ID を抽出。抽出できなければ null。
function qmExtractUserId(raw) {
  const path = qmTryParseQiitaUrl(raw);
  if (path === null) {
    const id = qmNormalizeId(raw);
    return /^[a-z0-9_-]+$/.test(id) ? id : null;
  }
  const m = /^\/@?([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(path);
  if (!m) return null;
  const id = qmNormalizeId(m[1]);
  if (QM_RESERVED_SEGMENTS.has(id)) return null;
  return id;
}

// 入力 (ID / Qiita の Organization URL) から Organization ID を抽出。
function qmExtractOrgId(raw) {
  const path = qmTryParseQiitaUrl(raw);
  if (path === null) {
    const id = qmNormalizeId(raw);
    return /^[a-z0-9_-]+$/.test(id) ? id : null;
  }
  const m = /^\/organizations\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(path);
  return m ? qmNormalizeId(m[1]) : null;
}

function qmLoadSettings(callback) {
  chrome.storage.sync.get(QM_DEFAULTS, (items) => {
    callback({
      enabled: items.enabled !== false,
      mode: items.mode === "collapse" ? "collapse" : "hide",
      showMuteButton: items.showMuteButton !== false,
      mutedUsers: (items.mutedUsers || []).map(qmNormalizeId).filter(Boolean),
      mutedOrgs: (items.mutedOrgs || []).map(qmNormalizeId).filter(Boolean),
    });
  });
}

function qmUniqueSorted(list) {
  return [...new Set(list.map(qmNormalizeId).filter(Boolean))].sort();
}
