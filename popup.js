"use strict";

let settings = { ...QM_DEFAULTS };

function save(partial) {
  chrome.storage.sync.set(partial);
}

function renderList(ulId, ids, key) {
  const ul = document.getElementById(ulId);
  ul.textContent = "";
  if (ids.length === 0) {
    const li = document.createElement("li");
    li.className = "qm-empty";
    li.textContent = "まだ登録されていません";
    ul.appendChild(li);
    return;
  }
  for (const id of ids) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = key === "mutedUsers" ? `@${id}` : id;
    li.appendChild(name);

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.setAttribute("aria-label", `${name.textContent} をミュート解除`);
    del.addEventListener("click", () => {
      save({ [key]: settings[key].filter((v) => v !== id) });
    });
    li.appendChild(del);
    ul.appendChild(li);
  }
}

function render() {
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("showMuteButton").checked = settings.showMuteButton;
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.checked = radio.value === settings.mode;
  }
  renderList("user-list", settings.mutedUsers, "mutedUsers");
  renderList("org-list", settings.mutedOrgs, "mutedOrgs");
}

function reload() {
  qmLoadSettings((loaded) => {
    settings = loaded;
    render();
  });
}

function addId(key, id) {
  if (!id) return false;
  save({ [key]: qmUniqueSorted([...settings[key], id]) });
  return true;
}

function setupAddForm(formId, inputId, errorId, key, extract) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  document.getElementById(formId).addEventListener("submit", (e) => {
    e.preventDefault();
    const id = extract(input.value);
    if (!id) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    input.value = "";
    addId(key, id);
  });
}

// 開いているタブの URL から著者 / Organization を検出してワンクリック追加
function detectFromActiveTab() {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs?.[0]?.url;
    if (!url || !/^https:\/\/qiita\.com\//.test(url)) return;

    const path = new URL(url).pathname;
    const buttons = [];

    const orgMatch = /^\/organizations\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(path);
    if (orgMatch) {
      const org = qmNormalizeId(orgMatch[1]);
      buttons.push({ label: `Organization「${org}」をミュート`, key: "mutedOrgs", id: org });
    } else {
      const userMatch =
        /^\/@?([A-Za-z0-9_-]+)\/(?:items|private|drafts)\/[0-9A-Za-z]+/.exec(path) ||
        /^\/@?([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(path);
      if (userMatch) {
        const user = qmExtractUserId(`https://qiita.com/${userMatch[1]}`);
        if (user) {
          buttons.push({ label: `@${user} をミュート`, key: "mutedUsers", id: user });
        }
      }
    }

    if (buttons.length === 0) return;
    const container = document.getElementById("detected-buttons");
    container.textContent = "";
    for (const { label, key, id } of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", () => addId(key, id));
      container.appendChild(btn);
    }
    document.getElementById("detected-section").hidden = false;
  });
}

document.getElementById("enabled").addEventListener("change", (e) => {
  save({ enabled: e.target.checked });
});
document.getElementById("showMuteButton").addEventListener("change", (e) => {
  save({ showMuteButton: e.target.checked });
});
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    if (radio.checked) save({ mode: radio.value });
  });
}
document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
setupAddForm("user-form", "user-input", "user-error", "mutedUsers", qmExtractUserId);
setupAddForm("org-form", "org-input", "org-error", "mutedOrgs", qmExtractOrgId);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") reload();
});

reload();
detectFromActiveTab();
