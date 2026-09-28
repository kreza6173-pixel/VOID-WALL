// ===================== helpers =====================
const VW_BUILD = '1.3';   // must match <meta name="vw-build"> in index.html and BUILD in ai.js
function shQuote(s){ return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function runShell(cmd, timeoutSeconds){
  try {
    const json = window.Shizuku.execWithOptions(cmd, JSON.stringify({ timeoutSeconds: timeoutSeconds || 30 }));
    return JSON.parse(json);
  } catch(e){ return { ok:false, stdout:'', stderr:String(e), exitCode:-1, timedOut:false }; }
}
async function withBusy(btn, fn){
  if (!btn) { await fn(); return; }
  const orig = btn.textContent;
  btn.disabled = true; btn.classList.add('loading');
  try { await fn(); }
  catch(e){ console.error(e); alert('Unexpected error: ' + e.message); }
  finally { btn.disabled = false; btn.classList.remove('loading'); btn.textContent = orig; }
}
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function showDiag(id, text){
  const el = document.getElementById(id);
  if (!el) return;
  if (text) { el.style.display = 'block'; el.textContent = text; }
  else { el.style.display = 'none'; el.textContent = ''; }
}

// Themed drop-down used instead of a native <select> (native popups render out of style in WebViews).
// `el` is a container <div>; el.value always reflects the current choice.
function initPicker(el, options, initial, onChange){
  let cur = options.some(o => o.value === initial) ? initial : (options[0] && options[0].value);
  el.classList.add('picker');
  el.innerHTML = '<button type="button" class="picker-btn"><span class="picker-label"></span><span class="picker-caret">▾</span></button>' +
                 '<div class="model-menu"><div class="model-list"></div></div>';
  const btn = el.querySelector('.picker-btn'), menu = el.querySelector('.model-menu'), list = el.querySelector('.model-list');
  const paint = () => { const o = options.find(x => x.value === cur); el.querySelector('.picker-label').textContent = o ? o.label : ''; };
  const close = () => { menu.style.display = 'none'; el.classList.remove('open'); };
  btn.addEventListener('click', () => {
    if (menu.style.display === 'block') { close(); return; }
    list.innerHTML = options.map(o => `<div class="model-item${o.value === cur ? ' sel' : ''}" data-v="${esc(o.value)}">${esc(o.label)}</div>`).join('');
    menu.style.display = 'block'; el.classList.add('open');
  });
  list.addEventListener('click', e => {
    const it = e.target.closest && e.target.closest('[data-v]');
    if (!it) return;
    cur = it.dataset.v; paint(); close();
    if (onChange) onChange(cur);
  });
  document.addEventListener('click', e => { if (menu.style.display === 'block' && !el.contains(e.target)) close(); });
  Object.defineProperty(el, 'value', { get: () => cur, set: v => { cur = v; paint(); } });
  paint();
}

let SHEVERY_PKG = 'com.hamondev.shevery';
let isRoot = false;
let chain3Supported = false;

// ===================== bridge / root / chain3 detection =====================
function checkBridge(){
  const s = document.getElementById('bridgeStatus'), w = document.getElementById('bridgeWarning');
  try {
    const info = JSON.parse(window.Shizuku.getModuleInfo());
    if (!info.enabled) { s.textContent='module disabled'; s.className='pill bad'; w.style.display='block'; return false; }
    const r = JSON.parse(window.Shizuku.exec('echo ok'));
    if (r.ok) { s.textContent='✓ ' + info.accessMode; s.className='pill ok'; w.style.display='none'; return true; }
    s.textContent='shell disabled'; s.className='pill bad'; w.style.display='block'; return false;
  } catch(e){ s.textContent='error'; s.className='pill bad'; w.style.display='block'; return false; }
}

function checkRoot(){
  const r = runShell('id -u', 10);
  isRoot = r.ok && r.stdout.trim() === '0';
  if (isRoot) {
    document.getElementById('rootStatus').style.display = 'inline-block';
    document.getElementById('rootGateCard').style.display = 'block';
    document.getElementById('recipesGateCard').style.display = 'block';
  }
}

function checkChain3(){
  const r = runShell('getprop ro.build.version.sdk', 10);
  const sdk = parseInt((r.stdout||'0').trim()) || 0;
  chain3Supported = sdk >= 30;
  const el = document.getElementById('chain3Status');
  const warn = document.getElementById('chain3Warning');
  if (chain3Supported) {
    const enableRes = runShell('cmd connectivity set-chain3-enabled true', 15);
    el.textContent = 'Chain3 ✓ (SDK ' + sdk + ')'; el.className = 'pill info';
    warn.style.display = 'none';
    document.getElementById('chain3Toggle').checked = true;
    document.getElementById('chain3ToggleLabel').textContent = 'enabled';
    if (!enableRes.ok) {
      console.warn('chain3 enable failed:', enableRes.stderr);
    }
  } else {
    el.textContent = 'Chain3 ✗ (SDK ' + sdk + ')'; el.className = 'pill warn';
    warn.style.display = 'block';
  }
}

// ===================== critical app detection (self-protect + core AOSP) =====================
const CRITICAL_PREFIXES = [
  'android', 'com.android.systemui', 'com.android.settings', 'com.android.providers.settings',
  'com.android.server.telecom', 'com.android.phone', 'com.android.providers.telephony',
  'com.android.bluetooth', 'com.android.nfc', 'com.android.permissioncontroller',
  'com.android.packageinstaller', 'com.android.shell', 'com.google.android.gms', 'com.google.android.gsf',
];
let dynamicCritical = new Set();
function isCritical(pkg){
  if (pkg === SHEVERY_PKG) return true;
  if (dynamicCritical.has(pkg)) return true;
  return CRITICAL_PREFIXES.some(p => pkg === p || pkg.startsWith(p + '.'));
}
function detectDynamicCritical(){
  try {
    const r1 = runShell('cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null | tail -1', 15);
    const launcherPkg = (r1.stdout||'').trim().split('/')[0].trim();
    if (launcherPkg && !launcherPkg.includes(' ')) dynamicCritical.add(launcherPkg);
    const r2 = runShell('settings get secure default_input_method 2>/dev/null', 15);
    const imePkg = (r2.stdout||'').trim().split('/')[0].trim();
    if (imePkg) dynamicCritical.add(imePkg);
  } catch(e){ console.warn('critical-app detection failed (non-fatal):', e); }
}

// ===================== tabs =====================
document.querySelectorAll('.tabbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===================== dashboard =====================
document.getElementById('chain3Toggle').addEventListener('change', function(){
  const on = this.checked;
  runShell('cmd connectivity set-chain3-enabled ' + (on ? 'true' : 'false'), 15);
  document.getElementById('chain3ToggleLabel').textContent = on ? 'enabled' : 'disabled';
});

function loadBlockedList(){
  const r = runShell('cat /data/local/tmp/void-wall-blocked.list 2>/dev/null', 10);
  return (r.stdout||'').split('\n').map(s=>s.trim()).filter(Boolean);
}
function saveBlockedList(list){
  const content = list.join('\n');
  const b64 = btoa(unescape(encodeURIComponent(content)));
  runShell(`echo ${shQuote(b64)} | base64 -d > /data/local/tmp/void-wall-blocked.list`, 15);
}

async function refreshDashboard(){
  const blocked = loadBlockedList();
  const bg = runShell('cmd netpolicy list restrict-background-blacklist 2>/dev/null', 15);
  const bgCount = (bg.stdout||'').split('\n').filter(l => /\d/.test(l)).length;
  document.getElementById('dashSummary').innerHTML =
    `<span>Full blocks: <b>${blocked.length}</b></span>` +
    `<span>Background restricted: <b>${bgCount}</b></span>` +
    `<span>Mode: <b>${chain3Supported ? 'Chain3' : 'netpolicy only'}</b></span>` +
    `<span>Root: <b>${isRoot ? 'yes' : 'no'}</b></span>`;
}
document.getElementById('btnDashRefresh').addEventListener('click', async function(){ await withBusy(this, refreshDashboard); });

// panic button
async function panic(){
  if (!confirm('Cut ALL device networking (Wi-Fi, mobile data, hotspot)? This enables Airplane Mode.')) return;
  const r = runShell('settings put global airplane_mode_on 1 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true', 15);
  if (!r.ok) alert('Panic command failed: ' + (r.stderr || 'unknown error'));
}
document.getElementById('btnPanic').addEventListener('click', panic);
document.getElementById('btnPanicFloat').addEventListener('click', panic);

// ===================== APP RULES =====================
let apps = []; // {pkg, uid, isUser, isSystem, blocked, bgRestricted}
let appFilter = 'all';

document.getElementById('btnScanApps').addEventListener('click', async function(){
  await withBusy(this, async () => {
    showDiag('scanDiag', null);
    detectDynamicCritical();

    // Each list is fetched as its own isolated call — if one fails, it doesn't
    // silently zero out the others, and we get a precise diagnostic instead of guessing.
    const allRes = runShell('pm list packages 2>&1 | sed "s/^package://"', 30);
    if (!allRes.ok || !(allRes.stdout||'').trim()) {
      showDiag('scanDiag',
        'Scan failed at "pm list packages".\n' +
        'exitCode=' + allRes.exitCode + '  timedOut=' + allRes.timedOut + '\n' +
        'stdout: ' + (allRes.stdout || '(empty)') + '\n' +
        'stderr: ' + (allRes.stderr || '(empty)')
      );
      apps = [];
      document.getElementById('appsToolbar').style.display = 'block';
      renderAppList();
      return;
    }
    const allPkgs = allRes.stdout.split('\n').map(s=>s.trim()).filter(Boolean);

    const userRes = runShell('pm list packages -3 2>&1 | sed "s/^package://"', 30);
    const userSet = new Set((userRes.stdout||'').split('\n').map(s=>s.trim()).filter(Boolean));

    const uidRes = runShell('pm list packages -U 2>&1', 30);
    const uidMap = {};
    if (uidRes.ok) {
      (uidRes.stdout||'').split('\n').forEach(line => {
        const m = line.match(/^package:(\S+)\s+uid:(\d+)/);
        if (m) uidMap[m[1]] = m[2];
      });
    } else {
      showDiag('scanDiag',
        'Note: UID lookup ("pm list packages -U") failed on this device — ' +
        'background-restriction toggles will be unavailable, but full blocking still works.\n' +
        'stderr: ' + (uidRes.stderr || '(empty)')
      );
    }

    const blocked = new Set(loadBlockedList());
    const bg = runShell('cmd netpolicy list restrict-background-blacklist 2>/dev/null', 15);
    const bgUids = new Set((bg.stdout||'').split('\n').map(l => (l.match(/\d+/)||[])[0]).filter(Boolean));

    apps = allPkgs.sort().map(pkg => ({
      pkg, uid: uidMap[pkg] || '',
      isUser: userSet.has(pkg), isSystem: !userSet.has(pkg),
      blocked: blocked.has(pkg),
      bgRestricted: uidMap[pkg] ? bgUids.has(uidMap[pkg]) : false,
    }));

    document.getElementById('appsToolbar').style.display = 'block';
    renderAppList();
  });
});

document.querySelectorAll('#tab-apps .tab2').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('#tab-apps .tab2').forEach(x=>x.classList.remove('active'));
  t.classList.add('active'); appFilter = t.dataset.filter; renderAppList();
}));
document.getElementById('appSearch').addEventListener('input', renderAppList);

function getFilteredApps(){
  const q = document.getElementById('appSearch').value.trim().toLowerCase();
  return apps.filter(a => {
    if (q && !a.pkg.toLowerCase().includes(q)) return false;
    if (appFilter === 'user') return a.isUser;
    if (appFilter === 'blocked') return a.blocked;
    if (appFilter === 'critical') return isCritical(a.pkg);
    return true;
  });
}

function renderAppList(){
  const wrap = document.getElementById('appListWrap');
  const list = getFilteredApps();
  document.getElementById('appsSummary').innerHTML =
    `<span>Total: <b>${apps.length}</b></span><span>Blocked: <b>${apps.filter(a=>a.blocked).length}</b></span>` +
    `<span>Background restricted: <b>${apps.filter(a=>a.bgRestricted).length}</b></span>`;
  if (!list.length) {
    wrap.innerHTML = apps.length
      ? '<div class="empty-note"><span class="big">No matches</span>Try a different search or filter.</div>'
      : '<div class="empty-note"><span class="big">Nothing scanned yet</span>Tap "Scan Installed Apps" above.</div>';
    return;
  }

  let html = '<div class="app-list">';
  list.forEach(a => {
    const crit = isCritical(a.pkg);
    html += `<div class="app-row">
      <div class="app-info">
        <div class="pkg">${esc(a.pkg)}</div>
        <div class="tags">
          ${a.isSystem ? '<span class="tag sys">SYSTEM</span>' : '<span class="tag sys">USER</span>'}
          ${crit ? '<span class="tag critical">⚠️ CRITICAL</span>' : ''}
          ${a.bgRestricted ? '<span class="tag bg">BG RESTRICTED</span>' : ''}
        </div>
        ${!crit ? `<label class="bg-toggle"><input type="checkbox" data-bg="${a.pkg}" data-uid="${a.uid}" ${a.bgRestricted?'checked':''}> also restrict background</label>` : ''}
      </div>
      <button class="ask-ai" data-ask="${esc(a.pkg)}" title="Ask the AI assistant about this app">🤖</button>
      <label class="toggle-switch">
        <input type="checkbox" data-block="${a.pkg}" ${a.blocked?'checked':''} ${crit?'disabled':''}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('input[data-block]').forEach(cb => {
    cb.addEventListener('change', async function(){
      const pkg = this.dataset.block;
      const wantBlock = this.checked;
      if (!chain3Supported) { alert('Chain3 is unavailable — full blocking is not possible on this Android version.'); this.checked = !wantBlock; return; }
      const r = runShell(`cmd connectivity set-package-networking-enabled ${wantBlock?'false':'true'} ${shQuote(pkg)}`, 15);
      if (!r.ok) { alert('Failed: ' + (r.stderr||'unknown error')); this.checked = !wantBlock; return; }
      const list = loadBlockedList();
      const idx = list.indexOf(pkg);
      if (wantBlock && idx < 0) list.push(pkg);
      if (!wantBlock && idx >= 0) list.splice(idx, 1);
      saveBlockedList(list);
      const a = apps.find(x=>x.pkg===pkg); if (a) a.blocked = wantBlock;
    });
  });
  wrap.querySelectorAll('input[data-bg]').forEach(cb => {
    cb.addEventListener('change', function(){
      const uid = this.dataset.uid;
      if (!uid) { alert('No UID found for this package (UID lookup may be unsupported on this device).'); this.checked = !this.checked; return; }
      runShell(`cmd netpolicy ${this.checked?'add':'remove'} restrict-background-blacklist ${shQuote(uid)}`, 15);
      const a = apps.find(x=>x.pkg===this.dataset.bg); if (a) a.bgRestricted = this.checked;
    });
  });
}

// ===================== USAGE =====================
// `dumpsys netstats detail` prints the UID on one line and its time buckets (st= rb= tb= ...) on the
// following lines, and its output is far larger than the bridge's per-call output limit. The
// aggregation therefore happens on the device (plain POSIX sh, no awk needed) and only one short
// line per app comes back:  "<uid> <mobile bytes> <wifi bytes> <other bytes>".
const USAGE_SH = [
  "if [ $((4294967296+1)) = 4294967297 ]; then S=1; else S=1000; fi",
  "L=; ok=0; ty=o; cu=; cm=0; cw=0; co=0",
  "flush() { [ -n \"$cu\" ] || return 0; eval \"M$cu=\\$((\\${M$cu:-0}+cm)); W$cu=\\$((\\${W$cu:-0}+cw)); O$cu=\\$((\\${O$cu:-0}+co))\"; case \" $L \" in *\" $cu \"*) ;; *) L=\"$L $cu\";; esac; cu=; cm=0; cw=0; co=0; }",
  "dumpsys netstats detail 2>/dev/null | grep -E '^ *(ident=|st=)' | {",
  "while IFS= read -r l; do",
  "  case \"$l\" in",
  "    *ident=*)",
  "      flush; ok=0",
  "      case \"$l\" in *\" uid=\"*\" tag=\"*)",
  "        u=${l#* uid=}; u=${u%% *}; t=${l#* tag=}; t=${t%% *}",
  "        case \"$u\" in ''|*[!0-9]*) ;; *) [ \"$t\" = 0x0 ] && ok=1;; esac;;",
  "      esac",
  "      if [ $ok = 1 ]; then",
  "        cu=$u",
  "        case \"$l\" in *type=MOBILE*) ty=m;; *type=WIFI*) ty=w;; *) ty=o;; esac",
  "      fi;;",
  "    *)",
  "      [ $ok = 1 ] || continue",
  "      s=${l#*st=}; s=${s%% *}",
  "      [ ${#s} -gt 11 ] && s=${s%???}",
  "      [ \"$s\" -ge @CUT@ ] 2>/dev/null || continue",
  "      r=${l#*rb=}; r=${r%% *}; x=${l#*tb=}; x=${x%% *}",
  "      if [ $S = 1 ]; then b=$((r+x)); else r=${r%???}; x=${x%???}; b=$((${r:-0}+${x:-0})); fi",
  "      case $ty in m) cm=$((cm+b));; w) cw=$((cw+b));; *) co=$((co+b));; esac;;",
  "  esac",
  "done",
  "flush",
  "echo \"S $S\"",
  "for u in $L; do eval \"echo \\\"$u \\${M$u} \\${W$u} \\${O$u}\\\"\"; done",
  "}"
].join('\n');

function uidPackageMap(){
  const map = {};
  (runShell('pm list packages -U 2>/dev/null', 20).stdout || '').split('\n').forEach(line => {
    const m = line.match(/^package:(\S+)\s+uid:(\d+)/);
    if (m) map[m[2]] = m[1];
  });
  return map;
}

// One pass over `dumpsys netstats detail`, keeping only buckets that start at or after `cut` (epoch seconds).
function netstatsRows(cut){
  const res = runShell(USAGE_SH.replace('@CUT@', String(cut)), 90);
  const lines = (res.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length || lines[0][0] !== 'S') {
    return { error: 'exit: ' + res.exitCode + (res.timedOut ? ' (timed out)' : '') + '\nstderr: ' + (res.stderr || '(empty)'), rows: [] };
  }
  const scale = parseInt(lines[0].split(' ')[1]) || 1;
  const names = uidPackageMap();
  const rows = lines.slice(1).map(l => {
    const [uid, m, w, o] = l.split(' ');
    const mobile = (parseInt(m) || 0) * scale, wifi = (parseInt(w) || 0) * scale, other = (parseInt(o) || 0) * scale;
    return { uid, pkg: names[uid] || ('uid:' + uid), mobile, wifi, other, bytes: mobile + wifi + other };
  }).filter(r => r.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  return { rows };
}

// Battery-stats totals (since the last full charge) — a second source for devices whose netstats dump has no per-app data.
function batteryRows(){
  const res = runShell("dumpsys batterystats --checkin 2>/dev/null | grep -E '^[0-9]+,[0-9]+,l,nt,'", 60);
  const names = uidPackageMap();
  const rows = (res.stdout || '').split('\n').map(l => l.trim().split(',')).filter(f => f.length > 7).map(f => {
    const n = i => parseInt(f[i]) || 0;
    const mobile = n(4) + n(5), wifi = n(6) + n(7);
    return { uid: f[1], pkg: names[f[1]] || ('uid:' + f[1]), mobile, wifi, other: 0, bytes: mobile + wifi };
  }).filter(r => r.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  return { rows };
}

// Structure summary shown when nothing can be read, so the cause is visible instead of a blank screen.
function netstatsProbe(){
  const d = 'dumpsys netstats detail 2>&1';
  const cmd = [
    `echo "ident lines: $(${d} | grep -c ident=)"`,
    `echo "uid idents: $(${d} | grep -cE 'ident=.* uid=[0-9]+ ')"`,
    `echo "uid idents tag0: $(${d} | grep -cE 'uid=[0-9]+ set=[A-Z]+ tag=0x0')"`,
    `echo "bucket lines: $(${d} | grep -cE '^ *st=')"`,
    `echo "sections:"; ${d} | grep -E '^[A-Za-z][A-Za-z ]*:' | head -12`,
    `echo "sample ident:"; ${d} | grep -E -m2 'uid=[0-9]+ ' | cut -c1-200`,
    `echo "sample bucket:"; ${d} | grep -E -m2 'st=[0-9]' | cut -c1-160`,
  ].join('; ');
  return (runShell(cmd, 90).stdout || '').trim() || '(no output)';
}

// mode: 'boot' | 'day' | 'all' (netstats history) | 'charge' (battery stats)
function collectUsage(mode){
  if (mode === 'charge') {
    const b = batteryRows();
    return b.rows.length ? { rows: b.rows, source: 'battery' } : { rows: [], source: 'battery', probe: 'dumpsys batterystats returned no per-app network lines.' };
  }
  const up = parseFloat(((runShell('cat /proc/uptime', 5).stdout || '').trim().split(/\s+/)[0])) || 0;
  const now = Math.floor(Date.now() / 1000);
  // History buckets are 1-2 h long: include the bucket that overlaps the boot moment.
  const cut = mode === 'all' ? 0 : mode === 'day' ? now - 86400 : Math.max(0, now - Math.floor(up) - 7200);
  const first = netstatsRows(cut);
  if (first.rows.length) return { rows: first.rows, source: 'netstats' };

  const all = cut === 0 ? first : netstatsRows(0);
  if (all.rows.length) {
    return { rows: [], source: 'netstats',
             note: 'Android has history for ' + all.rows.length + ' apps, but none inside this range yet. Try "Last 24 hours" or "All recorded history".' };
  }
  const b = batteryRows();
  if (b.rows.length) {
    return { rows: b.rows, source: 'battery',
             note: 'dumpsys netstats has no per-app data on this device, so these are battery-stats totals since the last full charge.' };
  }
  return { rows: [], source: 'none', error: all.error || '', probe: netstatsProbe() };
}

function usageSplit(x){
  const parts = [];
  if (x.mobile) parts.push('📶 ' + fmtBytes(x.mobile));
  if (x.wifi) parts.push('📡 ' + fmtBytes(x.wifi));
  if (x.other) parts.push('🔒 ' + fmtBytes(x.other));
  return parts.join(' · ');
}

initPicker(document.getElementById('usageRange'), [
  { value: 'boot',   label: 'Since last boot' },
  { value: 'day',    label: 'Last 24 hours' },
  { value: 'all',    label: 'All recorded history' },
  { value: 'charge', label: 'Since last full charge (battery stats)' },
], 'boot');

document.getElementById('btnScanUsage').addEventListener('click', async function(){
  await withBusy(this, async () => {
    showDiag('usageDiag', null);
    const note = document.getElementById('usageNote'), box = document.getElementById('usageResult');
    note.textContent = ''; box.innerHTML = '';
    const r = collectUsage(document.getElementById('usageRange').value);
    if (r.note) note.textContent = r.note;
    if (!r.rows.length) {
      box.innerHTML = '<div class="empty-note"><span class="big">No usage data</span>Nothing to show for this range.</div>';
      if (r.probe || r.error) showDiag('usageDiag', 'Diagnostics (share this if usage stays empty):\n' + (r.error ? r.error + '\n' : '') + (r.probe || ''));
      return;
    }
    box.innerHTML = r.rows.slice(0, 40).map(x =>
      `<div class="result-row"><span>${esc(x.pkg)}<small>${usageSplit(x)}</small></span><b>${fmtBytes(x.bytes)}</b></div>`
    ).join('');
  });
});
function fmtBytes(n){
  const u = ['B','KB','MB','GB']; let i=0;
  while (n >= 1024 && i < u.length-1) { n/=1024; i++; }
  return n.toFixed(i?1:0) + ' ' + u[i];
}

// ===================== ROOT: setup + chains =====================
function ensureChains(){
  const cmd = [
    'iptables -N VOIDWALL 2>/dev/null',
    'iptables -C OUTPUT -j VOIDWALL 2>/dev/null || iptables -I OUTPUT 1 -j VOIDWALL',
    'iptables -N VOIDWALL_IN 2>/dev/null',
    'iptables -C INPUT -j VOIDWALL_IN 2>/dev/null || iptables -I INPUT 1 -j VOIDWALL_IN',
    'iptables -t nat -N VOIDWALL_NAT 2>/dev/null',
    'iptables -t nat -C PREROUTING -j VOIDWALL_NAT 2>/dev/null || iptables -t nat -I PREROUTING 1 -j VOIDWALL_NAT',
    // IPv6 mirror chains — best-effort; devices without ip6tables simply no-op here and IPv6 recipes below fail individually with a clear error instead of blocking IPv4 setup.
    'ip6tables -N VOIDWALL6 2>/dev/null',
    'ip6tables -C OUTPUT -j VOIDWALL6 2>/dev/null || ip6tables -I OUTPUT 1 -j VOIDWALL6 2>/dev/null',
    'ip6tables -N VOIDWALL6_IN 2>/dev/null',
    'ip6tables -C INPUT -j VOIDWALL6_IN 2>/dev/null || ip6tables -I INPUT 1 -j VOIDWALL6_IN 2>/dev/null',
  ].join('; ');
  return runShell(cmd, 20);
}
const ipv6Available = () => runShell('command -v ip6tables >/dev/null 2>&1 && echo yes', 10).stdout.trim() === 'yes';

document.getElementById('btnUnlockRoot').addEventListener('click', function(){
  const ok = confirm(
    'This section directly manipulates iptables.\n\n' +
    '• Everything lives inside dedicated chains (VOIDWALL/VOIDWALL_IN/VOIDWALL_NAT), never touching the rest of the system\n' +
    '• "Wipe VOIDWALL" is always available if something breaks\n' +
    '• That said, since this is raw network-level access, a wrong rule could cut your own connection (even adb/ssh)\n\nContinue?'
  );
  if (!ok) return;
  const r = ensureChains();
  if (!r.ok) { alert('Failed to set up iptables chains: ' + (r.stderr || 'unknown error')); return; }
  document.getElementById('rootGateCard').style.display = 'none';
  document.getElementById('rootSection').style.display = 'block';
  document.getElementById('recipesGateCard').style.display = 'none';
  document.getElementById('recipesSection').style.display = 'block';
  renderRecipes();
});

// ---- LAN block/unblock ----
document.getElementById('btnLanBlock').addEventListener('click', async function(){
  await withBusy(this, async () => {
    const ip = document.getElementById('lanIp').value.trim();
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) { alert('Enter a valid IP.'); return; }
    ensureChains();
    const r = runShell(
      `iptables -A VOIDWALL -d ${shQuote(ip)} -j DROP; iptables -A VOIDWALL_IN -s ${shQuote(ip)} -j DROP; echo done`, 15
    );
    document.getElementById('lanLog').textContent = r.ok ? `✓ ${ip} blocked (both directions)` : ('Error: '+r.stderr);
  });
});
document.getElementById('btnLanUnblock').addEventListener('click', async function(){
  await withBusy(this, async () => {
    const ip = document.getElementById('lanIp').value.trim();
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) { alert('Enter a valid IP.'); return; }
    runShell(
      `iptables -D VOIDWALL -d ${shQuote(ip)} -j DROP 2>/dev/null; iptables -D VOIDWALL_IN -s ${shQuote(ip)} -j DROP 2>/dev/null; echo done`, 15
    );
    document.getElementById('lanLog').textContent = `✓ Rules for ${ip} removed (if they existed)`;
  });
});

// ---- port forward ----
document.getElementById('btnFwdAdd').addEventListener('click', async function(){
  await withBusy(this, async () => {
    const from = document.getElementById('fwdFrom').value.trim();
    const to = document.getElementById('fwdTo').value.trim();
    const m = to.match(/^([\d.]+):(\d+)$/);
    if (!from || !m) { alert('Destination must be IP:PORT.'); return; }
    ensureChains();
    const cmd = `iptables -t nat -A VOIDWALL_NAT -p tcp --dport ${shQuote(from)} -j DNAT --to-destination ${shQuote(to)}; ` +
      `iptables -C FORWARD -j ACCEPT 2>/dev/null || iptables -A FORWARD -j ACCEPT; echo done`;
    const r = runShell(cmd, 15);
    document.getElementById('fwdLog').textContent = r.ok
      ? `✓ Port ${from} → ${to} forwarded (only meaningful while hotspot/tethering is active)`
      : ('Error: '+r.stderr);
  });
});
document.getElementById('btnFwdClear').addEventListener('click', async function(){
  await withBusy(this, async () => {
    runShell('iptables -t nat -F VOIDWALL_NAT 2>/dev/null; echo done', 15);
    document.getElementById('fwdLog').textContent = '✓ All port forwards cleared.';
  });
});

// ---- raw script console (preview → snapshot → run → undo) ----
let lastPreviewCmd = null;
document.getElementById('btnScriptPreview').addEventListener('click', function(){
  const raw = document.getElementById('scriptInput').value.trim();
  if (!raw) return;
  lastPreviewCmd = raw;
  document.getElementById('scriptLog').textContent = '=== Preview (not executed yet) ===\n' + raw;
  document.getElementById('btnScriptRun').disabled = false;
});
document.getElementById('scriptInput').addEventListener('input', () => {
  document.getElementById('btnScriptRun').disabled = true;
  lastPreviewCmd = null;
});

function snapshotChains(){
  const r = runShell('iptables -S VOIDWALL 2>/dev/null; iptables -S VOIDWALL_IN 2>/dev/null; iptables -t nat -S VOIDWALL_NAT 2>/dev/null', 15);
  const content = r.stdout || '';
  const b64 = btoa(unescape(encodeURIComponent(content)));
  runShell(`echo ${shQuote(b64)} | base64 -d > /data/local/tmp/void-wall-snapshot.rules`, 15);
}

document.getElementById('btnScriptRun').addEventListener('click', async function(){
  if (!lastPreviewCmd) return;
  const typed = prompt('To confirm running this raw script, type exactly:\n\nRUN VOIDWALL');
  if (typed !== 'RUN VOIDWALL') { alert('Cancelled.'); return; }
  await withBusy(this, async () => {
    ensureChains();
    snapshotChains();
    const r = runShell(lastPreviewCmd, 30);
    document.getElementById('scriptLog').textContent =
      '=== Output ===\n' + (r.stdout||'') + (r.stderr?('\n[stderr]\n'+r.stderr):'') +
      '\n\n(A snapshot was taken before this ran — tap Undo if something broke)';
    document.getElementById('btnScriptRun').disabled = true;
  });
});
document.getElementById('btnScriptUndo').addEventListener('click', async function(){
  await withBusy(this, async () => {
    const snap = runShell('cat /data/local/tmp/void-wall-snapshot.rules 2>/dev/null', 10);
    if (!snap.ok || !(snap.stdout||'').trim()) { document.getElementById('scriptLog').textContent = 'No snapshot found.'; return; }
    runShell('iptables -F VOIDWALL 2>/dev/null; iptables -F VOIDWALL_IN 2>/dev/null; iptables -t nat -F VOIDWALL_NAT 2>/dev/null', 15);
    const lines = snap.stdout.split('\n').map(l=>l.trim()).filter(l => l.startsWith('-A'));
    const table = (l) => l.includes('VOIDWALL_NAT') ? '-t nat ' : '';
    const cmd = lines.map(l => `iptables ${table(l)}${l}`).join('; ');
    const r = cmd ? runShell(cmd, 20) : { ok:true };
    document.getElementById('scriptLog').textContent = r.ok ? '✓ Restored to the last snapshot.' : ('Restore failed: '+r.stderr);
  });
});

// ---- wipe all root rules ----
document.getElementById('btnFlushAll').addEventListener('click', async function(){
  if (!confirm('Remove all VOIDWALL rules (LAN, port forwards, script-console additions)?')) return;
  await withBusy(this, async () => {
    const cmd = [
      'iptables -D OUTPUT -j VOIDWALL 2>/dev/null', 'iptables -F VOIDWALL 2>/dev/null', 'iptables -X VOIDWALL 2>/dev/null',
      'iptables -D INPUT -j VOIDWALL_IN 2>/dev/null', 'iptables -F VOIDWALL_IN 2>/dev/null', 'iptables -X VOIDWALL_IN 2>/dev/null',
      'iptables -t nat -D PREROUTING -j VOIDWALL_NAT 2>/dev/null', 'iptables -t nat -F VOIDWALL_NAT 2>/dev/null', 'iptables -t nat -X VOIDWALL_NAT 2>/dev/null',
      'ip6tables -D OUTPUT -j VOIDWALL6 2>/dev/null', 'ip6tables -F VOIDWALL6 2>/dev/null', 'ip6tables -X VOIDWALL6 2>/dev/null',
      'ip6tables -D INPUT -j VOIDWALL6_IN 2>/dev/null', 'ip6tables -F VOIDWALL6_IN 2>/dev/null', 'ip6tables -X VOIDWALL6_IN 2>/dev/null',
      'echo done',
    ].join('; ');
    runShell(cmd, 20);
    alert('All VOIDWALL root rules have been removed.');
  });
});

// ===================== RECIPES LIBRARY =====================
const RECIPES = [
  // ---------- VPN ----------
  {
    id: 'kill-switch-vpn', cat: 'vpn', risk: 'caution',
    title: 'VPN Kill Switch', desc: 'If the VPN drops, no traffic escapes through any other interface — zero leaks.',
    inputs: [{k:'iface', label:'VPN interface (usually tun0)', def:'tun0'}],
    cmd: t => `iptables -A VOIDWALL -o ${t.iface} -j RETURN; iptables -A VOIDWALL -o lo -j RETURN; iptables -A VOIDWALL -j DROP`,
  },
  {
    id: 'kill-switch-vpn6', cat: 'vpn', risk: 'caution',
    title: 'VPN Kill Switch (IPv6)', desc: 'Same kill switch for IPv6 — without this, IPv6 traffic can bypass an IPv4-only kill switch entirely.',
    inputs: [{k:'iface', label:'VPN interface (usually tun0)', def:'tun0'}],
    cmd: t => `ip6tables -A VOIDWALL6 -o ${t.iface} -j RETURN; ip6tables -A VOIDWALL6 -o lo -j RETURN; ip6tables -A VOIDWALL6 -j DROP`,
  },
  {
    id: 'vpn-lan-still-works', cat: 'vpn', risk: 'caution',
    title: 'Kill switch that still allows local LAN', desc: 'Like the VPN kill switch, but keeps access to your home/office subnet (printers, NAS, smart home) even when the VPN is down.',
    inputs: [{k:'iface', label:'VPN interface (usually tun0)', def:'tun0'}, {k:'subnet', label:'LAN subnet (CIDR)', def:'192.168.1.0/24'}],
    cmd: t => `iptables -A VOIDWALL -o ${t.iface} -j RETURN; iptables -A VOIDWALL -o lo -j RETURN; iptables -A VOIDWALL -d ${t.subnet} -j RETURN; iptables -A VOIDWALL -j DROP`,
  },

  // ---------- BLOCK ----------
  {
    id: 'block-port-tcp', cat: 'block', risk: 'safe',
    title: 'Block an outgoing TCP port', desc: 'E.g. block port 25 (SMTP) or any other port from the device itself.',
    inputs: [{k:'port', label:'Port number', def:'25'}],
    cmd: t => `iptables -A VOIDWALL -p tcp --dport ${t.port} -j DROP`,
  },
  {
    id: 'block-port-udp', cat: 'block', risk: 'safe',
    title: 'Block an outgoing UDP port', desc: '', inputs: [{k:'port', label:'Port number', def:'53'}],
    cmd: t => `iptables -A VOIDWALL -p udp --dport ${t.port} -j DROP`,
  },
  {
    id: 'block-port-range-tcp', cat: 'block', risk: 'safe',
    title: 'Block a range of outgoing TCP ports', desc: 'E.g. 6000:6010 blocks every port from 6000 to 6010 inclusive.',
    inputs: [{k:'range', label:'Port range (start:end)', def:'6000:6010'}],
    cmd: t => `iptables -A VOIDWALL -p tcp --dport ${t.range} -j DROP`,
  },
  {
    id: 'block-ports-list-tcp', cat: 'block', risk: 'safe',
    title: 'Block a list of outgoing TCP ports', desc: 'Comma-separated, e.g. 25,465,587 blocks several mail ports at once.',
    inputs: [{k:'ports', label:'Ports (comma-separated, max 15)', def:'25,465,587'}],
    cmd: t => `iptables -A VOIDWALL -p tcp -m multiport --dports ${t.ports} -j DROP`,
  },
  {
    id: 'block-ip-cidr', cat: 'block', risk: 'caution',
    title: 'Block an IP or CIDR range', desc: 'Fully block a specific server or IP range, both directions.',
    inputs: [{k:'cidr', label:'IP or CIDR', def:'203.0.113.0/24'}],
    cmd: t => `iptables -A VOIDWALL -d ${t.cidr} -j DROP; iptables -A VOIDWALL_IN -s ${t.cidr} -j DROP`,
  },
  {
    id: 'block-ip-list', cat: 'block', risk: 'caution',
    title: 'Block a list of IPs', desc: 'Comma-separated IPs or CIDRs, blocked outbound only (up to 15).',
    inputs: [{k:'ips', label:'IPs (comma-separated, max 15)', def:'203.0.113.10,203.0.113.11'}],
    cmd: t => t.ips.split(',').slice(0, 15).map(ip => `iptables -A VOIDWALL -d ${ip} -j DROP`).join('; '),
  },
  {
    id: 'block-app-uid', cat: 'block', risk: 'caution',
    title: 'Block outbound traffic for a specific app UID', desc: 'Root-level equivalent of Chain 3 blocking, by UID instead of package — useful on Android versions where Chain 3 is unavailable. Find the UID on the App Rules tab.',
    inputs: [{k:'uid', label:'App UID', def:'10123'}],
    cmd: t => `iptables -A VOIDWALL -m owner --uid-owner ${t.uid} -j DROP`,
  },
  {
    id: 'block-quic', cat: 'block', risk: 'caution',
    title: 'Block QUIC (UDP 443)', desc: 'Forces browsers/apps that prefer HTTP/3-over-QUIC back onto regular TCP HTTPS, which some content filters and monitoring tools can no longer see with QUIC enabled.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p udp --dport 443 -j DROP`,
  },
  {
    id: 'block-icmp-out', cat: 'block', risk: 'safe',
    title: 'Block outgoing ping (ICMP echo)', desc: 'Stops the device from pinging other hosts. Some captive portals and network diagnostics may misbehave.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p icmp --icmp-type echo-request -j DROP`,
  },
  {
    id: 'block-broadcast', cat: 'block', risk: 'caution',
    title: 'Drop outgoing broadcast traffic', desc: 'Blocks packets sent to the network broadcast address. Can break some LAN discovery features (casting, printers).',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -d 255.255.255.255 -j DROP`,
  },
  {
    id: 'reject-instead-of-drop', cat: 'block', risk: 'caution',
    title: 'Reject a port instead of silently dropping it', desc: 'Sends an explicit "connection refused" instead of a silent timeout — apps fail faster instead of hanging, at the cost of confirming to a prober that the device exists.',
    inputs: [{k:'port', label:'TCP port', def:'8080'}],
    cmd: t => `iptables -A VOIDWALL -p tcp --dport ${t.port} -j REJECT --reject-with tcp-reset`,
  },

  // ---------- DNS ----------
  {
    id: 'force-dns', cat: 'dns', risk: 'safe',
    title: 'Force DNS to a specific server', desc: 'Redirects all DNS queries (port 53) to this server, regardless of what the system requested.',
    inputs: [{k:'dns', label:'DNS server IP', def:'1.1.1.1'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p udp --dport 53 -j DNAT --to-destination ${t.dns}:53; ` +
              `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 53 -j DNAT --to-destination ${t.dns}:53`,
  },
  {
    id: 'block-dot', cat: 'dns', risk: 'safe',
    title: 'Block DNS-over-TLS (port 853)', desc: 'Forces apps that try to bypass system DNS via DoT back onto the system resolver.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p tcp --dport 853 -j DROP`,
  },
  {
    id: 'block-mdns', cat: 'dns', risk: 'safe',
    title: 'Block mDNS (port 5353)', desc: 'Stops local network service discovery (Bonjour/Chromecast-style) from announcing this device or resolving .local names.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -p udp --dport 5353 -j DROP; iptables -A VOIDWALL -p udp --dport 5353 -j DROP`,
  },
  {
    id: 'block-ntp', cat: 'dns', risk: 'safe',
    title: 'Block NTP (port 123)', desc: 'Stops the device reaching out to time servers — a minor, rarely-used fingerprinting/tracking vector. May cause clock drift over time.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p udp --dport 123 -j DROP`,
  },
  {
    id: 'dns-leak-block-others', cat: 'dns', risk: 'caution',
    title: 'Force DNS + block any other DNS attempt', desc: 'Redirects DNS to your chosen server, and additionally drops (rather than redirects) any DNS packet aimed at a different port-53 destination that slips past the redirect — the strictest anti-leak option.',
    inputs: [{k:'dns', label:'DNS server IP', def:'1.1.1.1'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p udp --dport 53 -j DNAT --to-destination ${t.dns}:53; ` +
              `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 53 -j DNAT --to-destination ${t.dns}:53; ` +
              `iptables -A VOIDWALL -p udp --dport 53 ! -d ${t.dns} -j DROP; iptables -A VOIDWALL -p tcp --dport 53 ! -d ${t.dns} -j DROP`,
  },

  // ---------- PROTECT ----------
  {
    id: 'syn-flood', cat: 'protect', risk: 'safe',
    title: 'Rate-limit new connections (anti SYN-flood)', desc: 'Throttles a flood of new connection attempts — mainly useful while hotspotting.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -p tcp --syn -m limit --limit 20/second --limit-burst 40 -j RETURN; iptables -A VOIDWALL_IN -p tcp --syn -j DROP`,
  },
  {
    id: 'block-ping', cat: 'protect', risk: 'safe',
    title: 'Block incoming ping (ICMP)', desc: 'The device stops responding to ping requests from outside.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -p icmp --icmp-type echo-request -j DROP`,
  },
  {
    id: 'drop-invalid', cat: 'protect', risk: 'safe',
    title: 'Drop invalid packets', desc: 'Standard hardening — rejects packets the kernel\'s connection tracker cannot classify, a common sign of malformed or spoofed traffic.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -m state --state INVALID -j DROP`,
  },
  {
    id: 'drop-null-xmas-scan', cat: 'protect', risk: 'safe',
    title: 'Drop NULL and XMAS scan probes', desc: 'Blocks two classic port-scanning techniques (packets with no flags set, or with an unusual combination of flags all set).',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -p tcp --tcp-flags ALL NONE -j DROP; iptables -A VOIDWALL_IN -p tcp --tcp-flags ALL ALL -j DROP`,
  },
  {
    id: 'drop-fragments', cat: 'protect', risk: 'caution',
    title: 'Drop fragmented packets', desc: 'Blocks IP fragments, sometimes used to smuggle traffic past simple filters. Can break some older or unusual network setups.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL_IN -f -j DROP`,
  },
  {
    id: 'limit-conn-per-ip', cat: 'protect', risk: 'caution',
    title: 'Limit simultaneous connections from one LAN device', desc: 'Caps how many connections a single hotspot client can hold open at once — useful against a misbehaving or abusive device on your hotspot.',
    inputs: [{k:'max', label:'Max connections', def:'50'}],
    cmd: t => `iptables -A FORWARD -p tcp -m connlimit --connlimit-above ${t.max} --connlimit-mask 32 -j REJECT --reject-with tcp-reset`,
  },
  {
    id: 'strict-lockdown', cat: 'protect', risk: 'danger',
    title: 'Full lockdown — DNS + web only', desc: '⚠️ Blocks everything except DNS and port 80/443. High risk — may break many apps.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p udp --dport 53 -j RETURN; iptables -A VOIDWALL -p tcp --dport 53 -j RETURN; ` +
               `iptables -A VOIDWALL -p tcp --dport 80 -j RETURN; iptables -A VOIDWALL -p tcp --dport 443 -j RETURN; ` +
               `iptables -A VOIDWALL -o lo -j RETURN; iptables -A VOIDWALL -j DROP`,
  },
  {
    id: 'time-window-block', cat: 'protect', risk: 'caution',
    title: 'Block a port only during a time window', desc: 'E.g. block port 80 from 23:00 to 06:00 (device local time) — useful for a personal downtime/focus schedule. Requires the kernel\'s xt_time module.',
    inputs: [{k:'port', label:'TCP port', def:'80'}, {k:'from', label:'Start (HH:MM)', def:'23:00'}, {k:'to', label:'End (HH:MM)', def:'06:00'}],
    cmd: t => `iptables -A VOIDWALL -p tcp --dport ${t.port} -m time --timestart ${t.from} --timestop ${t.to} -j DROP`,
  },

  // ---------- PROXY ----------
  {
    id: 'redirect-local', cat: 'proxy', risk: 'caution',
    title: 'Transparent redirect to a local proxy', desc: 'Routes all outgoing port 80/443 traffic into a local proxy/SOCKS listener.',
    inputs: [{k:'targetport', label:'Local proxy port', def:'12345'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 80 -j REDIRECT --to-port ${t.targetport}; ` +
              `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 443 -j REDIRECT --to-port ${t.targetport}`,
  },
  {
    id: 'redirect-app-only', cat: 'proxy', risk: 'caution',
    title: 'Redirect only one app\'s traffic to a local proxy', desc: 'Same transparent redirect, scoped to a single app by UID so the rest of the device is unaffected. Find the UID on the App Rules tab.',
    inputs: [{k:'uid', label:'App UID', def:'10123'}, {k:'targetport', label:'Local proxy port', def:'12345'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p tcp -m owner --uid-owner ${t.uid} --dport 80 -j REDIRECT --to-port ${t.targetport}; ` +
              `iptables -t nat -A VOIDWALL_NAT -p tcp -m owner --uid-owner ${t.uid} --dport 443 -j REDIRECT --to-port ${t.targetport}`,
  },

  // ---------- LAN ----------
  {
    id: 'lan-isolate-mac', cat: 'lan', risk: 'caution',
    title: 'Isolate a device by MAC (while hotspotting)', desc: 'That device gets neither internet nor access to other devices on the network.',
    inputs: [{k:'mac', label:'MAC address', def:'AA:BB:CC:DD:EE:FF'}],
    cmd: t => `iptables -I FORWARD -m mac --mac-source ${t.mac} -j DROP`,
  },
  {
    id: 'lan-block-internet-only', cat: 'lan', risk: 'caution',
    title: 'Cut internet but keep LAN access', desc: 'For local devices (printers etc.) that should stay on the local network only.',
    inputs: [{k:'ip', label:'Device IP', def:'192.168.43.10'}, {k:'wan', label:'Internet interface (often rmnet_data0 or wlan0)', def:'rmnet_data0'}],
    cmd: t => `iptables -I FORWARD -s ${t.ip} -o ${t.wan} -j DROP`,
  },
  {
    id: 'lan-client-isolation', cat: 'lan', risk: 'caution',
    title: 'Hotspot client isolation', desc: 'Clients on your hotspot can reach the internet but not each other — the same protection public Wi-Fi networks use.',
    inputs: [{k:'subnet', label:'Hotspot subnet (CIDR)', def:'192.168.43.0/24'}],
    cmd: t => `iptables -I FORWARD -s ${t.subnet} -d ${t.subnet} -j DROP`,
  },
  {
    id: 'lan-allowlist-only', cat: 'lan', risk: 'danger',
    title: 'Only allow specific LAN devices online', desc: '⚠️ Default-deny for hotspot clients: every device is blocked from the internet except the ones you allow. Add an ACCEPT rule per allowed IP first, or every client loses access.',
    inputs: [{k:'allowedIp', label:'First allowed device IP', def:'192.168.43.10'}, {k:'wan', label:'Internet interface', def:'rmnet_data0'}],
    cmd: t => `iptables -I FORWARD -s ${t.allowedIp} -o ${t.wan} -j ACCEPT; iptables -A FORWARD -o ${t.wan} -j DROP`,
  },
  {
    id: 'throttle-bandwidth', cat: 'lan', risk: 'danger',
    title: 'Throttle bandwidth on an interface (tc)', desc: 'Cap speed for everyone while hotspotting. Requires kernel tc/HTB support — not every device has it.',
    inputs: [{k:'iface', label:'Interface (e.g. wlan0)', def:'wlan0'}, {k:'rate', label:'Speed cap', def:'2mbit'}],
    cmd: t => `tc qdisc add dev ${t.iface} root tbf rate ${t.rate} burst 32kbit latency 400ms`,
  },
  {
    id: 'throttle-device', cat: 'lan', risk: 'danger',
    title: 'Throttle a single hotspot device (tc + filter)', desc: 'Caps the speed of one client IP instead of the whole interface. Requires kernel tc/HTB support.',
    inputs: [{k:'iface', label:'Interface (e.g. wlan0)', def:'wlan0'}, {k:'ip', label:'Device IP', def:'192.168.43.10'}, {k:'rate', label:'Speed cap', def:'1mbit'}],
    cmd: t => `tc qdisc add dev ${t.iface} root handle 1: htb default 30; tc class add dev ${t.iface} parent 1: classid 1:1 htb rate 100mbit; ` +
              `tc class add dev ${t.iface} parent 1:1 classid 1:10 htb rate ${t.rate}; ` +
              `tc filter add dev ${t.iface} protocol ip parent 1:0 prio 1 u32 match ip dst ${t.ip}/32 flowid 1:10`,
  },

  // ---------- NAT / PORT FORWARDING ----------
  {
    id: 'port-forward-tcp', cat: 'nat', risk: 'caution',
    title: 'Forward an incoming TCP port', desc: 'Routes an incoming connection on this device to another IP:port on the LAN — only meaningful while hotspot/tethering is active.',
    inputs: [{k:'port', label:'Incoming port', def:'8080'}, {k:'dest', label:'Destination IP', def:'192.168.43.10'}, {k:'destport', label:'Destination port', def:'80'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p tcp --dport ${t.port} -j DNAT --to-destination ${t.dest}:${t.destport}; iptables -A FORWARD -j ACCEPT`,
  },
  {
    id: 'port-forward-udp', cat: 'nat', risk: 'caution',
    title: 'Forward an incoming UDP port', desc: 'Same as the TCP version, for UDP-based services (game servers, some VoIP).',
    inputs: [{k:'port', label:'Incoming port', def:'27015'}, {k:'dest', label:'Destination IP', def:'192.168.43.10'}, {k:'destport', label:'Destination port', def:'27015'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p udp --dport ${t.port} -j DNAT --to-destination ${t.dest}:${t.destport}; iptables -A FORWARD -j ACCEPT`,
  },
  {
    id: 'dmz-forward', cat: 'nat', risk: 'danger',
    title: 'DMZ — forward every incoming port to one device', desc: '⚠️ Exposes one LAN device to everything reaching this device from outside. Only use for a device and threat model you fully understand.',
    inputs: [{k:'dest', label:'Destination IP', def:'192.168.43.10'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -j DNAT --to-destination ${t.dest}; iptables -A FORWARD -j ACCEPT`,
  },

  // ---------- IPv6 ----------
  {
    id: 'block-ipv6-all', cat: 'ipv6', risk: 'caution',
    title: 'Block all IPv6 traffic', desc: 'The most common IPv6 leak fix: many VPN apps only tunnel IPv4, silently leaking IPv6 traffic outside the tunnel. This blocks IPv6 outright. No effect on devices without IPv6 connectivity.',
    inputs: [],
    cmd: () => `ip6tables -A VOIDWALL6 -o lo -j RETURN; ip6tables -A VOIDWALL6 -j DROP`,
  },
  {
    id: 'block-ipv6-in', cat: 'ipv6', risk: 'safe',
    title: 'Block incoming IPv6 connections', desc: 'Keeps outgoing IPv6 working but refuses unsolicited incoming IPv6 connections — a reasonable default on most networks.',
    inputs: [],
    cmd: () => `ip6tables -A VOIDWALL6_IN -m state --state NEW -j DROP`,
  },
  {
    id: 'block-icmp6-redirect', cat: 'ipv6', risk: 'safe',
    title: 'Ignore ICMPv6 redirects', desc: 'Blocks a class of IPv6 traffic-redirection packets sometimes used in local-network attacks.',
    inputs: [],
    cmd: () => `ip6tables -A VOIDWALL6_IN -p icmpv6 --icmpv6-type redirect -j DROP`,
  },

  // ---------- MONITOR / DEBUG ----------
  {
    id: 'log-dropped', cat: 'monitor', risk: 'safe',
    title: 'Log dropped packets', desc: 'For debugging — check with logcat or dmesg.',
    inputs: [],
    cmd: () => `iptables -I VOIDWALL 1 -j LOG --log-prefix "VOIDWALL-DROP: " --log-level 4`,
  },
  {
    id: 'log-app-traffic', cat: 'monitor', risk: 'safe',
    title: 'Log all traffic from one app UID', desc: 'Every packet from this UID is logged (without being blocked) — useful to see what an app actually talks to. Find the UID on the App Rules tab.',
    inputs: [{k:'uid', label:'App UID', def:'10123'}],
    cmd: t => `iptables -I VOIDWALL 1 -m owner --uid-owner ${t.uid} -j LOG --log-prefix "VOIDWALL-UID-${t.uid}: " --log-level 4`,
  },
  {
    id: 'count-only', cat: 'monitor', risk: 'safe',
    title: 'Count matching packets without blocking them', desc: 'Adds a counter-only rule (RETURN) so you can watch how often a condition would match via "iptables -L VOIDWALL -v", before committing to actually blocking it.',
    inputs: [{k:'port', label:'TCP port to watch', def:'443'}],
    cmd: t => `iptables -A VOIDWALL -p tcp --dport ${t.port} -j RETURN`,
  },
];

const RECIPE_CATS = [
  {id:'all', label:'All'}, {id:'vpn', label:'VPN'}, {id:'block', label:'Block'}, {id:'dns', label:'DNS'},
  {id:'protect', label:'Protect'}, {id:'proxy', label:'Proxy'}, {id:'lan', label:'LAN'}, {id:'nat', label:'Port Forward'},
  {id:'ipv6', label:'IPv6'}, {id:'monitor', label:'Monitor'},
];
let recipeCat = 'all';
const RECIPE_PARAM_RE = /^[A-Za-z0-9_.:,\/-]{1,64}$/;   // recipe inputs end up inside shell commands

function initRecipeTabs(){
  const wrap = document.getElementById('recipeCatTabs');
  wrap.innerHTML = RECIPE_CATS.map(c => `<button class="tab2 ${c.id==='all'?'active':''}" data-cat="${c.id}">${c.label}</button>`).join('');
  wrap.querySelectorAll('.tab2').forEach(t => t.addEventListener('click', () => {
    wrap.querySelectorAll('.tab2').forEach(x=>x.classList.remove('active'));
    t.classList.add('active'); recipeCat = t.dataset.cat; renderRecipes();
  }));
}
document.getElementById('recipeSearch').addEventListener('input', renderRecipes);

function renderRecipes(){
  const q = document.getElementById('recipeSearch').value.trim().toLowerCase();
  const list = RECIPES.filter(r => (recipeCat==='all' || r.cat===recipeCat) &&
    (!q || r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)));
  const wrap = document.getElementById('recipeList');
  wrap.innerHTML = list.map(r => `
    <div class="recipe-card" data-id="${r.id}">
      <div class="recipe-head"><h4>${esc(r.title)}</h4><span class="risk-badge ${r.risk}">${r.risk.toUpperCase()}</span></div>
      <p class="recipe-desc">${esc(r.desc)}</p>
      <div class="recipe-inputs">
        ${r.inputs.map(inp => `<div><label>${esc(inp.label)}</label><input type="text" data-key="${inp.k}" value="${esc(inp.def)}"></div>`).join('')}
      </div>
      <div class="recipe-cmd-preview" data-preview></div>
      <div class="row">
        <button class="btn-ghost" data-act="preview">👁️ Preview</button>
        <button class="btn-danger" data-act="apply" disabled>▶ Apply</button>
      </div>
    </div>
  `).join('') || '<div class="empty-note"><span class="big">No matches</span></div>';

  wrap.querySelectorAll('.recipe-card').forEach(card => {
    const recipe = RECIPES.find(r => r.id === card.dataset.id);
    const getVals = () => {
      const vals = {};
      card.querySelectorAll('input[data-key]').forEach(inp => { vals[inp.dataset.key] = inp.value.trim(); });
      return vals;
    };
    card.querySelector('[data-act="preview"]').addEventListener('click', () => {
      const vals = getVals();
      const bad = Object.keys(vals).find(k => !RECIPE_PARAM_RE.test(vals[k]));
      if (bad) { alert('Invalid value for "' + bad + '". Allowed: letters, digits and . : / _ - (max 64 characters).'); return; }
      const cmdStr = recipe.cmd(vals);
      card.querySelector('[data-preview]').textContent = cmdStr;
      card.querySelector('[data-act="apply"]').disabled = false;
      card.querySelector('[data-act="apply"]').dataset.cmd = cmdStr;
    });
    card.querySelector('[data-act="apply"]').addEventListener('click', async function(){
      const cmdStr = this.dataset.cmd;
      let ok = confirm('Run this command?\n\n' + cmdStr);
      if (ok && recipe.risk === 'danger') {
        const typed = prompt('This is a high-risk command. Type to confirm: RUN VOIDWALL');
        ok = typed === 'RUN VOIDWALL';
      }
      if (!ok) return;
      await withBusy(this, async () => {
        ensureChains();
        snapshotChains();
        const r = runShell(cmdStr, 20);
        alert(r.ok ? '✓ Applied (use Undo in the Script Console to revert)' : ('Error: '+r.stderr));
      });
    });
  });
}

// ===================== IMPORT / EXPORT =====================
document.getElementById('btnExport').addEventListener('click', function(){
  const blocked = loadBlockedList();
  const bg = runShell('cmd netpolicy list restrict-background-blacklist 2>/dev/null', 15);
  const bgUids = (bg.stdout||'').split('\n').map(l => (l.match(/\d+/)||[])[0]).filter(Boolean);
  const data = { version:1, exportedAt: new Date().toISOString(), blockedPackages: blocked, bgRestrictedUids: bgUids };
  const box = document.getElementById('exportOutput');
  box.style.display = 'block';
  box.value = JSON.stringify(data, null, 2);
});

document.getElementById('btnImport').addEventListener('click', async function(){
  await withBusy(this, async () => {
    const log = document.getElementById('importLog');
    let data;
    try { data = JSON.parse(document.getElementById('importInput').value); }
    catch(e){ log.textContent = 'Error: invalid JSON — ' + e.message; return; }

    const blocked = loadBlockedList();
    let appliedBlock = 0, skippedCritical = 0;
    (data.blockedPackages || data.blocked || []).forEach(pkg => {
      if (isCritical(pkg)) { skippedCritical++; return; }
      if (chain3Supported) runShell(`cmd connectivity set-package-networking-enabled false ${shQuote(pkg)}`, 15);
      if (!blocked.includes(pkg)) blocked.push(pkg);
      appliedBlock++;
    });
    saveBlockedList(blocked);

    let appliedBg = 0;
    (data.bgRestrictedUids || []).forEach(uid => {
      runShell(`cmd netpolicy add restrict-background-blacklist ${shQuote(uid)}`, 15);
      appliedBg++;
    });

    log.textContent = `✓ ${appliedBlock} full blocks applied, ${appliedBg} background restrictions applied` +
      (skippedCritical ? `, ${skippedCritical} critical package(s) skipped for safety` : '');
  });
});

// ===================== INIT =====================
(function init(){
  try {
    if (checkBridge()) {
      checkRoot();
      checkChain3();
      refreshDashboard();
      initRecipeTabs();
      const r = runShell('pm list packages 2>/dev/null | grep -i shevery | sed "s/^package://" | head -1', 10);
      if (r.ok && (r.stdout||'').trim()) SHEVERY_PKG = r.stdout.trim();
    }
  } catch(e) {
    console.error('VOID//WALL init failed:', e);
    const s = document.getElementById('bridgeStatus');
    if (s) { s.textContent = 'init error: ' + e.message; s.className = 'pill bad'; }
  }
})();
