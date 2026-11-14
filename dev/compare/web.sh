#!/usr/bin/env bash
# Runs the web scenarios on webkit, firefox and chromium: dev/compare/web.sh <out-dir> [scenario...].
# Needs the web build on Vite (:1430) with VITE_DEV_STREAMLINE=http://localhost:8098, which is the contract proxy this
# script starts in front of a fresh mock (:8081) for every scenario, with the mock flags the scenario exports as mockArgs.
# A scenario that exports ownServer = true serves its own build (web-base on :1450) and skips that check.
# A scenario with target "desktop" runs on the desktop build instead (Vite on :1440, task dev:desktop-web), which reaches the
# mock through bridge.py (:8099), started here.
# A scenario that exports engine = true plays real media: the engine must answer on :8097 and the mock hands out
# http://127.0.0.1:8097 as the public URL.
# ENGINES="firefox" limits the engines run.
# Exits 1 when a scenario failed or the proxy reported an exchange off docs/contract/player.openapi.yaml.
set -u
cd "$(dirname "$0")/../.."
out=$1
shift
scenarios=${*:-web-shell web-signin web-sso-bad web-tabs web-idle web-revoked web-home web-empty web-noart web-library web-detail web-watched web-missing desk-home desk-empty desk-noart desk-library desk-detail desk-watched desk-missing web-search web-person web-activity web-activity-nodl desk-activity desk-activity-empty desk-activity-errors desk-activity-realclock desk-ask desk-server web-server web-server-member desk-server-readonly desk-server-actions web-server-actions desk-server-errors desk-server-restart desk-server-restart-hang desk-search desk-person web-settings web-account-refused desk-settings desk-account-refused desk-welcome desk-pair-expired desk-pair-denied desk-pair-unreachable desk-pair-realclock web-approve web-approve-denied web-approve-bad-code web-approve-signed-out desk-player desk-player-keys desk-player-ended desk-player-real desk-player-trickplay desk-player-trickplay-scope desk-player-menus desk-player-halts desk-mini web-play-real web-server-stop-real web-play-subtitle web-play-subtitle-refused web-trickplay-real web-play-reload web-play-drop web-mini-real web-player web-mini desk-downloads desk-downloads-gone desk-downloads-activity desk-downloads-empty desk-downloads-errors desk-downloads-realclock desk-download-start desk-download-show desk-download-library desk-download-playing desk-download-settings web-no-downloads}
tmp=${MEDIA_DIR:-/tmp/streamline-player}
[ -f "$tmp/multi.mkv" ] || dev/compare/make-multi.sh "$tmp" || exit 1
[ -f "$tmp/long.mkv" ] || dev/compare/make-long.sh "$tmp" || exit 1
rm -rf "$out"
status=0
for s in $scenarios; do
  scenario_target=$(node -e "import('./dev/compare/scenarios/$s.mjs').then((m) => process.stdout.write(m.target ?? 'tv'))")
  own_server=$(node -e "import('./dev/compare/scenarios/$s.mjs').then((m) => process.stdout.write(m.ownServer ? 'yes' : ''))")
  case $scenario_target in
    desktop) vite=1440 ;;
    web) vite=1430 ;;
    *) echo "$s: target $scenario_target is not run by web.sh" >&2; status=1; continue ;;
  esac
  if [ -z "$own_server" ] && ! curl -s "localhost:$vite/src/lib/platform/target.ts" | grep -q TAURI_ENV_PLATFORM; then
    echo "$s: Vite on :$vite is not up. Start it with: task dev:$([ $vite = 1440 ] && echo desktop-web || echo web)" >&2
    status=1
    continue
  fi
  needs_engine=$(node -e "import('./dev/compare/scenarios/$s.mjs').then((m) => process.stdout.write(m.engine ? 'yes' : ''))")
  public=()
  if [ -n "$needs_engine" ]; then
    if ! curl -s -o /dev/null localhost:8097/v1/health; then
      echo "$s: the engine is not up on :8097. Start it with: task dev:engine" >&2
      status=1
      continue
    fi
    public=(--public http://127.0.0.1:8097)
  fi
  mapfile -t flags < <(node -e "import('./dev/compare/scenarios/$s.mjs').then((m) => process.stdout.write((m.mockArgs ?? []).join('\n')))")
  for engine in ${ENGINES:-webkit firefox chromium}; do
    # One retry on a fresh mock, said out loud: this machine's disk stalls for minutes at a time (the kernel logs
    # "waiting for writeback completion") and a browser launched during one times out. A real fault fails both times.
    for attempt in 1 2; do
      python3 dev/mock-streamline.py --listen 127.0.0.1:8081 --secret dev-secret-0123456789abcdef --now 1794225600 \
        --art "$tmp/art" --clip "$tmp/h.mkv" "${public[@]}" "${flags[@]}" >"$tmp/mock-web-$s-$engine.log" 2>&1 &
      mock=$!
      report=$tmp/contract-web-$s-$engine.jsonl
      rm -f "$report"
      node dev/contract/proxy.ts --listen 127.0.0.1:8098 --upstream http://127.0.0.1:8081 \
        --spec docs/contract/player.openapi.yaml --report "$report" >"$tmp/proxy-web-$s-$engine.log" 2>&1 &
      proxy=$!
      bridge=
      if [ "$scenario_target" = desktop ]; then
        python3 dev/compare/bridge.py >"$tmp/bridge-web-$s-$engine.log" 2>&1 &
        bridge=$!
      fi
      sleep 2
      echo "== $s ($engine)"
      SHOTS=$out timeout 150 node dev/compare/walk.mjs "$engine" "$s"
      walked=$?
      kill $mock $proxy $bridge
      # The killed mock can no longer reap the sessions a closed tab left, and each one holds a conversion slot.
      [ -n "$needs_engine" ] && python3 - <<'PY'
import json, sys, urllib.request
head = {"Authorization": "Bearer dev-secret-0123456789abcdef"}
call = lambda method, path: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8097" + path, method=method, headers=head))
for s in json.load(call("GET", "/v1/sessions"))["sessions"]:
    call("DELETE", "/v1/sessions/" + s["session_id"])
PY
      wait $mock $proxy $bridge 2>/dev/null
      [ $walked = 0 ] && break
      if [ $attempt = 1 ]; then
        echo "RETRY: $s on $engine failed once; $(grep -E '^(Dirty|Writeback):' /proc/meminfo | tr -s ' \n' ' ')"
      else
        echo "FAILED: $s on $engine"
        status=1
      fi
    done
    if [ -s "$report" ]; then
      echo "== contract violations ($s, $engine)"
      cat "$report"
      status=1
    fi
  done
done
exit $status
