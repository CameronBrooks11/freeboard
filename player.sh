#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

until curl --output /dev/null --silent --head --fail "$SUPERBOARD_PLAYER_URL"; do
    printf '.'
    sleep 5
done

export DISPLAY=:0.0

RES=$(fbset | grep geometry | awk '{print $2"x"$3}')
WIDTH=$(echo "$RES" | cut -d'x' -f1)
HEIGHT=$(echo "$RES" | cut -d'x' -f2)

flags=(
    --kiosk
    --start-fullscreen
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
    --no-sandbox
)

sudo --preserve-env=SUPERBOARD_USER -u "${SUPERBOARD_USER}" startx /usr/bin/chromium-browser "${flags[@]}" --app="$SUPERBOARD_PLAYER_URL" # -- -nocursor