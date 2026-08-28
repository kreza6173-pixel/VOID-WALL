#!/system/bin/sh
# VOID//WALL — quick action: status only. No rule is applied or removed from here.

echo "== VOID//WALL :: status =="
echo

echo "-- Data Saver background blacklist --"
cmd netpolicy list restrict-background-blacklist 2>/dev/null

echo
echo "-- iptables VOIDWALL chain (root only) --"
if command -v iptables >/dev/null 2>&1; then
  iptables -L VOIDWALL -n --line-numbers 2>/dev/null || echo "(chain does not exist — no root rules active)"
else
  echo "(iptables not available)"
fi

echo
echo "Use the WebUI to manage rules."
