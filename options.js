"use strict";

const usersTextarea = document.getElementById("users-textarea");
const orgsTextarea = document.getElementById("orgs-textarea");
const statusEl = document.getElementById("status");
const importError = document.getElementById("import-error");

function showStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 2500);
}

function render(settings) {
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("showMuteButton").checked = settings.showMuteButton;
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.checked = radio.value === settings.mode;
  }
  usersTextarea.value = settings.mutedUsers.join("\n");
  orgsTextarea.value = settings.mutedOrgs.join("\n");
}

function parseLines(text, extract) {
  const ids = [];
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const id = extract(trimmed);
    if (id) ids.push(id);
  }
  return qmUniqueSorted(ids);
}

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      mutedUsers: parseLines(usersTextarea.value, qmExtractUserId),
      mutedOrgs: parseLines(orgsTextarea.value, qmExtractOrgId),
    },
    () => showStatus("保存しました")
  );
});

document.getElementById("enabled").addEventListener("change", (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked });
});
document.getElementById("showMuteButton").addEventListener("change", (e) => {
  chrome.storage.sync.set({ showMuteButton: e.target.checked });
});
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    if (radio.checked) chrome.storage.sync.set({ mode: radio.value });
  });
}

document.getElementById("export").addEventListener("click", () => {
  qmLoadSettings((settings) => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qiita-article-filter-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById("import").addEventListener("change", (e) => {
  importError.hidden = true;
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(String(reader.result));
    } catch {
      importError.textContent = "JSON として読み取れませんでした。";
      importError.hidden = false;
      return;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      importError.textContent = "設定の形式が正しくありません。";
      importError.hidden = false;
      return;
    }
    const next = {};
    if (typeof data.enabled === "boolean") next.enabled = data.enabled;
    if (data.mode === "hide" || data.mode === "collapse") next.mode = data.mode;
    if (typeof data.showMuteButton === "boolean") next.showMuteButton = data.showMuteButton;
    if (Array.isArray(data.mutedUsers)) next.mutedUsers = qmUniqueSorted(data.mutedUsers);
    if (Array.isArray(data.mutedOrgs)) next.mutedOrgs = qmUniqueSorted(data.mutedOrgs);
    chrome.storage.sync.set(next, () => showStatus("読み込みました"));
  };
  reader.readAsText(file);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") qmLoadSettings(render);
});

qmLoadSettings(render);
