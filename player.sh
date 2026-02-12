#!/usr/bin/env bash
set -euo pipefail

: "${FREEBOARD_PLAYER_URL:?FREEBOARD_PLAYER_URL is required}"

CURRENT_USER="$(id -un)"
TARGET_USER="${FREEBOARD_USER:-$CURRENT_USER}"

until curl --output /dev/null --silent --head --fail "$FREEBOARD_PLAYER_URL"; do
    printf '.'
    sleep 5
done

export DISPLAY=:0.0

WIDTH=1920
HEIGHT=1080
if command -v fbset >/dev/null 2>&1; then
    RES=$(fbset | grep geometry | awk '{print $2"x"$3}' || true)
    if [[ -n "$RES" ]]; then
        WIDTH=$(echo "$RES" | cut -d'x' -f1)
        HEIGHT=$(echo "$RES" | cut -d'x' -f2)
    fi
fi

flags=(
    --kiosk
    --window-size=${WIDTH},${HEIGHT}
    --window-position=0,0
    --touch-events=enabled
    --disable-pinch
    --noerrdialogs
    --disable-session-crashed-bubble
    --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT'
    --disable-component-update
    --overscroll-history-navigation=0
    --disable-features=TranslateUI
    --autoplay-policy=no-user-gesture-required
    --use-fake-ui-for-media-stream
)

startx_cmd=(
    /usr/bin/startx
    /usr/bin/chromium-browser
    "${flags[@]}"
    --app="$FREEBOARD_PLAYER_URL"
)

if [[ "$TARGET_USER" != "$CURRENT_USER" ]]; then
    exec sudo --preserve-env=FREEBOARD_USER -u "$TARGET_USER" "${startx_cmd[@]}"
fi

exec "${startx_cmd[@]}"
