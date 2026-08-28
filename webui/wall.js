// ===================== helpers =====================
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
document.getElementById('btnScanUsage').addEventListener('click', async function(){
  await withBusy(this, async () => {
    showDiag('usageDiag', null);
    const res = runShell('dumpsys netstats detail 2>&1 | grep -oE "uid=[0-9]+.*rb=[0-9]+.*rp=[0-9]+.*tb=[0-9]+.*tp=[0-9]+"', 30);
    if (!res.ok) {
      showDiag('usageDiag', 'dumpsys netstats failed.\nstderr: ' + (res.stderr||'(empty)'));
      document.getElementById('usageResult').innerHTML = '';
      return;
    }
    const totals = {};
    (res.stdout||'').split('\n').forEach(line => {
      const uid = (line.match(/uid=(\d+)/)||[])[1];
      const rb = parseInt((line.match(/rb=(\d+)/)||[])[1] || 0);
      const tb = parseInt((line.match(/tb=(\d+)/)||[])[1] || 0);
      if (!uid) return;
      totals[uid] = (totals[uid]||0) + rb + tb;
    });
    const pkgRes = runShell('pm list packages -U 2>/dev/null', 20);
    const uidToPkg = {};
    (pkgRes.stdout||'').split('\n').forEach(line => {
      const m = line.match(/^package:(\S+)\s+uid:(\d+)/);
      if (m) uidToPkg[m[2]] = m[1];
    });

    const rows = Object.entries(totals)
      .map(([uid, bytes]) => ({ uid, pkg: uidToPkg[uid] || ('uid:'+uid), bytes }))
      .filter(r => r.bytes > 0)
      .sort((a,b) => b.bytes - a.bytes)
      .slice(0, 40);

    const box = document.getElementById('usageResult');
    if (!rows.length) {
      box.innerHTML = '<div class="empty-note"><span class="big">No usage data</span>Nothing recorded since last boot yet.</div>';
      return;
    }
    box.innerHTML = rows.map(r =>
      `<div class="result-row"><span>${esc(r.pkg)}</span><b>${fmtBytes(r.bytes)}</b></div>`
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
  ].join('; ');
  return runShell(cmd, 20);
}

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
      'echo done',
    ].join('; ');
    runShell(cmd, 20);
    alert('All VOIDWALL root rules have been removed.');
  });
});

// ===================== RECIPES LIBRARY =====================
const RECIPES = [
  {
    id: 'kill-switch-vpn', cat: 'vpn', risk: 'caution',
    title: 'VPN Kill Switch', desc: 'If the VPN drops, no traffic escapes through any other interface — zero leaks.',
    inputs: [{k:'iface', label:'VPN interface (usually tun0)', def:'tun0'}],
    cmd: t => `iptables -A VOIDWALL -o ${t.iface} -j RETURN; iptables -A VOIDWALL -o lo -j RETURN; iptables -A VOIDWALL -j DROP`,
  },
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
    id: 'block-ip-cidr', cat: 'block', risk: 'caution',
    title: 'Block an IP or CIDR range', desc: 'Fully block a specific server or IP range.',
    inputs: [{k:'cidr', label:'IP or CIDR', def:'203.0.113.0/24'}],
    cmd: t => `iptables -A VOIDWALL -d ${t.cidr} -j DROP`,
  },
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
    id: 'redirect-local', cat: 'proxy', risk: 'caution',
    title: 'Transparent redirect to a local proxy', desc: 'Routes all outgoing port 80/443 traffic into a local proxy/SOCKS listener.',
    inputs: [{k:'targetport', label:'Local proxy port', def:'12345'}],
    cmd: t => `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 80 -j REDIRECT --to-port ${t.targetport}; ` +
              `iptables -t nat -A VOIDWALL_NAT -p tcp --dport 443 -j REDIRECT --to-port ${t.targetport}`,
  },
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
    id: 'throttle-bandwidth', cat: 'lan', risk: 'danger',
    title: 'Throttle bandwidth on an interface (tc)', desc: 'Cap speed for everyone while hotspotting. Requires kernel tc/HTB support — not every device has it.',
    inputs: [{k:'iface', label:'Interface (e.g. wlan0)', def:'wlan0'}, {k:'rate', label:'Speed cap', def:'2mbit'}],
    cmd: t => `tc qdisc add dev ${t.iface} root tbf rate ${t.rate} burst 32kbit latency 400ms`,
  },
  {
    id: 'log-dropped', cat: 'debug', risk: 'safe',
    title: 'Log dropped packets', desc: 'For debugging — check with logcat or dmesg.',
    inputs: [],
    cmd: () => `iptables -I VOIDWALL 1 -j LOG --log-prefix "VOIDWALL-DROP: " --log-level 4`,
  },
  {
    id: 'strict-lockdown', cat: 'protect', risk: 'danger',
    title: 'Full lockdown — DNS + web only', desc: '⚠️ Blocks everything except DNS and port 80/443. High risk — may break many apps.',
    inputs: [],
    cmd: () => `iptables -A VOIDWALL -p udp --dport 53 -j RETURN; iptables -A VOIDWALL -p tcp --dport 53 -j RETURN; ` +
               `iptables -A VOIDWALL -p tcp --dport 80 -j RETURN; iptables -A VOIDWALL -p tcp --dport 443 -j RETURN; ` +
               `iptables -A VOIDWALL -o lo -j RETURN; iptables -A VOIDWALL -j DROP`,
  },
];
const RECIPE_CATS = [
  {id:'all', label:'All'}, {id:'vpn', label:'VPN'}, {id:'block', label:'Block'}, {id:'dns', label:'DNS'},
  {id:'protect', label:'Protect'}, {id:'proxy', label:'Proxy'}, {id:'lan', label:'LAN'}, {id:'debug', label:'Debug'},
];
let recipeCat = 'all';

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
      const cmdStr = recipe.cmd(getVals());
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
