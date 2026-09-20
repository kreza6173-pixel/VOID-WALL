# Changelog

## 1.2

### Added
- **Data Usage ranges** — since last boot, last 24 hours, all recorded history, or since the last full charge (battery stats). Usage is split into mobile, Wi-Fi and VPN-tunnel traffic.
- **Battery-stats fallback** for devices whose `dumpsys netstats` has no per-app data, plus an on-screen diagnostics summary when nothing can be read.
- **In-app model picker** with filter box and per-provider cache, and a themed **provider picker** (replaces the native `<datalist>` / `<select>` popups that misbehave in Android WebViews).
- **Friendly provider errors** (no credit, invalid key, unknown model, rate limit, overload) and automatic retry on temporary 502/503/529 responses.
- **On-screen script error bar** and a build check that warns when `index.html`, `wall.js` and `ai.js` come from different versions.

### Fixed
- Data Usage returned nothing on current Android versions: `dumpsys netstats` prints the UID and its time buckets on separate lines, and the output is far larger than the bridge's per-call limit. Aggregation now runs on the device and only one short line per app is returned.
- Model list showing only a few entries, a frozen popup and ghost text after choosing a model.
- Stale cached scripts after an update (scripts are now versioned).

## 1.1

- Optional bring-your-own-key **AI assistant**: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Mistral, xAI and any OpenAI-compatible / local endpoint. It proposes actions; nothing runs until you tap Apply, and every proposal is re-validated locally.
- Recipe inputs are validated before they are placed into shell commands.
- Detection and guidance for Shevery's internet gate (module must be trusted for the assistant to reach the network).
- README screenshots and layout.

## 1.0

- Initial release: Chain 3 per-app blocking, background-data restriction, data usage monitor, root-mode iptables / LAN tools, recipes, JSON import/export and panic button.
