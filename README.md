# VOID//WALL

**A modern, root-optional firewall for Android — built as a [Shevery](https://github.com/HmnDev-Tech/shevery) ADB module.**

![License: MIT](https://img.shields.io/badge/license-MIT-00e5ff)
![Android 11+](https://img.shields.io/badge/Android-11%2B-4dffb0)
![Root optional](https://img.shields.io/badge/root-optional-8b3cff)

Block apps at the network level without root, using Android's built-in Chain 3 connectivity firewall. Get real iptables and LAN control when root is available — all from one clean, dark-themed interface.

<table>
  <tr>
    <td width="20%"><img src="https://github.com/user-attachments/assets/a27b7d09-50c7-4801-b726-644404a1f53f" alt="VOID//WALL screenshot 1" width="100%"></td>
    <td width="20%"><img src="https://github.com/user-attachments/assets/26c3421a-41bd-4398-b6bc-3628b7be23bc" alt="VOID//WALL screenshot 2" width="100%"></td>
    <td width="20%"><img src="https://github.com/user-attachments/assets/9c960223-cbc7-4725-9294-997976f1d24f" alt="VOID//WALL screenshot 3" width="100%"></td>
    <td width="20%"><img src="https://github.com/user-attachments/assets/8dc8c2cb-0a24-42d4-9c03-5a2819394f38" alt="VOID//WALL screenshot 4" width="100%"></td>
    <td width="20%"><img src="docs/screenshots/ai-assistant.jpg" alt="VOID//WALL AI assistant" width="100%"></td>
  </tr>
</table>

## Features

- 🧱 **Full per-app blocking without root** — via Android's native Chain 3 API (`cmd connectivity`), Android 11+
- 📉 **Background data restriction** — independent, fine-grained control via `netpolicy`
- 📊 **Per-app data usage monitor** — parsed from `dumpsys netstats`
- 🔓 **Root mode** — real iptables rules, LAN device blocking, port forwarding and a raw scripting console, all inside dedicated removable chains
- 📚 **14 ready-made recipes** — VPN kill switch, DNS forcing, SYN-flood protection, bandwidth throttling, device isolation and more
- 🤖 **Optional AI assistant** — bring your own API key (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Mistral, xAI, or any OpenAI-compatible / local endpoint); explains your setup and proposes actions you approve one by one
- 💾 **JSON import/export** of your rule set
- 🚨 **Panic button** — instant Airplane Mode toggle
- 🛡️ **Self-protecting** — the host app and critical system, launcher and keyboard packages can never be blocked, even via import

## Requirements

- [Shevery](https://github.com/HmnDev-Tech/shevery) with Shizuku (ADB or root mode)
- Android 11+ for full blocking (Chain 3); older versions fall back to background-only restriction
- Root is optional — only required for the LAN / iptables / scripting features and the recipe library

## Installation

1. Download the latest release ZIP.
2. In Shevery, open **ADB Modules → Install ZIP** and select the file.
3. Set the module access mode to **Full access**, or enable **WebUI shell bridge** in Custom mode.
4. Open the module's WebUI.

## Usage

| Tab | Purpose |
|---|---|
| **Dashboard** | Chain 3 toggle, status summary, panic button |
| **App Rules** | Scan installed apps, block them fully, or restrict background data only |
| **Data Usage** | Per-app traffic since the last boot |
| **Root Advanced** | LAN blocking, port forwarding, raw script console (root, behind a consent gate) |
| **Recipes** | Parameterised, previewable iptables recipes (root) |
| **AI Assistant** | Chat with your provider of choice about your setup (optional) |
| **Import/Export** | Back up and restore blocked packages and background restrictions as JSON |

The module also ships a quick action (`action.sh`) that prints the current status without changing any rule.

## AI Assistant

The assistant is disabled until you add your own API key in the **AI Assistant** tab. Nothing is sent to any provider before you send a message.

> **Internet access:** Shevery blocks network access inside module WebUIs by default. To use the assistant, long-press the VOID//WALL card in Shevery and tap **Trust** (a *Full Trust* chip appears), then reopen the module. Trusting a module also skips Shevery's own command-confirmation prompts for it, so trust it only if you are comfortable with that; VOID//WALL keeps its own confirmations for risky actions.

- **Providers** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Mistral, xAI, and a *Custom* option for any OpenAI-compatible base URL (Ollama, LM Studio, OpenRouter, your own proxy). **Fetch** lists the models available to your key.
- **You control what is shared** — device status, your blocked list and the last diagnostic are shared by default; the installed-app list, data usage and active root rules are opt-in. **Preview what will be sent** shows the exact context text.
- **Proposals, not commands** — the assistant can suggest actions (block or unblock an app, restrict background data, apply a recipe, send an `iptables` command to the console). Nothing runs until you tap **Apply**. Blocks and background restrictions can be undone from the same card.
- **Local validation** — every proposal is re-checked before it can run: package names and parameters are strictly validated, critical packages cannot be blocked, raw commands are limited to the `VOIDWALL*` chains without shell metacharacters, and root actions still pass the consent gate and the usual confirmations.
- **Per-app shortcut** — the 🤖 button on each app row asks about that specific app.
- **Key storage** — keys are kept in this WebUI's local storage only. Untick *remember key* to keep a key for the current session, or use *Forget all keys* to remove them.

Requests are sent directly from the WebUI to the provider you choose. OpenAI, Anthropic and Gemini accept direct browser calls; for providers that do not, use the *Custom* option with a proxy.

## Safety model

| Layer | Reversibility | Gate |
|---|---|---|
| Chain 3 full block | Instant toggle | none |
| Background restriction | Instant toggle | none |
| iptables / LAN / scripting | Snapshot + Undo | explicit root consent + typed confirmation on risky actions |
| AI-proposed actions | Same as above | explicit **Apply** tap + local validation |

All root-tier network rules live inside dedicated `VOIDWALL*` iptables chains and never modify the default system chains directly — a one-tap wipe removes everything this module has added.

## Repository layout

```
module.prop        Module metadata
action.sh          Status-only quick action
webui/index.html   Interface and styles
webui/wall.js      Firewall logic (Chain 3, netpolicy, iptables, recipes, import/export)
webui/ai.js        Optional AI assistant
docs/screenshots/  Images used in this README
```

## Contributing

Issues and pull requests are welcome. Please keep new features reversible, keep root-only functionality behind the consent gate, and never allow the host app or critical system packages to be blocked.

## Disclaimer

VOID//WALL changes network behaviour through privileged system interfaces. A wrong rule can cut connectivity, including your own ADB connection. You use it at your own risk.

## License

MIT — see [LICENSE](LICENSE).
