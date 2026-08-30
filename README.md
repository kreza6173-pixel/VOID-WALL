# VOID//WALL

**A modern, root-optional firewall for Android — built as a [Shevery](https://github.com/HmnDev-Tech/shevery) ADB module.**

Block apps at the network level without root, using Android's built-in Chain 3 connectivity firewall. Get real iptables and LAN control when root is available — all from one clean, dark-themed interface.

## Features

- 🧱 **Full per-app blocking without root** — via Android's native Chain 3 API (`cmd connectivity`), Android 11+
- 📉 **Background data restriction** — independent, fine-grained control via `netpolicy`
- 📊 **Per-app data usage monitor** — parsed from `dumpsys netstats`
- 🔓 **Root mode** — real iptables rules, LAN device blocking, port forwarding, and a raw scripting console, all inside a dedicated removable chain
- 📚 **14 ready-made recipes** — VPN kill switch, DNS forcing, SYN-flood protection, bandwidth throttling, device isolation, and more — no need to write iptables from scratch
- 💾 **JSON import/export** of your rule set
- 🚨 **Panic button** — instant Airplane Mode toggle
- 🛡️ **Self-protecting** — the host app and critical system/launcher/keyboard packages can never be blocked, even via import

<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/a27b7d09-50c7-4801-b726-644404a1f53f" />
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/26c3421a-41bd-4398-b6bc-3628b7be23bc" />
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/9c960223-cbc7-4725-9294-997976f1d24f" />
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/8dc8c2cb-0a24-42d4-9c03-5a2819394f38" />

## Requirements

- [Shevery](https://github.com/HmnDev-Tech/shevery) with Shizuku (ADB or root mode)
- Android 11+ for full blocking (Chain 3); older versions fall back to background-only restriction
- Root is optional — only required for the LAN/iptables/scripting features

## Install

1. Download the latest release ZIP
2. In Shevery → ADB Modules → **Install ZIP**
3. Set module access mode to **Full access** (or enable **WebUI shell bridge** in Custom mode)

## Screenshots

*(add screenshots here before publishing)*

## Safety model

| Layer | Reversibility | Gate |
|---|---|---|
| Chain 3 full block | Instant toggle | none |
| Background restriction | Instant toggle | none |
| iptables/LAN/scripting | Snapshot + Undo | explicit root consent + typed confirmation on risky actions |

All root-tier network rules live inside dedicated `VOIDWALL*` iptables chains, never modifying default system chains directly — a one-tap wipe removes everything this module ever added.

## License

MIT — see [LICENSE](LICENSE).
