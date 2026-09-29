(() => {
  "use strict";

  const INSTALL_TMP = "/data/local/tmp/.pulse-install-work";
  const HISTORY_FILE = "/data/local/tmp/.pulse-install-history.json";

  const el = {
    bridgeWarning: document.getElementById("bridge-warning"),
    bridgeBadge: document.getElementById("bridge-badge"),
    bridgeRetryBtn: document.getElementById("bridge-retry-btn"),
    tabs: document.querySelectorAll(".tab-btn"),
    panels: document.querySelectorAll(".panel-view"),
    statSelected: document.getElementById("stat-selected"),
    statSize: document.getElementById("stat-size"),
    statUnzip: document.getElementById("stat-unzip"),
    pathInput: document.getElementById("path-input"),
    pathGoBtn: document.getElementById("path-go-btn"),
    fileList: document.getElementById("file-list"),
    splitBundleCard: document.getElementById("split-bundle-card"),
    splitBundleCheck: document.getElementById("split-bundle-check"),
    optReplace: document.getElementById("opt-replace"),
    optGrant: document.getElementById("opt-grant"),
    optDeleteAfter: document.getElementById("opt-delete-after"),
    installBtn: document.getElementById("install-btn"),
    installProgress: document.getElementById("install-progress"),
    historyList: document.getElementById("history-list"),
    historyClearBtn: document.getElementById("history-clear-btn"),
    autoScanBtn: document.getElementById("auto-scan-btn"),
    autoLogBtn: document.getElementById("auto-log-btn"),
    autoProgress: document.getElementById("auto-progress"),
    vtApiKeyInput: document.getElementById("vt-apikey-input"),
    vtKeyToggleBtn: document.getElementById("vt-key-toggle-btn"),
    vtRememberKey: document.getElementById("vt-remember-key"),
    vtScanBefore: document.getElementById("vt-scan-before"),
    vtScanAfter: document.getElementById("vt-scan-after"),
    vtProgress: document.getElementById("vt-progress"),
    scanExtractAppsBtn: document.getElementById("scan-extract-apps-btn"),
    extractAppSearch: document.getElementById("extract-app-search"),
    extractScopeUser: document.getElementById("extract-scope-user"),
    extractAppList: document.getElementById("extract-app-list"),
    extractFormat: document.getElementById("extract-format"),
    extractBtn: document.getElementById("extract-btn"),
    extractProgress: document.getElementById("extract-progress"),
    consoleDrawer: document.getElementById("console-drawer"),
    consoleToggle: document.getElementById("console-toggle"),
    consoleBody: document.getElementById("console-body"),
    consoleCount: document.getElementById("console-count"),
    confirmBackdrop: document.getElementById("confirm-backdrop"),
    confirmTitle: document.getElementById("confirm-title"),
    confirmBody: document.getElementById("confirm-body"),
    confirmOk: document.getElementById("confirm-ok"),
    confirmCancel: document.getElementById("confirm-cancel"),
    langDropdown: document.getElementById("lang-dropdown"),
    langDropdownBtn: document.getElementById("lang-dropdown-btn"),
    langDropdownMenu: document.getElementById("lang-dropdown-menu"),
    langDropdownCurrent: document.getElementById("lang-dropdown-current"),
    inspectPathInput: document.getElementById("inspect-path-input"),
    inspectGoBtn: document.getElementById("inspect-go-btn"),
    inspectResult: document.getElementById("inspect-result"),
    aiEndpointInput: document.getElementById("ai-endpoint-input"),
    aiModelInput: document.getElementById("ai-model-input"),
    aiApikeyInput: document.getElementById("ai-apikey-input"),
    aiProviderDropdown: document.getElementById("ai-provider-dropdown"),
    aiProviderBtn: document.getElementById("ai-provider-btn"),
    aiProviderMenu: document.getElementById("ai-provider-menu"),
    aiProviderCurrent: document.getElementById("ai-provider-current"),
    aiModelDropdown: document.getElementById("ai-model-dropdown"),
    aiModelBtn: document.getElementById("ai-model-btn"),
    aiModelMenu: document.getElementById("ai-model-menu"),
    aiKeyToggleBtn: document.getElementById("ai-key-toggle-btn"),
    aiRememberKey: document.getElementById("ai-remember-key"),
    aiAnalyzeBtn: document.getElementById("ai-analyze-btn"),
    aiProgress: document.getElementById("ai-progress"),
    aiAnswer: document.getElementById("ai-answer"),
    aiQuestionInput: document.getElementById("ai-question-input"),
    aiAskBtn: document.getElementById("ai-ask-btn"),
  };

  let consoleLines = 0;
  let currentPath = "/sdcard/Download";
  let entries = []; // {name, isDir, sizeBytes, format, fullPath}
  const selected = new Map(); // fullPath -> entry
  let unzipAvailable = null;

  // ---------- theme toggle (light/dark, persisted in localStorage) ----------

  (function initThemeToggle() {
    const KEY = "pulse-theme";
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    function current() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
    function apply(theme) {
      if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
      btn.textContent = theme === "dark" ? "☀ light" : "☾ dark";
      try { localStorage.setItem(KEY, theme); } catch (e) { /* storage unavailable, theme just won't persist */ }
    }
    apply(current());
    btn.addEventListener("click", () => apply(current() === "dark" ? "light" : "dark"));
  })();

  // ---------- shell bridge ----------

  function bridgeAvailable() { return typeof window.Shizuku !== "undefined" && window.Shizuku !== null; }
  function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  function logConsole(text, kind) {
    consoleLines++;
    el.consoleCount.textContent = String(consoleLines);
    const line = document.createElement("div");
    line.className = "console-line" + (kind ? ` ${kind}` : "");
    line.textContent = text;
    el.consoleBody.appendChild(line);
    el.consoleBody.scrollTop = el.consoleBody.scrollHeight;
    while (el.consoleBody.children.length > 300) el.consoleBody.removeChild(el.consoleBody.firstChild);
  }

  async function exec(cmd) {
    logConsole("$ " + cmd.split("\n")[0] + (cmd.indexOf("\n") !== -1 ? " …" : ""));
    if (!bridgeAvailable()) {
      logConsole("window.Shizuku is not available.", "err");
      return { ok: false, exitCode: -1, stdout: "", stderr: "window.Shizuku is not available", timedOut: false };
    }
    let raw;
    try { raw = window.Shizuku.exec(cmd); }
    catch (e) { logConsole(String(e), "err"); return { ok: false, exitCode: -1, stdout: "", stderr: String(e), timedOut: false }; }
    let res;
    try { res = JSON.parse(raw); }
    catch (e) { logConsole("unparseable bridge response: " + String(raw).slice(0, 200), "err"); return { ok: false, exitCode: -1, stdout: "", stderr: "unparseable bridge response", timedOut: false }; }
    if (res.stdout) logConsole(res.stdout.trim(), "ok");
    if (res.stderr) logConsole(res.stderr.trim(), "err");
    return res;
  }

  async function checkBridge() {
    if (!bridgeAvailable()) {
      el.bridgeBadge.textContent = "bridge unavailable";
      el.bridgeBadge.className = "bridge-badge error";
      el.bridgeWarning.classList.remove("hidden");
      return false;
    }
    el.bridgeBadge.textContent = "connected";
    el.bridgeBadge.className = "bridge-badge ok";
    el.bridgeWarning.classList.add("hidden");
    const unzipRes = await exec("command -v unzip");
    unzipAvailable = !!(unzipRes.ok && unzipRes.stdout && unzipRes.stdout.trim());
    el.statUnzip.textContent = unzipAvailable ? "OK" : "missing";
    if (!unzipAvailable) el.statUnzip.parentElement.querySelector(".stat-num").style.color = "var(--amber)";
    return true;
  }

  // ---------- confirm modal ----------

  function confirmAction(title, body) {
    el.confirmTitle.textContent = title;
    el.confirmBody.textContent = body;
    el.confirmBackdrop.classList.remove("hidden");
    return new Promise((resolve) => {
      const cleanup = (r) => {
        el.confirmBackdrop.classList.add("hidden");
        el.confirmOk.removeEventListener("click", onOk);
        el.confirmCancel.removeEventListener("click", onCancel);
        resolve(r);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      el.confirmOk.addEventListener("click", onOk);
      el.confirmCancel.addEventListener("click", onCancel);
    });
  }

  // ---------- tabs ----------

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      el.panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "history") loadHistory();
    });
  });
  el.consoleToggle.addEventListener("click", () => el.consoleDrawer.classList.toggle("open"));

  // ---------- file browser ----------

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function detectFormat(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".apk")) return "apk";
    if (lower.endsWith(".apks")) return "apks";
    if (lower.endsWith(".xapk")) return "xapk";
    if (lower.endsWith(".apkm")) return "apkm";
    return null;
  }

  function parseLsLa(stdout) {
    const lines = (stdout || "").split("\n");
    const out = [];
    for (const line of lines) {
      if (!line.trim() || line.startsWith("total")) continue;
      const tokens = line.trim().split(/\s+/);
      if (tokens.length < 8) continue;
      const perms = tokens[0];
      const name = tokens.slice(7).join(" ");
      if (name === "." || name === "..") continue;
      const isDir = perms[0] === "d";
      const sizeBytes = parseInt(tokens[4], 10);
      out.push({ name, isDir, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null });
    }
    return out;
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function browsePath(path) {
    currentPath = path;
    el.pathInput.value = path;
    el.fileList.innerHTML = `<div class="empty-state">Loading…</div>`;
    const res = await exec(`ls -la ${shq(path)} 2>&1`);
    const parsed = parseLsLa(res.stdout);
    entries = parsed.map((e) => ({ ...e, format: e.isDir ? null : detectFormat(e.name), fullPath: path.replace(/\/+$/, "") + "/" + e.name }));
    renderFileList();
  }

  function renderFileList() {
    const rows = [];
    if (currentPath !== "/") {
      const parent = currentPath.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
      rows.push(`<div class="item-row" data-nav="${escapeHtml(parent)}" style="cursor:pointer;"><span class="item-name">.. (up)</span></div>`);
    }
    const dirs = entries.filter((e) => e.isDir);
    const files = entries.filter((e) => !e.isDir);
    dirs.forEach((e) => rows.push(`<div class="item-row" data-nav="${escapeHtml(e.fullPath)}" style="cursor:pointer;"><span class="item-name">📁 ${escapeHtml(e.name)}</span></div>`));
    files.forEach((e) => {
      const installable = !!e.format;
      rows.push(`
        <div class="item-row" data-path="${escapeHtml(e.fullPath)}">
          <div class="item-main">
            <span class="item-name">${escapeHtml(e.name)}</span>
            <span class="item-sub">${formatSize(e.sizeBytes)}${e.format ? ` · <span class="badge ok">${e.format}</span>` : ""}</span>
          </div>
          ${installable ? `<button class="inspect-btn" data-inspect="${escapeHtml(e.fullPath)}" title="Inspect">🔍</button>` : ""}
          ${installable ? `<input type="checkbox" ${selected.has(e.fullPath) ? "checked" : ""}>` : ""}
        </div>
      `);
    });
    el.fileList.innerHTML = rows.join("") || `<div class="empty-state" data-i18n="fileListEmpty">Empty directory.</div>`;
    applyI18n(el.fileList);

    el.fileList.querySelectorAll("[data-nav]").forEach((row) => {
      row.addEventListener("click", () => browsePath(row.dataset.nav));
    });
    el.fileList.querySelectorAll("[data-inspect]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === "inspect"));
        el.panels.forEach((p) => p.classList.toggle("active", p.id === "tab-inspect"));
        el.inspectPathInput.value = btn.dataset.inspect;
        inspectPath(btn.dataset.inspect);
      });
    });
    el.fileList.querySelectorAll("[data-path]").forEach((row) => {
      const checkbox = row.querySelector("input[type=checkbox]");
      if (!checkbox) return;
      const toggle = () => {
        const path = row.dataset.path;
        const entry = entries.find((e) => e.fullPath === path);
        if (selected.has(path)) selected.delete(path); else selected.set(path, entry);
        checkbox.checked = selected.has(path);
        updateSelectionUi();
      };
      row.addEventListener("click", (e) => { if (e.target !== checkbox && e.target.closest("[data-inspect]") === null) toggle(); });
      checkbox.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    });
  }

  el.pathGoBtn.addEventListener("click", () => browsePath(el.pathInput.value.trim() || "/sdcard"));
  el.pathInput.addEventListener("keydown", (e) => { if (e.key === "Enter") browsePath(el.pathInput.value.trim() || "/sdcard"); });

  function updateSelectionUi() {
    const count = selected.size;
    el.statSelected.textContent = String(count);
    const totalBytes = [...selected.values()].reduce((sum, e) => sum + (e.sizeBytes || 0), 0);
    el.statSize.textContent = count ? formatSize(totalBytes) : "—";
    el.installBtn.textContent = fmtCount("installBtn", count);
    el.installBtn.disabled = count === 0;

    const plainApkCount = [...selected.values()].filter((e) => e.format === "apk").length;
    el.splitBundleCard.hidden = plainApkCount < 2;
  }

  // ---------- container format resolution (unit-tested pure logic) ----------

  function resolveInstallSet(allApkPaths, manifest) {
    const universal = allApkPaths.find((p) => /\/universal\.apk$/i.test(p));
    if (universal) return { paths: [universal], reason: "universal.apk found" };
    if (manifest && Array.isArray(manifest.split_apks) && manifest.split_apks.length) {
      const byBasename = {};
      allApkPaths.forEach((p) => { byBasename[p.split("/").pop()] = p; });
      const resolved = manifest.split_apks
        .map((s) => (typeof s === "string" ? s : s.file))
        .map((name) => byBasename[name])
        .filter(Boolean);
      if (resolved.length) return { paths: resolved, reason: "manifest split_apks list" };
    }
    return { paths: allApkPaths, reason: "fallback: every .apk found" };
  }

  function extractSessionId(createStdout) {
    const m = (createStdout || "").match(/\[(\d+)\]/);
    return m ? m[1] : null;
  }

  function sanitizeSplitName(path, index) {
    return "split" + index + "_" + path.split("/").pop().replace(/[^A-Za-z0-9_]/g, "_");
  }

  function buildInstallCreateCmd(opts) {
    const flags = [];
    if (opts.replace) flags.push("-r");
    if (opts.grant) flags.push("-g");
    return `pm install-create ${flags.join(" ")}`.trim();
  }

  function buildInstallWriteCmd(path, session, splitName) {
    // Streams the file's bytes through stdin instead of handing pm a raw
    // /sdcard path — system_server can't always read FUSE-mounted sdcard
    // paths directly (SELinux: "no access to read file context
    // u:object_r:fuse:s0"), but it CAN read from a pipe the shell already
    // opened. -S <size> is required whenever the source is "-" (stdin).
    return `sz=$(stat -c%s ${shq(path)}) && cat ${shq(path)} | pm install-write -S "$sz" ${session} ${shq(splitName)} -`;
  }

  function resolveObbTarget(manifest) {
    const pkg = manifest && manifest.package_name;
    return pkg ? `/sdcard/Android/obb/${pkg}` : null;
  }

  // ---------- install orchestration ----------

  function progressLog(container, text, kind) {
    container.classList.remove("hidden");
    const line = document.createElement("div");
    line.className = "progress-line" + (kind ? ` ${kind}` : "");
    line.textContent = text;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  // Session-based streaming install — used for every install (single file or
  // many), since a plain `pm install <path>` / `pm install-multiple <paths>`
  // both hit the same system_server FUSE-read restriction on /sdcard paths.
  async function streamingInstall(paths, opts, onFileProgress) {
    const createRes = await exec(buildInstallCreateCmd(opts));
    const session = extractSessionId(createRes.stdout);
    if (!createRes.ok || !session) {
      return { ok: false, stderr: "could not create install session: " + (createRes.stderr || createRes.stdout || "") };
    }
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const splitName = sanitizeSplitName(path, i);
      if (onFileProgress) onFileProgress(path);
      const writeRes = await exec(buildInstallWriteCmd(path, session, splitName));
      if (!writeRes.ok) {
        await exec(`pm install-abandon ${session}`);
        return { ok: false, stderr: `failed writing ${path.split("/").pop()}: ` + (writeRes.stderr || writeRes.stdout || "") };
      }
    }
    return exec(`pm install-commit ${session}`);
  }

  async function installPlainApk(path, opts) {
    return streamingInstall([path], opts);
  }

  async function installContainer(entry, opts) {
    if (!unzipAvailable) {
      return { ok: false, stderr: "unzip is not available on this device/ROM — extract on a PC instead and install the resulting APKs individually." };
    }
    const workDir = `${INSTALL_TMP}/${entry.name.replace(/[^A-Za-z0-9_.-]/g, "_")}-${Date.now()}`;
    await exec(`mkdir -p ${shq(workDir)}`);
    // No pipe here on purpose: piping through e.g. `| tail` would make the
    // reported exit code reflect tail's success, not unzip's, masking a
    // real extraction failure as "no .apk files found" further down.
    // -q keeps the per-file listing out of the log instead.
    const unzipRes = await exec(`unzip -o -q ${shq(entry.fullPath)} -d ${shq(workDir)} 2>&1`);
    if (!unzipRes.ok) {
      await exec(`rm -rf ${shq(workDir)}`);
      return { ok: false, stderr: "extraction failed: " + (unzipRes.stderr || unzipRes.stdout || "") };
    }

    const findRes = await exec(`find ${shq(workDir)} -iname "*.apk"`);
    const allApkPaths = (findRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (allApkPaths.length === 0) {
      await exec(`rm -rf ${shq(workDir)}`);
      return { ok: false, stderr: "no .apk files found inside this bundle" };
    }

    let manifest = null;
    if (entry.format === "xapk" || entry.format === "apkm") {
      const manifestName = entry.format === "xapk" ? "manifest.json" : "info.json";
      const manifestRes = await exec(`find ${shq(workDir)} -maxdepth 1 -iname ${shq(manifestName)} -exec cat {} \\;`);
      if (manifestRes.stdout && manifestRes.stdout.trim()) {
        try { manifest = JSON.parse(manifestRes.stdout.trim()); } catch (e) { /* proceed without it */ }
      }
    }

    const { paths, reason } = resolveInstallSet(allApkPaths, manifest);
    const installRes = await streamingInstall(paths, opts);

    if (installRes.ok) {
      const obbTarget = resolveObbTarget(manifest);
      const obbFindRes = await exec(`find ${shq(workDir)} -iname "*.obb"`);
      const obbFiles = (obbFindRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (obbFiles.length && obbTarget) {
        await exec(`mkdir -p ${shq(obbTarget)}`);
        for (const obb of obbFiles) {
          await exec(`cp ${shq(obb)} ${shq(obbTarget + "/" + obb.split("/").pop())}`);
        }
        installRes.obbNote = `${obbFiles.length} OBB file(s) copied to ${obbTarget}`;
      } else if (obbFiles.length) {
        installRes.obbNote = `${obbFiles.length} OBB file(s) found but no package name known — not copied, check the console for their paths`;
      }
    }

    await exec(`rm -rf ${shq(workDir)}`);
    installRes._reason = reason;
    return installRes;
  }

  async function appendHistory(entryLog) {
    const res = await exec(`cat ${shq(HISTORY_FILE)} 2>/dev/null`);
    let history = [];
    if (res.stdout && res.stdout.trim()) {
      try { history = JSON.parse(res.stdout.trim()); } catch (e) { history = []; }
    }
    history.unshift(entryLog);
    history = history.slice(0, 200);
    await exec(`printf '%s' ${shq(JSON.stringify(history))} > ${shq(HISTORY_FILE)}`);
  }

  async function deleteAfterInstall(paths) {
    if (!el.optDeleteAfter.checked) return;
    for (const p of paths) {
      const res = await exec(`rm -f ${shq(p)}`);
      progressLog(el.installProgress, res.ok ? `  🗑 deleted ${p.split("/").pop()}` : `  ✗ could not delete ${p.split("/").pop()}`, res.ok ? "ok" : "err");
    }
  }

  el.installBtn.addEventListener("click", async () => {
    if (selected.size === 0) return;
    const opts = { replace: el.optReplace.checked, grant: el.optGrant.checked };
    const combineApks = el.splitBundleCheck.checked && !el.splitBundleCard.hidden;
    const items = [...selected.values()];

    const scanOk = await maybeScanBefore(items);
    if (!scanOk) return;

    const ok = await confirmAction(
      "Install " + selected.size + " item(s)?",
      combineApks
        ? "The selected plain APKs will be installed together as one split-package app."
        : "Each selected file will be installed. Container formats (APKS/XAPK/APKM) are extracted first."
    );
    if (!ok) return;

    el.installBtn.disabled = true;
    el.installProgress.innerHTML = "";
    el.installProgress.classList.remove("hidden");

    const plainApks = items.filter((e) => e.format === "apk");
    const containers = items.filter((e) => e.format !== "apk");

    if (combineApks && plainApks.length >= 2) {
      progressLog(el.installProgress, `→ Combined install: ${plainApks.map((e) => e.name).join(", ")}`);
      const res = await streamingInstall(plainApks.map((e) => e.fullPath), opts);
      progressLog(el.installProgress, res.ok ? "  ✓ installed as one package" : `  ✗ failed: ${(res.stderr || res.stdout || "").slice(0, 150)}`, res.ok ? "ok" : "err");
      if (res.ok) {
        for (const e of plainApks) await maybeScanAfter(e.fullPath, e.name);
        await deleteAfterInstall(plainApks.map((e) => e.fullPath));
      }
      await appendHistory({ timestamp: new Date().toISOString(), file: plainApks.map((e) => e.name).join(" + "), format: "apk (split bundle)", result: res.ok ? "success" : "failed" });
    } else {
      for (const e of plainApks) {
        progressLog(el.installProgress, `→ ${e.name}`);
        const res = await installPlainApk(e.fullPath, opts);
        progressLog(el.installProgress, res.ok ? "  ✓ installed" : `  ✗ failed: ${(res.stderr || res.stdout || "").slice(0, 150)}`, res.ok ? "ok" : "err");
        if (res.ok) {
          await maybeScanAfter(e.fullPath, e.name);
          await deleteAfterInstall([e.fullPath]);
        }
        await appendHistory({ timestamp: new Date().toISOString(), file: e.name, format: "apk", result: res.ok ? "success" : "failed" });
      }
    }

    for (const e of containers) {
      progressLog(el.installProgress, `→ ${e.name} (${e.format})`);
      const res = await installContainer(e, opts);
      progressLog(el.installProgress, res.ok ? `  ✓ installed (${res._reason || "resolved"})` : `  ✗ failed: ${(res.stderr || "").slice(0, 150)}`, res.ok ? "ok" : "err");
      if (res.obbNote) progressLog(el.installProgress, "  ℹ " + res.obbNote);
      if (res.ok) {
        await maybeScanAfter(e.fullPath, e.name);
        await deleteAfterInstall([e.fullPath]);
      }
      await appendHistory({ timestamp: new Date().toISOString(), file: e.name, format: e.format, result: res.ok ? "success" : "failed" });
    }

    progressLog(el.installProgress, "Done.", "ok");
    selected.clear();
    renderFileList();
    updateSelectionUi();
    el.installBtn.disabled = false;
  });

  // ---------- history ----------

  async function loadHistory() {
    el.historyList.innerHTML = `<div class="empty-state">Loading…</div>`;
    const res = await exec(`cat ${shq(HISTORY_FILE)} 2>/dev/null`);
    let history = [];
    if (res.stdout && res.stdout.trim()) {
      try { history = JSON.parse(res.stdout.trim()); } catch (e) { history = []; }
    }
    if (history.length === 0) {
      el.historyList.innerHTML = `<div class="empty-state">Nothing installed through PULSE//INSTALL yet.</div>`;
      return;
    }
    el.historyList.innerHTML = history.map((h) => `
      <div class="item-row">
        <div class="item-main">
          <span class="item-name">${escapeHtml(h.file)}</span>
          <span class="item-sub">${escapeHtml(h.format)} · ${new Date(h.timestamp).toLocaleString()}</span>
        </div>
        <span class="badge ${h.result === "success" ? "ok" : "crit"}">${escapeHtml(h.result)}</span>
      </div>
    `).join("");
  }

  el.historyClearBtn.addEventListener("click", async () => {
    const ok = await confirmAction("Clear install history?", "This only clears the log — it does not uninstall anything.");
    if (!ok) return;
    await exec(`rm -f ${shq(HISTORY_FILE)}`);
    loadHistory();
  });

  // ---------- VirusTotal (hash lookup only — see README for why not upload) ----------

  const VT_KEY_STORAGE = "pulse-vt-apikey";

  (function initVt() {
    try {
      const saved = localStorage.getItem(VT_KEY_STORAGE);
      if (saved) { el.vtApiKeyInput.value = saved; el.vtRememberKey.checked = true; }
    } catch (e) { /* storage unavailable */ }
  })();
  el.vtRememberKey.addEventListener("change", () => {
    if (!el.vtRememberKey.checked) { try { localStorage.removeItem(VT_KEY_STORAGE); } catch (e) {} }
    else { try { localStorage.setItem(VT_KEY_STORAGE, el.vtApiKeyInput.value); } catch (e) {} }
  });
  el.vtApiKeyInput.addEventListener("input", () => {
    if (el.vtRememberKey.checked) { try { localStorage.setItem(VT_KEY_STORAGE, el.vtApiKeyInput.value); } catch (e) {} }
  });
  el.vtKeyToggleBtn.addEventListener("click", () => {
    const showing = el.vtApiKeyInput.type === "text";
    el.vtApiKeyInput.type = showing ? "password" : "text";
    el.vtKeyToggleBtn.textContent = showing ? "show" : "hide";
  });

  function formatVtStats(stats) {
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a, b) => a + (Number(b) || 0), 0);
    if (malicious > 0) return { label: `${malicious}/${total} engines flag this as MALICIOUS`, kind: "crit" };
    if (suspicious > 0) return { label: `${suspicious}/${total} engines flag this as suspicious`, kind: "warn" };
    return { label: `clean per ${total} engines`, kind: "ok" };
  }

  async function vtLookup(path) {
    const apiKey = el.vtApiKeyInput.value.trim();
    if (!apiKey) return { ok: false, error: "no VirusTotal API key set" };
    const hashRes = await exec(`sha256sum ${shq(path)} 2>/dev/null | cut -d' ' -f1`);
    const hash = (hashRes.stdout || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      return { ok: false, error: "could not compute SHA-256 (sha256sum may be missing on this device)" };
    }
    let res;
    try {
      res = await fetch("https://www.virustotal.com/api/v3/files/" + hash, { headers: { "x-apikey": apiKey } });
    } catch (e) {
      return { ok: false, error: "network error reaching VirusTotal: " + String(e), hash };
    }
    if (res.status === 404) return { ok: true, found: false, hash };
    if (res.status === 401) return { ok: false, error: "VirusTotal rejected the API key (401)", hash };
    if (res.status === 429) return { ok: false, error: "VirusTotal rate limit hit (429) — free keys allow 4 requests/minute", hash };
    if (!res.ok) return { ok: false, error: `VirusTotal HTTP ${res.status}`, hash };
    let data;
    try { data = await res.json(); } catch (e) { return { ok: false, error: "could not parse VirusTotal response", hash }; }
    const stats = data && data.data && data.data.attributes && data.data.attributes.last_analysis_stats;
    if (!stats) return { ok: false, error: "unexpected VirusTotal response shape", hash };
    return { ok: true, found: true, hash, stats, permalink: `https://www.virustotal.com/gui/file/${hash}` };
  }

  async function scanAndReport(path, name) {
    progressLog(el.vtProgress, `→ scanning ${name}…`);
    const result = await vtLookup(path);
    if (!result.ok) {
      progressLog(el.vtProgress, `  ✗ ${result.error}`, "err");
      return result;
    }
    if (!result.found) {
      progressLog(el.vtProgress, `  ? not in VirusTotal's database yet (${result.hash.slice(0, 12)}…) — upload manually at virustotal.com for a first scan`, "warn");
      return result;
    }
    const verdict = formatVtStats(result.stats);
    progressLog(el.vtProgress, `  ${verdict.kind === "ok" ? "✓" : "⚠"} ${verdict.label}`, verdict.kind === "crit" ? "err" : verdict.kind);
    progressLog(el.vtProgress, `  ${result.permalink}`);
    return { ...result, verdict };
  }

  async function maybeScanBefore(items) {
    if (!el.vtScanBefore.checked) return true;
    el.vtProgress.classList.remove("hidden");
    el.vtProgress.innerHTML = "";
    let anyMalicious = false;
    for (const item of items) {
      const r = await scanAndReport(item.fullPath, item.name);
      if (r.ok && r.found && r.verdict && r.verdict.kind === "crit") anyMalicious = true;
    }
    if (anyMalicious) {
      return confirmAction(
        "VirusTotal flagged malware",
        "One or more selected files are flagged as malicious by VirusTotal. Installing anyway is strongly discouraged. Continue?"
      );
    }
    return true;
  }

  async function maybeScanAfter(path, name) {
    if (!el.vtScanAfter.checked) return;
    el.vtProgress.classList.remove("hidden");
    await scanAndReport(path, name);
  }

  // ---------- auto-install folder ----------

  const AUTO_DIR = "/sdcard/pulse-install/auto";
  const AUTO_DONE_DIR = AUTO_DIR + "/installed";
  const AUTO_LOG = "/data/local/tmp/.pulse-install-auto.log";

  el.autoScanBtn.addEventListener("click", async () => {
    el.autoScanBtn.disabled = true;
    el.autoProgress.innerHTML = "";
    el.autoProgress.classList.remove("hidden");
    const opts = { replace: el.optReplace.checked, grant: el.optGrant.checked };

    await exec(`mkdir -p ${shq(AUTO_DIR)} ${shq(AUTO_DONE_DIR)}`);
    const listRes = await exec(`find ${shq(AUTO_DIR)} -maxdepth 1 -type f \\( -iname "*.apk" -o -iname "*.apks" -o -iname "*.xapk" -o -iname "*.apkm" \\)`);
    const files = (listRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);

    if (files.length === 0) {
      progressLog(el.autoProgress, "Nothing to install — the folder is empty or has no supported files.");
      el.autoScanBtn.disabled = false;
      return;
    }

    for (const path of files) {
      const name = path.split("/").pop();
      const format = detectFormat(name);
      progressLog(el.autoProgress, `→ ${name}`);
      const res = format === "apk"
        ? await installPlainApk(path, opts)
        : await installContainer({ fullPath: path, name, format }, opts);
      if (res.ok) {
        await exec(`mv ${shq(path)} ${shq(AUTO_DONE_DIR + "/" + name)}`);
        progressLog(el.autoProgress, "  ✓ installed", "ok");
      } else {
        progressLog(el.autoProgress, `  ✗ failed: ${(res.stderr || "").slice(0, 150)}`, "err");
      }
      await appendHistory({ timestamp: new Date().toISOString(), file: name, format: format || "unknown", result: res.ok ? "success" : "failed" });
    }
    progressLog(el.autoProgress, "Done.", "ok");
    el.autoScanBtn.disabled = false;
  });

  el.autoLogBtn.addEventListener("click", async () => {
    el.autoProgress.innerHTML = "";
    el.autoProgress.classList.remove("hidden");
    const res = await exec(`cat ${shq(AUTO_LOG)} 2>/dev/null`);
    const text = (res.stdout || "").trim();
    if (!text) {
      progressLog(el.autoProgress, "No boot-time auto-install activity logged yet.");
      return;
    }
    text.split("\n").forEach((line) => progressLog(el.autoProgress, line, /FAIL/.test(line) ? "err" : "ok"));
  });

  // ---------- bridge retry / init ----------

  if (el.bridgeRetryBtn) {
    el.bridgeRetryBtn.addEventListener("click", async () => {
      el.bridgeRetryBtn.disabled = true;
      el.bridgeRetryBtn.textContent = "Retrying…";
      const ok = await checkBridge();
      el.bridgeRetryBtn.disabled = false;
      el.bridgeRetryBtn.textContent = "Retry connection";
      if (ok) browsePath(currentPath);
    });
  }

  // ---------- extract an installed app ----------

  const EXTRACT_ROOT = "/sdcard/Download/pulse-extracted";
  let scannedExtractApps = []; // {pkg, versionName, versionCode}
  const extractSelected = new Set();

  function renderExtractAppList() {
    const filter = el.extractAppSearch.value.trim().toLowerCase();
    const rows = scannedExtractApps.filter((a) => !filter || a.pkg.toLowerCase().includes(filter));
    if (rows.length === 0) {
      el.extractAppList.innerHTML = `<div class="empty-state">${scannedExtractApps.length ? "No apps match your filter." : "Run a scan to list installed apps."}</div>`;
      return;
    }
    el.extractAppList.innerHTML = rows.map((a) => `
      <div class="item-row" data-pkg="${a.pkg}">
        <div class="item-main"><span class="item-name">${a.pkg}</span><span class="item-sub">v${a.versionName || "?"}</span></div>
        <input type="checkbox" ${extractSelected.has(a.pkg) ? "checked" : ""}>
      </div>
    `).join("");
    el.extractAppList.querySelectorAll(".item-row").forEach((row) => {
      const checkbox = row.querySelector("input[type=checkbox]");
      const toggle = () => {
        const pkg = row.dataset.pkg;
        if (extractSelected.has(pkg)) extractSelected.delete(pkg); else extractSelected.add(pkg);
        checkbox.checked = extractSelected.has(pkg);
        el.extractBtn.textContent = fmtCount("extractBtn", extractSelected.size);
        el.extractBtn.disabled = extractSelected.size === 0;
      };
      row.addEventListener("click", (e) => { if (e.target !== checkbox) toggle(); });
      checkbox.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    });
  }
  el.extractAppSearch.addEventListener("input", renderExtractAppList);

  el.scanExtractAppsBtn.addEventListener("click", async () => {
    el.scanExtractAppsBtn.disabled = true;
    el.scanExtractAppsBtn.textContent = "Scanning…";
    el.extractAppList.innerHTML = `<div class="empty-state">Scanning…</div>`;
    const scopeFlag = el.extractScopeUser.checked ? "-3" : "";
    const cmd = [
      `for p in $(pm list packages ${scopeFlag} | sed 's/^package://'); do`,
      `  d=$(dumpsys package "$p" 2>/dev/null)`,
      `  v=$(echo "$d" | grep -m1 "versionName=" | sed 's/^ *versionName=//')`,
      `  c=$(echo "$d" | grep -m1 "versionCode=" | awk '{print $1}' | sed 's/versionCode=//')`,
      `  printf '%s|%s|%s\\n' "$p" "$v" "$c"`,
      `done`,
    ].join("\n");
    const res = await exec(cmd);
    scannedExtractApps = (res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [pkg, versionName, versionCode] = line.split("|");
      return { pkg, versionName, versionCode };
    }).sort((a, b) => a.pkg.localeCompare(b.pkg));
    el.scanExtractAppsBtn.disabled = false;
    el.scanExtractAppsBtn.textContent = "Scan installed apps";
    renderExtractAppList();
  });

  function buildXapkManifest(app, apkFiles) {
    return {
      xapk_version: 2,
      package_name: app.pkg,
      name: app.pkg,
      version_code: app.versionCode || "",
      version_name: app.versionName || "",
      split_apks: apkFiles.map((f) => ({ file: f, id: f.replace(/\.apk$/i, "") })),
    };
  }

  el.extractBtn.addEventListener("click", async () => {
    if (extractSelected.size === 0) return;
    const format = el.extractFormat.value;
    const ok = await confirmAction(
      "Extract " + extractSelected.size + " app(s)?",
      format === "xapk"
        ? "Pulls each app's APK (and splits) and bundles them into a .xapk you can install elsewhere or re-import here."
        : "Pulls each app's APK (and splits) out as loose files."
    );
    if (!ok) return;

    el.extractBtn.disabled = true;
    el.extractProgress.innerHTML = "";
    el.extractProgress.classList.remove("hidden");
    await exec(`mkdir -p ${shq(EXTRACT_ROOT)}`);

    let zipAvailable = null;
    if (format === "xapk") {
      const zipRes = await exec("command -v zip");
      zipAvailable = !!(zipRes.ok && zipRes.stdout && zipRes.stdout.trim());
    }

    for (const pkg of extractSelected) {
      const app = scannedExtractApps.find((a) => a.pkg === pkg) || { pkg };
      progressLog(el.extractProgress, `→ ${pkg}`);
      const label = `${pkg}_${app.versionName || app.versionCode || "unknown"}`;
      const destDir = `${EXTRACT_ROOT}/${label}`;
      await exec(`mkdir -p ${shq(destDir)}`);

      const pathRes = await exec(`pm path ${shq(pkg)}`);
      const apkPaths = (pathRes.stdout || "").split("\n").map((l) => l.trim()).filter((l) => l.indexOf("package:") === 0).map((l) => l.slice("package:".length));
      if (apkPaths.length === 0) {
        progressLog(el.extractProgress, `  ✗ pm path returned nothing for ${pkg}`, "err");
        continue;
      }
      const apkFiles = [];
      const copyCmds = apkPaths.map((p) => { const name = p.split("/").pop(); apkFiles.push(name); return `cp ${shq(p)} ${shq(destDir + "/" + name)}`; });
      const copyRes = await exec(copyCmds.join("\n"));
      if (!copyRes.ok) {
        progressLog(el.extractProgress, `  ✗ copy failed`, "err");
        continue;
      }
      progressLog(el.extractProgress, `  ✓ ${apkFiles.length} APK file(s) copied to ${destDir}`, "ok");

      if (format === "xapk") {
        const manifest = buildXapkManifest(app, apkFiles);
        await exec(`printf '%s' ${shq(JSON.stringify(manifest))} > ${shq(destDir + "/manifest.json")}`);
        if (zipAvailable) {
          const xapkPath = `${EXTRACT_ROOT}/${label}.xapk`;
          const zipRes = await exec(`cd ${shq(destDir)} && zip -q -j ${shq(xapkPath)} *`);
          if (zipRes.ok) {
            progressLog(el.extractProgress, `  ✓ bundled: ${xapkPath}`, "ok");
          } else {
            progressLog(el.extractProgress, `  ✗ zip failed — files left loose in ${destDir}`, "err");
          }
        } else {
          progressLog(el.extractProgress, `  ⚠ zip not available on this device — left as loose files + manifest.json in ${destDir}`, "warn");
        }
      }
    }
    progressLog(el.extractProgress, "Done.", "ok");
    el.extractBtn.disabled = false;
  });

  // ---------- i18n (module UI only — README and code stay English) ----------
  // Covers the static chrome of this module's own WebUI. Console/progress log
  // lines and file/package names are left in English since they're mostly
  // shell output. RTL is applied automatically for Arabic.

  const LANG_KEY = "pulse-lang";
  const translations = {
    en: {
      bridgeWarning: `Shell bridge unavailable. Set this module's access mode to Full, or Custom with "WebUI shell bridge" enabled, in Shevery → ADB Modules.`,
      retryConnection: "Retry connection", productSub: "Universal APK / APKS / XAPK / APKM installer",
      checking: "checking…", lblSelected: "selected", lblTotalSize: "total size", lblUnzipTool: "unzip tool",
      tabInstall: "Install", tabInspect: "Inspect", tabAi: "AI Assistant", tabExtract: "Extract", tabHistory: "History",
      autoFolderTitle: "Auto-install folder",
      autoFolderDesc: `Drop files into <code>/sdcard/pulse-install/auto/</code> and they're installed automatically the next time Shevery starts this module's session (e.g. on boot) — or right now with the button below. Installed files move to that folder's <code>installed/</code> subfolder so nothing gets installed twice.`,
      autoScanBtn: "Scan auto-install folder now", viewLogBtn: "View log",
      browseTitle: "Browse device storage", goBtn: "Go", loading: "Loading…", fileListEmpty: "Empty directory.",
      vtTitle: "VirusTotal scan",
      vtDesc: `Checks a file's SHA-256 hash against VirusTotal's database — fast, uses almost no quota, and works for any file size, but only finds a result if <em>someone else</em> has already scanned this exact file before. It never uploads the file itself (see the README for why). Your key is stored only in this browser unless you clear it.`,
      vtKeyLabel: "VirusTotal API key", pasteKey: "paste your key…", show: "show",
      vtRemember: "Remember key on this device", vtScanBefore: "Scan selected files before install", vtScanAfter: "Scan selected files after install",
      splitTitle: "Multiple plain APKs selected",
      splitDesc: `If these are base + split APKs of <strong>one</strong> app (e.g. <code>base.apk</code> + <code>split_config.arm64_v8a.apk</code>), install them together as a single package. Otherwise, leave this off to install each one as its own separate app.`,
      splitCheck: "These are split APKs of one app — install as a single bundle",
      installOptsTitle: "Install options", optReplace: "Replace existing app if already installed (-r)",
      optGrant: "Auto-grant all runtime permissions (-g)", optDeleteAfter: "Delete file after successful install",
      installBtn: "Install selected ({n})",
      inspectTitle: "APK inspector",
      inspectDesc: `Look inside a package before installing it. Pick a file from the Install tab's browser and tap its <span class="inline-icon">🔍</span> icon, or enter a path directly below.`,
      inspectPathPlaceholder: "/sdcard/Download/app.apk", inspectBtn: "Inspect", inspectEmpty: "No file inspected yet.",
      aiTitle: "AI assistant",
      aiDesc: `Ask an AI model to look at this package's manifest data (and VirusTotal result, if available) and share an opinion — plain permissions, unusual behavior, anything worth a second look — before you install. This calls the API endpoint you configure below directly from your browser; nothing is sent anywhere else, and your key is stored only on this device unless you clear it. The AI's answer is a starting point for your own judgment, not a verdict. This also needs the module to be trusted for network access in Shevery (separate from the shell-bridge access mode) — without it, requests fail before reaching the API.`,
      aiProviderLabel: "AI provider", aiModelPresetsLabel: "Preset models…",
      aiEndpointLabel: `API endpoint (auto-filled from the provider above — edit for a custom/self-hosted one)`,
      aiEndpointPlaceholder: "https://api.anthropic.com/v1/messages", aiModelLabel: "Model name", aiModelPlaceholder: "claude-sonnet-4-6",
      aiKeyLabel: "API key", aiRemember: "Remember settings on this device",
      aiAnalyzeBtn: "Analyze last inspected APK", aiQuestionLabel: "Ask a follow-up question",
      aiQuestionPlaceholder: "e.g. why does it need SMS permission?", aiAskBtn: "Ask",
      historyTitle: "Install history", clearBtn: "Clear", historyEmpty: "Nothing installed through PULSE//INSTALL yet.",
      extractTitle: "Extract an installed app", extractScanBtn: "Scan installed apps",
      extractDesc: `Pulls an installed app's APK (and splits, if any) back out to a file — either as loose <code>.apk</code> files, or bundled into a <code>.xapk</code> you can hand to this same installer (or any XAPK-compatible one) later. This produces a functionally valid XAPK — see the README for how it compares to APKPure's own.`,
      extractFilterPlaceholder: "Filter by package name…", extractUserOnly: "User apps only", extractEmpty: "Run a scan to list installed apps.",
      outputTitle: "Output", formatLabel: "Format", formatLoose: "Loose APK files (base + splits)", formatXapk: ".xapk bundle",
      extractSavedTo: `Saved to <code>/sdcard/Download/pulse-extracted/</code>`, extractBtn: "Extract selected ({n})",
      console: "Console", confirmAction: "Confirm action", cancel: "Cancel", confirm: "Confirm",
    },
    ar: {
      bridgeWarning: `جسر الصدفة غير متاح. اضبط وضع وصول هذه الوحدة على Full، أو Custom مع تفعيل "WebUI shell bridge"، من Shevery ← ADB Modules.`,
      retryConnection: "إعادة محاولة الاتصال", productSub: "مثبّت شامل لـ APK / APKS / XAPK / APKM",
      checking: "جارٍ التحقق…", lblSelected: "محدّد", lblTotalSize: "الحجم الكلي", lblUnzipTool: "أداة unzip",
      tabInstall: "التثبيت", tabInspect: "الفحص", tabAi: "المساعد الذكي", tabExtract: "الاستخراج", tabHistory: "السجل",
      autoFolderTitle: "مجلد التثبيت التلقائي",
      autoFolderDesc: `ضع الملفات في <code>/sdcard/pulse-install/auto/</code> وسيتم تثبيتها تلقائيًا في المرة القادمة التي تبدأ فيها Shevery جلسة هذه الوحدة (مثل الإقلاع) — أو الآن عبر الزر أدناه. تنتقل الملفات المثبَّتة إلى المجلد الفرعي <code>installed/</code> حتى لا يتم تثبيت أي شيء مرتين.`,
      autoScanBtn: "فحص مجلد التثبيت التلقائي الآن", viewLogBtn: "عرض السجل",
      browseTitle: "تصفح تخزين الجهاز", goBtn: "انتقال", loading: "جارٍ التحميل…", fileListEmpty: "المجلد فارغ.",
      vtTitle: "فحص VirusTotal",
      vtDesc: `يتحقق من بصمة SHA-256 للملف مقابل قاعدة بيانات VirusTotal — سريع ولا يستهلك تقريبًا أي حصة، ويعمل مع أي حجم ملف، لكنه يجد نتيجة فقط إذا كان <em>شخص آخر</em> قد فحص هذا الملف بالضبط من قبل. لا يرفع الملف نفسه أبدًا (راجع README لمعرفة السبب). يُحفظ مفتاحك في هذا المتصفح فقط ما لم تقم بمسحه.`,
      vtKeyLabel: "مفتاح VirusTotal API", pasteKey: "الصق مفتاحك…", show: "إظهار",
      vtRemember: "تذكّر المفتاح على هذا الجهاز", vtScanBefore: "فحص الملفات المحددة قبل التثبيت", vtScanAfter: "فحص الملفات المحددة بعد التثبيت",
      splitTitle: "تم تحديد عدة ملفات APK عادية",
      splitDesc: `إذا كانت هذه ملفات base + split لتطبيق <strong>واحد</strong> (مثل <code>base.apk</code> + <code>split_config.arm64_v8a.apk</code>)، فثبّتها معًا كحزمة واحدة. وإلا اترك هذا الخيار متوقفًا لتثبيت كل منها كتطبيق منفصل.`,
      splitCheck: "هذه ملفات split لتطبيق واحد — ثبّتها كحزمة واحدة",
      installOptsTitle: "خيارات التثبيت", optReplace: "استبدال التطبيق الموجود إذا كان مثبتًا بالفعل (-r)",
      optGrant: "منح جميع أذونات وقت التشغيل تلقائيًا (-g)", optDeleteAfter: "حذف الملف بعد نجاح التثبيت",
      installBtn: "تثبيت المحدد ({n})",
      inspectTitle: "فاحص APK",
      inspectDesc: `اطّلع على محتوى الحزمة قبل تثبيتها. اختر ملفًا من متصفح تبويب التثبيت واضغط على أيقونة <span class="inline-icon">🔍</span>، أو أدخل مسارًا مباشرة أدناه.`,
      inspectPathPlaceholder: "/sdcard/Download/app.apk", inspectBtn: "فحص", inspectEmpty: "لم يتم فحص أي ملف بعد.",
      aiTitle: "المساعد الذكي",
      aiDesc: `اطلب من نموذج ذكاء اصطناعي فحص بيانات مانيفست هذه الحزمة (ونتيجة VirusTotal إن وُجدت) وإبداء رأيه — الأذونات، أي سلوك غير معتاد، أي شيء يستحق نظرة ثانية — قبل التثبيت. هذا يتصل مباشرة بنقطة النهاية التي تحددها أدناه من متصفحك؛ لا يُرسل شيء إلى أي مكان آخر، ويُحفظ مفتاحك على هذا الجهاز فقط ما لم تمسحه. إجابة الذكاء الاصطناعي نقطة انطلاق لحكمك الخاص، وليست حكمًا نهائيًا. هذا يتطلب أيضًا أن تكون الوحدة موثوقة للوصول إلى الشبكة في Shevery (بشكل منفصل عن وضع وصول shell-bridge) — بدون ذلك تفشل الطلبات قبل الوصول إلى الـ API.`,
      aiProviderLabel: "مزوّد الذكاء الاصطناعي", aiModelPresetsLabel: "نماذج جاهزة…",
      aiEndpointLabel: `نقطة نهاية API (تُملأ تلقائيًا حسب المزوّد أعلاه — يمكنك تعديلها لخادم مخصص)`,
      aiEndpointPlaceholder: "https://api.anthropic.com/v1/messages", aiModelLabel: "اسم النموذج", aiModelPlaceholder: "claude-sonnet-4-6",
      aiKeyLabel: "مفتاح API", aiRemember: "تذكّر الإعدادات على هذا الجهاز",
      aiAnalyzeBtn: "تحليل آخر APK تم فحصه", aiQuestionLabel: "اطرح سؤالًا إضافيًا",
      aiQuestionPlaceholder: "مثال: لماذا يحتاج إلى إذن الرسائل؟", aiAskBtn: "اسأل",
      historyTitle: "سجل التثبيت", clearBtn: "مسح", historyEmpty: "لم يتم تثبيت أي شيء عبر PULSE//INSTALL بعد.",
      extractTitle: "استخراج تطبيق مثبَّت", extractScanBtn: "فحص التطبيقات المثبَّتة",
      extractDesc: `يسحب ملف APK لتطبيق مثبَّت (وملفات split إن وُجدت) كملف — إما ملفات <code>.apk</code> منفصلة، أو مجمّعة في <code>.xapk</code> يمكنك تسليمه لهذا المثبّت نفسه (أو أي مثبّت يدعم XAPK) لاحقًا. هذا ينتج XAPK صالحًا وظيفيًا — راجع README لمعرفة كيف يقارَن بملف APKPure الأصلي.`,
      extractFilterPlaceholder: "تصفية حسب اسم الحزمة…", extractUserOnly: "تطبيقات المستخدم فقط", extractEmpty: "شغّل فحصًا لعرض التطبيقات المثبَّتة.",
      outputTitle: "الإخراج", formatLabel: "الصيغة", formatLoose: "ملفات APK منفصلة (base + splits)", formatXapk: "حزمة .xapk",
      extractSavedTo: `يُحفظ في <code>/sdcard/Download/pulse-extracted/</code>`, extractBtn: "استخراج المحدد ({n})",
      console: "الطرفية", confirmAction: "تأكيد الإجراء", cancel: "إلغاء", confirm: "تأكيد",
    },
    fr: {
      bridgeWarning: `Pont shell indisponible. Réglez le mode d'accès de ce module sur Full, ou Custom avec "WebUI shell bridge" activé, dans Shevery → ADB Modules.`,
      retryConnection: "Réessayer la connexion", productSub: "Installateur universel APK / APKS / XAPK / APKM",
      checking: "vérification…", lblSelected: "sélectionné(s)", lblTotalSize: "taille totale", lblUnzipTool: "outil unzip",
      tabInstall: "Installer", tabInspect: "Inspecter", tabAi: "Assistant IA", tabExtract: "Extraire", tabHistory: "Historique",
      autoFolderTitle: "Dossier d'installation automatique",
      autoFolderDesc: `Déposez des fichiers dans <code>/sdcard/pulse-install/auto/</code> et ils seront installés automatiquement au prochain démarrage de la session de ce module par Shevery (ex. au boot) — ou tout de suite avec le bouton ci-dessous. Les fichiers installés sont déplacés dans le sous-dossier <code>installed/</code> pour éviter toute double installation.`,
      autoScanBtn: "Scanner le dossier auto maintenant", viewLogBtn: "Voir le journal",
      browseTitle: "Parcourir le stockage de l'appareil", goBtn: "Go", loading: "Chargement…", fileListEmpty: "Dossier vide.",
      vtTitle: "Analyse VirusTotal",
      vtDesc: `Vérifie le hash SHA-256 d'un fichier dans la base VirusTotal — rapide, consomme très peu de quota, fonctionne pour n'importe quelle taille de fichier, mais ne trouve un résultat que si <em>quelqu'un d'autre</em> a déjà analysé ce fichier exact. Le fichier lui-même n'est jamais envoyé (voir le README). Votre clé n'est stockée que dans ce navigateur, sauf si vous l'effacez.`,
      vtKeyLabel: "Clé API VirusTotal", pasteKey: "collez votre clé…", show: "afficher",
      vtRemember: "Mémoriser la clé sur cet appareil", vtScanBefore: "Analyser les fichiers sélectionnés avant l'installation", vtScanAfter: "Analyser les fichiers sélectionnés après l'installation",
      splitTitle: "Plusieurs APK simples sélectionnés",
      splitDesc: `S'il s'agit des APK base + split d'<strong>une seule</strong> application (ex. <code>base.apk</code> + <code>split_config.arm64_v8a.apk</code>), installez-les ensemble comme un seul paquet. Sinon, laissez cette option désactivée pour installer chacun séparément.`,
      splitCheck: "Ce sont des APK split d'une seule app — installer comme un seul paquet",
      installOptsTitle: "Options d'installation", optReplace: "Remplacer l'application existante si déjà installée (-r)",
      optGrant: "Accorder automatiquement toutes les permissions runtime (-g)", optDeleteAfter: "Supprimer le fichier après installation réussie",
      installBtn: "Installer la sélection ({n})",
      inspectTitle: "Inspecteur d'APK",
      inspectDesc: `Regardez l'intérieur d'un paquet avant de l'installer. Choisissez un fichier dans le navigateur de l'onglet Installer et touchez son icône <span class="inline-icon">🔍</span>, ou saisissez un chemin ci-dessous.`,
      inspectPathPlaceholder: "/sdcard/Download/app.apk", inspectBtn: "Inspecter", inspectEmpty: "Aucun fichier inspecté pour l'instant.",
      aiTitle: "Assistant IA",
      aiDesc: `Demandez à un modèle d'IA d'examiner les données du manifeste de ce paquet (et le résultat VirusTotal, si disponible) et de donner son avis — permissions, comportement inhabituel, tout ce qui mérite un second regard — avant l'installation. Ceci appelle directement, depuis votre navigateur, l'API que vous configurez ci-dessous ; rien n'est envoyé ailleurs, et votre clé n'est stockée que sur cet appareil sauf si vous l'effacez. La réponse de l'IA est un point de départ pour votre propre jugement, pas un verdict. Cela nécessite aussi que le module soit approuvé pour l'accès réseau dans Shevery (séparément du mode d'accès shell-bridge) — sans quoi les requêtes échouent avant d'atteindre l'API.`,
      aiProviderLabel: "Fournisseur d'IA", aiModelPresetsLabel: "Modèles prédéfinis…",
      aiEndpointLabel: `Endpoint API (rempli automatiquement selon le fournisseur ci-dessus — modifiable pour un serveur personnalisé)`,
      aiEndpointPlaceholder: "https://api.anthropic.com/v1/messages", aiModelLabel: "Nom du modèle", aiModelPlaceholder: "claude-sonnet-4-6",
      aiKeyLabel: "Clé API", aiRemember: "Mémoriser les réglages sur cet appareil",
      aiAnalyzeBtn: "Analyser le dernier APK inspecté", aiQuestionLabel: "Poser une question complémentaire",
      aiQuestionPlaceholder: "ex. pourquoi a-t-il besoin de la permission SMS ?", aiAskBtn: "Demander",
      historyTitle: "Historique d'installation", clearBtn: "Effacer", historyEmpty: "Rien n'a encore été installé via PULSE//INSTALL.",
      extractTitle: "Extraire une application installée", extractScanBtn: "Scanner les applications installées",
      extractDesc: `Récupère l'APK d'une application installée (et ses splits, le cas échéant) sous forme de fichier — soit des fichiers <code>.apk</code> séparés, soit regroupés dans un <code>.xapk</code> que vous pourrez réinstaller ici (ou dans tout installateur compatible XAPK) plus tard. Cela produit un XAPK fonctionnellement valide — voir le README pour la comparaison avec celui d'APKPure.`,
      extractFilterPlaceholder: "Filtrer par nom de paquet…", extractUserOnly: "Applications utilisateur uniquement", extractEmpty: "Lancez un scan pour lister les applications installées.",
      outputTitle: "Sortie", formatLabel: "Format", formatLoose: "Fichiers APK séparés (base + splits)", formatXapk: "Bundle .xapk",
      extractSavedTo: `Enregistré dans <code>/sdcard/Download/pulse-extracted/</code>`, extractBtn: "Extraire la sélection ({n})",
      console: "Console", confirmAction: "Confirmer l'action", cancel: "Annuler", confirm: "Confirmer",
    },
    es: {
      bridgeWarning: `Puente de shell no disponible. Configura el modo de acceso de este módulo en Full, o Custom con "WebUI shell bridge" activado, en Shevery → ADB Modules.`,
      retryConnection: "Reintentar conexión", productSub: "Instalador universal de APK / APKS / XAPK / APKM",
      checking: "comprobando…", lblSelected: "seleccionado(s)", lblTotalSize: "tamaño total", lblUnzipTool: "herramienta unzip",
      tabInstall: "Instalar", tabInspect: "Inspeccionar", tabAi: "Asistente IA", tabExtract: "Extraer", tabHistory: "Historial",
      autoFolderTitle: "Carpeta de instalación automática",
      autoFolderDesc: `Coloca archivos en <code>/sdcard/pulse-install/auto/</code> y se instalarán automáticamente la próxima vez que Shevery inicie la sesión de este módulo (p. ej. al arrancar) — o ahora mismo con el botón de abajo. Los archivos instalados se mueven a la subcarpeta <code>installed/</code> para que nada se instale dos veces.`,
      autoScanBtn: "Escanear carpeta automática ahora", viewLogBtn: "Ver registro",
      browseTitle: "Explorar almacenamiento del dispositivo", goBtn: "Ir", loading: "Cargando…", fileListEmpty: "Carpeta vacía.",
      vtTitle: "Análisis de VirusTotal",
      vtDesc: `Comprueba el hash SHA-256 de un archivo en la base de datos de VirusTotal — rápido, apenas consume cuota y funciona con cualquier tamaño de archivo, pero solo encuentra un resultado si <em>otra persona</em> ya ha escaneado exactamente este archivo antes. Nunca sube el archivo en sí (ver el README). Tu clave se guarda solo en este navegador a menos que la borres.`,
      vtKeyLabel: "Clave API de VirusTotal", pasteKey: "pega tu clave…", show: "mostrar",
      vtRemember: "Recordar la clave en este dispositivo", vtScanBefore: "Escanear archivos seleccionados antes de instalar", vtScanAfter: "Escanear archivos seleccionados después de instalar",
      splitTitle: "Varios APK simples seleccionados",
      splitDesc: `Si son APK base + split de <strong>una sola</strong> app (p. ej. <code>base.apk</code> + <code>split_config.arm64_v8a.apk</code>), instálalos juntos como un solo paquete. Si no, deja esto desactivado para instalar cada uno como app independiente.`,
      splitCheck: "Son APK split de una sola app — instalar como un único paquete",
      installOptsTitle: "Opciones de instalación", optReplace: "Reemplazar la app existente si ya está instalada (-r)",
      optGrant: "Conceder automáticamente todos los permisos en tiempo de ejecución (-g)", optDeleteAfter: "Eliminar el archivo tras una instalación exitosa",
      installBtn: "Instalar selección ({n})",
      inspectTitle: "Inspector de APK",
      inspectDesc: `Mira dentro de un paquete antes de instalarlo. Elige un archivo en el explorador de la pestaña Instalar y toca su icono <span class="inline-icon">🔍</span>, o introduce una ruta directamente abajo.`,
      inspectPathPlaceholder: "/sdcard/Download/app.apk", inspectBtn: "Inspeccionar", inspectEmpty: "Todavía no se ha inspeccionado ningún archivo.",
      aiTitle: "Asistente de IA",
      aiDesc: `Pide a un modelo de IA que revise los datos del manifiesto de este paquete (y el resultado de VirusTotal, si lo hay) y dé su opinión — permisos, comportamiento inusual, cualquier cosa que merezca una segunda mirada — antes de instalar. Esto llama directamente, desde tu navegador, al endpoint de API que configures abajo; nada se envía a ningún otro sitio, y tu clave se guarda solo en este dispositivo a menos que la borres. La respuesta de la IA es un punto de partida para tu propio juicio, no un veredicto. Esto también requiere que el módulo esté autorizado para el acceso a red en Shevery (por separado del modo de acceso shell-bridge) — sin eso, las solicitudes fallan antes de llegar a la API.`,
      aiProviderLabel: "Proveedor de IA", aiModelPresetsLabel: "Modelos predefinidos…",
      aiEndpointLabel: `Endpoint de API (autocompletado según el proveedor de arriba — editable para uno personalizado)`,
      aiEndpointPlaceholder: "https://api.anthropic.com/v1/messages", aiModelLabel: "Nombre del modelo", aiModelPlaceholder: "claude-sonnet-4-6",
      aiKeyLabel: "Clave API", aiRemember: "Recordar ajustes en este dispositivo",
      aiAnalyzeBtn: "Analizar el último APK inspeccionado", aiQuestionLabel: "Hacer una pregunta adicional",
      aiQuestionPlaceholder: "p. ej. ¿por qué necesita permiso de SMS?", aiAskBtn: "Preguntar",
      historyTitle: "Historial de instalación", clearBtn: "Borrar", historyEmpty: "Aún no se ha instalado nada a través de PULSE//INSTALL.",
      extractTitle: "Extraer una app instalada", extractScanBtn: "Escanear apps instaladas",
      extractDesc: `Extrae el APK de una app instalada (y sus splits, si los hay) como archivo — ya sea como archivos <code>.apk</code> sueltos, o empaquetados en un <code>.xapk</code> que puedes usar en este mismo instalador (o cualquiera compatible con XAPK) más tarde. Esto produce un XAPK funcionalmente válido — ver el README para la comparación con el de APKPure.`,
      extractFilterPlaceholder: "Filtrar por nombre de paquete…", extractUserOnly: "Solo apps de usuario", extractEmpty: "Ejecuta un escaneo para listar las apps instaladas.",
      outputTitle: "Salida", formatLabel: "Formato", formatLoose: "Archivos APK sueltos (base + splits)", formatXapk: "Paquete .xapk",
      extractSavedTo: `Guardado en <code>/sdcard/Download/pulse-extracted/</code>`, extractBtn: "Extraer selección ({n})",
      console: "Consola", confirmAction: "Confirmar acción", cancel: "Cancelar", confirm: "Confirmar",
    },
    de: {
      bridgeWarning: `Shell-Bridge nicht verfügbar. Stelle den Zugriffsmodus dieses Moduls in Shevery → ADB Modules auf Full, oder auf Custom mit aktiviertem "WebUI shell bridge".`,
      retryConnection: "Verbindung erneut versuchen", productSub: "Universeller APK / APKS / XAPK / APKM-Installer",
      checking: "prüfe…", lblSelected: "ausgewählt", lblTotalSize: "Gesamtgröße", lblUnzipTool: "unzip-Tool",
      tabInstall: "Installieren", tabInspect: "Prüfen", tabAi: "KI-Assistent", tabExtract: "Extrahieren", tabHistory: "Verlauf",
      autoFolderTitle: "Auto-Installationsordner",
      autoFolderDesc: `Lege Dateien in <code>/sdcard/pulse-install/auto/</code> ab, und sie werden automatisch installiert, sobald Shevery diese Modul-Sitzung das nächste Mal startet (z. B. beim Booten) — oder sofort über den Button unten. Installierte Dateien werden in den Unterordner <code>installed/</code> verschoben, damit nichts doppelt installiert wird.`,
      autoScanBtn: "Auto-Ordner jetzt scannen", viewLogBtn: "Protokoll ansehen",
      browseTitle: "Gerätespeicher durchsuchen", goBtn: "Los", loading: "Lädt…", fileListEmpty: "Ordner ist leer.",
      vtTitle: "VirusTotal-Scan",
      vtDesc: `Prüft den SHA-256-Hash einer Datei gegen die VirusTotal-Datenbank — schnell, verbraucht kaum Kontingent und funktioniert bei jeder Dateigröße, findet aber nur ein Ergebnis, wenn <em>jemand anderes</em> genau diese Datei bereits gescannt hat. Die Datei selbst wird nie hochgeladen (siehe README). Dein Schlüssel wird nur in diesem Browser gespeichert, sofern du ihn nicht löschst.`,
      vtKeyLabel: "VirusTotal-API-Schlüssel", pasteKey: "Schlüssel einfügen…", show: "anzeigen",
      vtRemember: "Schlüssel auf diesem Gerät merken", vtScanBefore: "Ausgewählte Dateien vor der Installation scannen", vtScanAfter: "Ausgewählte Dateien nach der Installation scannen",
      splitTitle: "Mehrere normale APKs ausgewählt",
      splitDesc: `Wenn dies Base- + Split-APKs <strong>einer</strong> App sind (z. B. <code>base.apk</code> + <code>split_config.arm64_v8a.apk</code>), installiere sie zusammen als ein Paket. Andernfalls lass dies deaktiviert, um jede als eigene App zu installieren.`,
      splitCheck: "Dies sind Split-APKs einer App — als ein Paket installieren",
      installOptsTitle: "Installationsoptionen", optReplace: "Vorhandene App ersetzen, falls bereits installiert (-r)",
      optGrant: "Alle Laufzeitberechtigungen automatisch erteilen (-g)", optDeleteAfter: "Datei nach erfolgreicher Installation löschen",
      installBtn: "Auswahl installieren ({n})",
      inspectTitle: "APK-Inspektor",
      inspectDesc: `Schau dir ein Paket an, bevor du es installierst. Wähle eine Datei im Browser des Installieren-Tabs und tippe auf ihr <span class="inline-icon">🔍</span>-Symbol, oder gib unten direkt einen Pfad ein.`,
      inspectPathPlaceholder: "/sdcard/Download/app.apk", inspectBtn: "Prüfen", inspectEmpty: "Noch keine Datei geprüft.",
      aiTitle: "KI-Assistent",
      aiDesc: `Lass ein KI-Modell die Manifestdaten dieses Pakets (und das VirusTotal-Ergebnis, falls vorhanden) ansehen und eine Einschätzung abgeben — Berechtigungen, ungewöhnliches Verhalten, alles, was einen zweiten Blick verdient — bevor du installierst. Dies ruft direkt aus deinem Browser den unten konfigurierten API-Endpunkt auf; nichts wird sonst irgendwohin gesendet, und dein Schlüssel wird nur auf diesem Gerät gespeichert, sofern du ihn nicht löschst. Die Antwort der KI ist ein Ausgangspunkt für dein eigenes Urteil, kein Urteilsspruch. Dafür muss dem Modul in Shevery außerdem der Netzwerkzugriff erlaubt werden (getrennt vom Shell-Bridge-Zugriffsmodus) — sonst schlagen Anfragen fehl, bevor sie die API erreichen.`,
      aiProviderLabel: "KI-Anbieter", aiModelPresetsLabel: "Vorgabemodelle…",
      aiEndpointLabel: `API-Endpunkt (wird anhand des obigen Anbieters ausgefüllt — für einen eigenen Endpunkt änderbar)`,
      aiEndpointPlaceholder: "https://api.anthropic.com/v1/messages", aiModelLabel: "Modellname", aiModelPlaceholder: "claude-sonnet-4-6",
      aiKeyLabel: "API-Schlüssel", aiRemember: "Einstellungen auf diesem Gerät merken",
      aiAnalyzeBtn: "Zuletzt geprüftes APK analysieren", aiQuestionLabel: "Eine Zusatzfrage stellen",
      aiQuestionPlaceholder: "z. B. warum braucht es SMS-Berechtigung?", aiAskBtn: "Fragen",
      historyTitle: "Installationsverlauf", clearBtn: "Leeren", historyEmpty: "Über PULSE//INSTALL wurde noch nichts installiert.",
      extractTitle: "Eine installierte App extrahieren", extractScanBtn: "Installierte Apps scannen",
      extractDesc: `Zieht die APK einer installierten App (und ggf. deren Splits) als Datei heraus — entweder als lose <code>.apk</code>-Dateien oder gebündelt in eine <code>.xapk</code>, die du später wieder in diesen Installer (oder jeden XAPK-fähigen) laden kannst. Das erzeugt eine funktional gültige XAPK — siehe README für den Vergleich mit der von APKPure.`,
      extractFilterPlaceholder: "Nach Paketname filtern…", extractUserOnly: "Nur Benutzer-Apps", extractEmpty: "Starte einen Scan, um installierte Apps aufzulisten.",
      outputTitle: "Ausgabe", formatLabel: "Format", formatLoose: "Lose APK-Dateien (Base + Splits)", formatXapk: ".xapk-Bundle",
      extractSavedTo: `Gespeichert unter <code>/sdcard/Download/pulse-extracted/</code>`, extractBtn: "Auswahl extrahieren ({n})",
      console: "Konsole", confirmAction: "Aktion bestätigen", cancel: "Abbrechen", confirm: "Bestätigen",
    },
  };

  let currentLang = "en";
  let lastInstallCount = 0;
  let lastExtractCount = 0;

  function t(key) {
    const dict = translations[currentLang] || translations.en;
    return dict[key] !== undefined ? dict[key] : (translations.en[key] || key);
  }

  function fmtCount(key, n) {
    if (key === "installBtn") lastInstallCount = n;
    if (key === "extractBtn") lastExtractCount = n;
    return t(key).replace("{n}", n);
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((elm) => {
      elm.innerHTML = t(elm.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((elm) => {
      elm.setAttribute("placeholder", t(elm.getAttribute("data-i18n-placeholder")));
    });
    scope.querySelectorAll("[data-i18n-count]").forEach((elm) => {
      const key = elm.getAttribute("data-i18n-count");
      const n = key === "installBtn" ? lastInstallCount : lastExtractCount;
      elm.textContent = fmtCount(key, n);
    });
  }

  function setLang(lang) {
    currentLang = translations[lang] ? lang : "en";
    document.documentElement.setAttribute("lang", currentLang === "en" ? "en" : currentLang);
    document.documentElement.setAttribute("dir", currentLang === "ar" ? "rtl" : "ltr");
    applyI18n(document);
    try { localStorage.setItem(LANG_KEY, currentLang); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Generic themed dropdown registry (shared by lang / AI provider / AI model) ----------

  const allDropdowns = [];
  function registerDropdown(container, btn, menu) {
    function close() { menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); }
    function open() {
      allDropdowns.forEach((d) => { if (d.menu !== menu) d.close(); });
      menu.classList.remove("hidden"); btn.setAttribute("aria-expanded", "true");
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.classList.contains("hidden")) open(); else close();
    });
    allDropdowns.push({ container, menu, close });
    return { open, close };
  }
  document.addEventListener("click", (e) => {
    allDropdowns.forEach((d) => { if (!d.container.contains(e.target)) d.close(); });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") allDropdowns.forEach((d) => d.close()); });

  if (el.langDropdownBtn) {
    const langLabels = { en: "EN", ar: "AR", fr: "FR", es: "ES", de: "DE" };
    const langDd = registerDropdown(el.langDropdown, el.langDropdownBtn, el.langDropdownMenu);
    el.langDropdownMenu.querySelectorAll(".lang-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const lang = opt.dataset.lang;
        el.langDropdownMenu.querySelectorAll(".lang-option").forEach((o) => {
          o.classList.toggle("active", o === opt);
          o.setAttribute("aria-selected", o === opt ? "true" : "false");
        });
        el.langDropdownCurrent.textContent = langLabels[lang] || lang.toUpperCase();
        langDd.close();
        setLang(lang);
      });
    });

    let savedLang = "en";
    try { savedLang = localStorage.getItem(LANG_KEY) || "en"; } catch (e) { /* storage unavailable */ }
    el.langDropdownMenu.querySelectorAll(".lang-option").forEach((o) => {
      const isMatch = o.dataset.lang === savedLang;
      o.classList.toggle("active", isMatch);
      o.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
    el.langDropdownCurrent.textContent = langLabels[savedLang] || "EN";
    setLang(savedLang);
  }

  // ---------- Inspect tab: read manifest / metadata before install ----------

  const DANGEROUS_PERMS = [
    "READ_SMS", "SEND_SMS", "RECEIVE_SMS", "CALL_PHONE", "READ_CALL_LOG", "WRITE_CALL_LOG",
    "PROCESS_OUTGOING_CALLS", "READ_CONTACTS", "WRITE_CONTACTS", "ACCESS_FINE_LOCATION",
    "ACCESS_BACKGROUND_LOCATION", "RECORD_AUDIO", "CAMERA", "READ_EXTERNAL_STORAGE",
    "WRITE_EXTERNAL_STORAGE", "MANAGE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW",
    "BIND_ACCESSIBILITY_SERVICE", "BIND_DEVICE_ADMIN", "REQUEST_INSTALL_PACKAGES",
    "PACKAGE_USAGE_STATS", "READ_PHONE_STATE", "READ_PHONE_NUMBERS", "ANSWER_PHONE_CALLS",
    "BODY_SENSORS", "GET_ACCOUNTS", "BIND_NOTIFICATION_LISTENER_SERVICE",
  ];

  let lastInspection = null; // { path, name, format, data, containerManifest }

  // ---------- Pure-JS AndroidManifest.xml (binary AXML) parser ----------
  // No external tool needed — aapt/aapt2 are SDK build-tools, not something a
  // real Android device ships, so relying on them would leave this tab dead
  // for almost everyone. We only need `unzip`, which the module already
  // requires for containers, to pull the raw manifest bytes out as base64.

  function parseAxmlStringPool(view, bytes, chunkStart) {
    const size = view.getUint32(chunkStart + 4, true);
    const stringCount = view.getUint32(chunkStart + 8, true);
    const flags = view.getUint32(chunkStart + 16, true);
    const stringsStart = view.getUint32(chunkStart + 20, true);
    const isUtf8 = (flags & 0x100) !== 0;
    const offsets = [];
    for (let i = 0; i < stringCount; i++) offsets.push(view.getUint32(chunkStart + 28 + i * 4, true));
    const dataStart = chunkStart + stringsStart;
    const strings = [];
    for (let i = 0; i < stringCount; i++) {
      let pos = dataStart + offsets[i];
      if (isUtf8) {
        let b = bytes[pos];
        pos += (b & 0x80) ? 2 : 1; // skip utf16 char-count prefix
        b = bytes[pos];
        let byteLen;
        if (b & 0x80) { byteLen = ((b & 0x7f) << 8) | bytes[pos + 1]; pos += 2; }
        else { byteLen = b; pos += 1; }
        strings.push(new TextDecoder("utf-8").decode(bytes.subarray(pos, pos + byteLen)));
      } else {
        let lenUnit = view.getUint16(pos, true);
        let len;
        if (lenUnit & 0x8000) { len = ((lenUnit & 0x7fff) << 16) | view.getUint16(pos + 2, true); pos += 4; }
        else { len = lenUnit; pos += 2; }
        let s = "";
        for (let k = 0; k < len; k++) s += String.fromCharCode(view.getUint16(pos + k * 2, true));
        strings.push(s);
      }
    }
    return { strings, end: chunkStart + size };
  }

  function parseManifestAxml(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const totalSize = bytes.length;
    let pos = 8; // skip the top-level RES_XML_TYPE chunk header
    let stringPool = [];
    const result = { permissions: [] };
    const tagStack = [];
    let inIntentFilter = false, sawMain = false, sawLauncher = false, launchableCount = 0;

    function attrVal(a) {
      if (a.rawValueIdx >= 0) return stringPool[a.rawValueIdx];
      if (a.dataType === 3) return stringPool[a.data];
      if (a.dataType === 0x12) return a.data !== 0;
      if (a.dataType === 0x11) return "0x" + a.data.toString(16);
      return a.data;
    }
    function findAttr(attrs, name) { return attrs.find((a) => stringPool[a.nameIdx] === name); }

    while (pos + 8 <= totalSize) {
      const chunkType = view.getUint16(pos, true);
      const headerSize = view.getUint16(pos + 2, true);
      const chunkSize = view.getUint32(pos + 4, true);
      if (!chunkSize || chunkSize < 8) break;

      if (chunkType === 0x0001) {
        const r = parseAxmlStringPool(view, bytes, pos);
        stringPool = r.strings; pos = r.end; continue;
      }
      if (chunkType === 0x0102) { // start element
        const structStart = pos + headerSize;
        const nameIdx = view.getInt32(structStart + 4, true);
        const attributeStart = view.getUint16(structStart + 8, true);
        const attributeSize = view.getUint16(structStart + 10, true);
        const attributeCount = view.getUint16(structStart + 12, true);
        const attrsBase = structStart + attributeStart;
        const attrs = [];
        for (let i = 0; i < attributeCount; i++) {
          const q = attrsBase + i * attributeSize;
          const nameIdxA = view.getInt32(q + 4, true);
          const rawValueIdx = view.getInt32(q + 8, true);
          const dataType = bytes[q + 15];
          const data = view.getUint32(q + 16, true);
          attrs.push({ nameIdx: nameIdxA, rawValueIdx, dataType, data });
        }
        const tag = stringPool[nameIdx] || "";
        tagStack.push(tag);
        if (tag === "manifest") {
          const pkg = findAttr(attrs, "package"), vc = findAttr(attrs, "versionCode"), vn = findAttr(attrs, "versionName");
          if (pkg) result.package = String(attrVal(pkg));
          if (vc) result.versionCode = String(attrVal(vc));
          if (vn) result.versionName = String(attrVal(vn));
        } else if (tag === "uses-sdk") {
          const mn = findAttr(attrs, "minSdkVersion"), tg = findAttr(attrs, "targetSdkVersion");
          if (mn) result.minSdk = String(attrVal(mn));
          if (tg) result.targetSdk = String(attrVal(tg));
        } else if (tag === "uses-permission" || tag === "uses-permission-sdk-23") {
          const nm = findAttr(attrs, "name");
          if (nm) result.permissions.push(String(attrVal(nm)));
        } else if (tag === "application") {
          const lbl = findAttr(attrs, "label");
          if (lbl && typeof attrVal(lbl) === "string") result.label = attrVal(lbl);
        } else if (tag === "intent-filter") {
          inIntentFilter = true; sawMain = false; sawLauncher = false;
        } else if (tag === "action" && inIntentFilter) {
          const nm = findAttr(attrs, "name");
          if (nm && attrVal(nm) === "android.intent.action.MAIN") sawMain = true;
        } else if (tag === "category" && inIntentFilter) {
          const nm = findAttr(attrs, "name");
          if (nm && attrVal(nm) === "android.intent.category.LAUNCHER") sawLauncher = true;
        }
        pos += chunkSize; continue;
      }
      if (chunkType === 0x0103) { // end element
        const tag = tagStack.pop();
        if (tag === "intent-filter") {
          if (sawMain && sawLauncher) launchableCount++;
          inIntentFilter = false;
        }
        pos += chunkSize; continue;
      }
      pos += chunkSize; // string pool skipped above; everything else just steps over
    }
    result.activities = launchableCount;
    return result;
  }

  async function readManifestBytes(apkPath) {
    const res = await exec(`unzip -p ${shq(apkPath)} AndroidManifest.xml 2>/dev/null | base64`);
    if (!res.ok || !res.stdout) return null;
    const b64 = res.stdout.replace(/\s+/g, "");
    if (!b64) return null;
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (e) { return null; }
  }

  async function readNativeAbis(apkPath) {
    const res = await exec(`unzip -l ${shq(apkPath)} 2>/dev/null | sed -n 's#.*[[:space:]]lib/\\([^/]*\\)/.*#\\1#p' | sort -u`);
    const abis = (res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
    return abis.length ? abis.join(", ") : null;
  }

  function permBadge(permName) {
    const short = permName.replace(/^android\.permission\./, "");
    const dangerous = DANGEROUS_PERMS.includes(short);
    return `<div class="perm-row ${dangerous ? "dangerous" : "normal"}">${dangerous ? "⚠ " : ""}${escapeHtml(permName)}</div>`;
  }

  function renderInspectResult(name, data, extra) {
    const rows = [];
    rows.push(`<div class="inspect-kv">`);
    rows.push(`<div class="inspect-row"><span class="k">File</span><span class="v">${escapeHtml(name)}</span></div>`);
    if (data.package) rows.push(`<div class="inspect-row"><span class="k">Package</span><span class="v">${escapeHtml(data.package)}</span></div>`);
    if (data.label) rows.push(`<div class="inspect-row"><span class="k">App label</span><span class="v">${escapeHtml(data.label)}</span></div>`);
    if (data.versionName) rows.push(`<div class="inspect-row"><span class="k">Version</span><span class="v">${escapeHtml(data.versionName)} (${escapeHtml(data.versionCode || "?")})</span></div>`);
    if (data.minSdk) rows.push(`<div class="inspect-row"><span class="k">Min / target SDK</span><span class="v">${escapeHtml(data.minSdk)} / ${escapeHtml(data.targetSdk || "?")}</span></div>`);
    if (data.native) rows.push(`<div class="inspect-row"><span class="k">Native ABIs</span><span class="v">${escapeHtml(data.native)}</span></div>`);
    if (Number.isFinite(data.activities)) rows.push(`<div class="inspect-row"><span class="k">Launchable activities</span><span class="v">${data.activities}</span></div>`);
    if (extra && extra.sha256) rows.push(`<div class="inspect-row"><span class="k">SHA-256</span><span class="v">${escapeHtml(extra.sha256)}</span></div>`);
    if (extra && extra.sizeLabel) rows.push(`<div class="inspect-row"><span class="k">Size</span><span class="v">${escapeHtml(extra.sizeLabel)}</span></div>`);
    rows.push(`</div>`);
    const dangerCount = (data.permissions || []).filter((p) => DANGEROUS_PERMS.includes(p.replace(/^android\.permission\./, ""))).length;
    rows.push(`<div class="inspect-section-title">Permissions (${(data.permissions || []).length}${dangerCount ? `, ${dangerCount} sensitive` : ""})</div>`);
    if (data.permissions && data.permissions.length) {
      rows.push(`<div class="perm-list">${data.permissions.map(permBadge).join("")}</div>`);
    } else {
      rows.push(`<div class="empty-state">None declared, or unreadable on this device.</div>`);
    }
    if (extra && extra.containerManifest) {
      rows.push(`<div class="inspect-section-title">Bundle manifest (${escapeHtml(extra.containerManifestName)})</div>`);
      rows.push(`<pre class="progress-box" style="max-height:200px;">${escapeHtml(JSON.stringify(extra.containerManifest, null, 2))}</pre>`);
    }
    if (extra && extra.note) rows.push(`<div class="empty-state">${escapeHtml(extra.note)}</div>`);
    el.inspectResult.innerHTML = rows.join("");
  }

  async function inspectPath(path) {
    el.inspectResult.innerHTML = `<div class="empty-state">Inspecting…</div>`;
    const name = path.split("/").pop();
    const format = detectFormat(name);
    if (!format) {
      el.inspectResult.innerHTML = `<div class="empty-state">Not a recognized APK/APKS/XAPK/APKM file.</div>`;
      return;
    }
    const shaRes = await exec(`sha256sum ${shq(path)} 2>/dev/null | cut -d' ' -f1`);
    const sizeRes = await exec(`stat -c%s ${shq(path)} 2>/dev/null`);
    const extra = {
      sha256: (shaRes.stdout || "").trim() || null,
      sizeLabel: formatSize(parseInt((sizeRes.stdout || "").trim(), 10)),
    };

    let apkForManifest = path;
    let containerManifest = null;
    let containerManifestName = null;
    let workDir = null;

    if (format !== "apk") {
      if (!unzipAvailable) {
        renderInspectResult(name, {}, { ...extra, note: "unzip is not available on this device, so this bundle can't be opened to find the base APK for manifest parsing." });
        return;
      }
      workDir = `${INSTALL_TMP}/inspect-${Date.now()}`;
      await exec(`mkdir -p ${shq(workDir)}`);
      await exec(`unzip -o -q ${shq(path)} -d ${shq(workDir)} 2>&1`);
      const findRes = await exec(`find ${shq(workDir)} -iname "*.apk"`);
      const apks = (findRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
      const base = apks.find((p) => /base\.apk$/i.test(p)) || apks[0];
      if (!base) {
        await exec(`rm -rf ${shq(workDir)}`);
        renderInspectResult(name, {}, { ...extra, note: "No .apk found inside this bundle." });
        return;
      }
      apkForManifest = base;
      const manifestName = format === "xapk" ? "manifest.json" : "info.json";
      const manifestRes = await exec(`find ${shq(workDir)} -maxdepth 1 -iname ${shq(manifestName)} -exec cat {} \\;`);
      if (manifestRes.stdout && manifestRes.stdout.trim()) {
        try { containerManifest = JSON.parse(manifestRes.stdout.trim()); containerManifestName = manifestName; } catch (e) { /* skip */ }
      }
    }

    if (!unzipAvailable) {
      renderInspectResult(name, {}, { ...extra, containerManifest, containerManifestName, note: "unzip is not available on this device, so the manifest can't be read out of this APK." });
      return;
    }
    const manifestBytes = await readManifestBytes(apkForManifest);
    const nativeAbis = await readNativeAbis(apkForManifest);
    if (workDir) await exec(`rm -rf ${shq(workDir)}`);
    if (!manifestBytes) {
      renderInspectResult(name, {}, { ...extra, containerManifest, containerManifestName, note: "Could not read AndroidManifest.xml out of this file." });
      return;
    }
    let data;
    try { data = parseManifestAxml(manifestBytes); }
    catch (e) {
      renderInspectResult(name, {}, { ...extra, containerManifest, containerManifestName, note: "Could not parse this manifest (unrecognized/corrupt binary XML)." });
      return;
    }
    if (nativeAbis) data.native = nativeAbis;
    lastInspection = { path, name, format, data, containerManifest, containerManifestName, extra };
    renderInspectResult(name, data, { ...extra, containerManifest, containerManifestName });
  }

  if (el.inspectGoBtn) {
    el.inspectGoBtn.addEventListener("click", () => {
      const p = el.inspectPathInput.value.trim();
      if (p) inspectPath(p);
    });
  }

  // ---------- AI tab: ask a user-supplied model about the inspected APK ----------

  const AI_STORAGE = "pulse-ai-settings";

  const AI_PROVIDERS = {
    anthropic: {
      label: "Anthropic (Claude)",
      endpointTemplate: "https://api.anthropic.com/v1/messages",
      models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-6"],
      buildRequest(endpoint, model, apiKey, prompt) {
        return {
          url: endpoint,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
        };
      },
      parseResponse(data) {
        if (Array.isArray(data.content)) return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        return null;
      },
    },
    openai: {
      label: "OpenAI (or compatible)",
      endpointTemplate: "https://api.openai.com/v1/chat/completions",
      models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
      buildRequest(endpoint, model, apiKey, prompt) {
        return {
          url: endpoint,
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
        };
      },
      parseResponse(data) {
        return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
      },
    },
    gemini: {
      label: "Google Gemini",
      endpointTemplate: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
      buildRequest(endpoint, model, apiKey, prompt) {
        const url = endpoint.replace("{model}", encodeURIComponent(model));
        return {
          url,
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        };
      },
      parseResponse(data) {
        return data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
          ? data.candidates[0].content.parts.map((p) => p.text).filter(Boolean).join("\n") : null;
      },
    },
  };

  let currentAiProvider = "anthropic";

  function selectAiProvider(key, opts) {
    const provider = AI_PROVIDERS[key];
    if (!provider) return;
    currentAiProvider = key;
    el.aiProviderMenu.querySelectorAll(".select-option").forEach((o) => {
      const match = o.dataset.provider === key;
      o.classList.toggle("active", match);
      o.setAttribute("aria-selected", match ? "true" : "false");
    });
    el.aiProviderCurrent.textContent = provider.label;
    el.aiModelMenu.innerHTML = provider.models
      .map((m) => `<div class="select-option" data-model="${escapeHtml(m)}">${escapeHtml(m)}</div>`)
      .join("");
    if (!opts || !opts.keepEndpoint) el.aiEndpointInput.value = provider.endpointTemplate;
    if (!opts || !opts.keepModel) el.aiModelInput.value = provider.models[0];
  }

  if (el.aiProviderBtn) {
    registerDropdown(el.aiProviderDropdown, el.aiProviderBtn, el.aiProviderMenu);
    const modelDd = registerDropdown(el.aiModelDropdown, el.aiModelBtn, el.aiModelMenu);
    el.aiProviderMenu.addEventListener("click", (e) => {
      const opt = e.target.closest(".select-option");
      if (!opt) return;
      selectAiProvider(opt.dataset.provider);
      persistAiSettings();
    });
    el.aiModelMenu.addEventListener("click", (e) => {
      const opt = e.target.closest(".select-option");
      if (!opt) return;
      el.aiModelInput.value = opt.dataset.model;
      modelDd.close();
      persistAiSettings();
    });
  }

  (function initAi() {
    selectAiProvider("anthropic");
    try {
      const saved = JSON.parse(localStorage.getItem(AI_STORAGE) || "null");
      if (saved) {
        selectAiProvider(saved.provider || "anthropic", { keepEndpoint: true, keepModel: true });
        el.aiEndpointInput.value = saved.endpoint || AI_PROVIDERS[currentAiProvider].endpointTemplate;
        el.aiModelInput.value = saved.model || AI_PROVIDERS[currentAiProvider].models[0];
        el.aiApikeyInput.value = saved.key || "";
        el.aiRememberKey.checked = true;
      }
    } catch (e) { /* storage unavailable */ }
  })();

  function persistAiSettings() {
    if (!el.aiRememberKey.checked) { try { localStorage.removeItem(AI_STORAGE); } catch (e) {} return; }
    try {
      localStorage.setItem(AI_STORAGE, JSON.stringify({
        provider: currentAiProvider, endpoint: el.aiEndpointInput.value, model: el.aiModelInput.value, key: el.aiApikeyInput.value,
      }));
    } catch (e) { /* storage unavailable */ }
  }
  [el.aiEndpointInput, el.aiModelInput, el.aiApikeyInput].forEach((inp) => {
    if (inp) inp.addEventListener("input", persistAiSettings);
  });
  el.aiRememberKey.addEventListener("change", persistAiSettings);
  el.aiKeyToggleBtn.addEventListener("click", () => {
    const showing = el.aiApikeyInput.type === "text";
    el.aiApikeyInput.type = showing ? "password" : "text";
    el.aiKeyToggleBtn.textContent = showing ? t("show") : t("show") === "show" ? "hide" : el.aiKeyToggleBtn.textContent;
  });

  function buildApkSummary() {
    if (!lastInspection) return null;
    const d = lastInspection.data || {};
    const lines = [
      `File: ${lastInspection.name}`,
      `Format: ${lastInspection.format}`,
      d.package ? `Package: ${d.package}` : null,
      d.label ? `Label: ${d.label}` : null,
      d.versionName ? `Version: ${d.versionName} (${d.versionCode || "?"})` : null,
      d.minSdk ? `Min/target SDK: ${d.minSdk}/${d.targetSdk || "?"}` : null,
      d.native ? `Native ABIs: ${d.native}` : null,
      lastInspection.extra && lastInspection.extra.sha256 ? `SHA-256: ${lastInspection.extra.sha256}` : null,
      d.permissions && d.permissions.length ? `Permissions (${d.permissions.length}): ${d.permissions.join(", ")}` : "Permissions: none found",
      lastInspection.containerManifest ? `Bundle manifest: ${JSON.stringify(lastInspection.containerManifest)}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function callAi(userPrompt) {
    const endpoint = el.aiEndpointInput.value.trim();
    const apiKey = el.aiApikeyInput.value.trim();
    const provider = AI_PROVIDERS[currentAiProvider] || AI_PROVIDERS.anthropic;
    const model = el.aiModelInput.value.trim() || provider.models[0];
    if (!endpoint || !apiKey) return { ok: false, error: "Set an API endpoint and API key first." };

    const req = provider.buildRequest(endpoint, model, apiKey, userPrompt);
    let res;
    try {
      res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    } catch (e) {
      return { ok: false, error: "Network error reaching the API: " + String(e) };
    }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch (e) {}
      return { ok: false, error: `API returned HTTP ${res.status}. ${detail}` };
    }
    let data;
    try { data = await res.json(); } catch (e) { return { ok: false, error: "Could not parse the API response as JSON." }; }
    const text = provider.parseResponse(data);
    if (!text) return { ok: false, error: "Unexpected API response shape — couldn't find the reply text." };
    return { ok: true, text };
  }

  function renderAiAnswer(text) {
    el.aiAnswer.classList.remove("hidden", "verdict-suspicious", "verdict-caution", "verdict-ok");
    let badgeClass = null, badgeText = null;
    if (/\b(suspicious|malicious|dangerous|high risk|avoid installing)\b/i.test(text)) { badgeClass = "suspicious"; badgeText = "⚠ Flagged as concerning"; el.aiAnswer.classList.add("verdict-suspicious"); }
    else if (/\b(caution|be careful|somewhat risky|unusual)\b/i.test(text)) { badgeClass = "caution"; badgeText = "◐ Worth a closer look"; el.aiAnswer.classList.add("verdict-caution"); }
    else if (/\b(looks fine|no major concerns|appears safe|nothing unusual|looks safe)\b/i.test(text)) { badgeClass = "ok"; badgeText = "✓ No major flags"; el.aiAnswer.classList.add("verdict-ok"); }
    const badge = badgeClass ? `<span class="ai-verdict-badge ${badgeClass}">${badgeText}</span><br>` : "";
    el.aiAnswer.innerHTML = badge + escapeHtml(text).replace(/\n/g, "<br>");
  }

  el.aiAnalyzeBtn.addEventListener("click", async () => {
    const summary = buildApkSummary();
    if (!summary) {
      el.aiProgress.classList.remove("hidden");
      el.aiProgress.innerHTML = "";
      progressLog(el.aiProgress, "Inspect an APK first (Inspect tab), then come back here.", "warn");
      return;
    }
    el.aiAnalyzeBtn.disabled = true;
    el.aiProgress.classList.remove("hidden");
    el.aiProgress.innerHTML = "";
    progressLog(el.aiProgress, "→ asking the model to review this package…");
    const prompt = `You are helping a user decide whether to install an Android package, before installation. Here is data extracted from the package (permissions, manifest fields, and container metadata if any):\n\n${summary}\n\nBased only on this data: summarize in plain language what this app can access and do, flag anything unusual or excessive for what the app appears to be (e.g. a simple utility asking for SMS/accessibility/device-admin access), and give a short overall impression (use a phrase like "looks fine" / "worth a closer look" / "flagged as concerning" somewhere in your answer). Be clear that this is not a definitive verdict, since manifest data alone can't prove intent. Keep it concise.`;
    const result = await callAi(prompt);
    el.aiAnalyzeBtn.disabled = false;
    if (!result.ok) {
      progressLog(el.aiProgress, "✗ " + result.error, "err");
      return;
    }
    progressLog(el.aiProgress, "✓ done", "ok");
    renderAiAnswer(result.text);
  });

  el.aiAskBtn.addEventListener("click", async () => {
    const question = el.aiQuestionInput.value.trim();
    if (!question) return;
    const summary = buildApkSummary();
    el.aiAskBtn.disabled = true;
    el.aiProgress.classList.remove("hidden");
    el.aiProgress.innerHTML = "";
    progressLog(el.aiProgress, "→ asking…");
    const prompt = summary
      ? `Context — data extracted from an Android package the user is about to install:\n\n${summary}\n\nUser question: ${question}\n\nAnswer concisely based on the data above; say if the data doesn't cover it.`
      : `The user hasn't inspected any APK yet in this session. Answer their general question as best you can, and mention they can use the Inspect tab first for package-specific context.\n\nUser question: ${question}`;
    const result = await callAi(prompt);
    el.aiAskBtn.disabled = false;
    if (!result.ok) {
      progressLog(el.aiProgress, "✗ " + result.error, "err");
      return;
    }
    progressLog(el.aiProgress, "✓ done", "ok");
    renderAiAnswer(result.text);
  });

  function init() {
    checkBridge().then((ok) => { if (ok) browsePath(currentPath); });
    updateSelectionUi();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
