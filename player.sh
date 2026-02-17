#!/usr/bin/env bash
set -euo pipefail

log() {
    printf '[freeboard-kiosk] %s\n' "$*"
}

: "${FREEBOARD_PLAYER_URL:?FREEBOARD_PLAYER_URL is required}"

CURRENT_USER="$(id -un)"
TARGET_USER="${FREEBOARD_USER:-$CURRENT_USER}"
DISPLAY="${FREEBOARD_DISPLAY:-:0.0}"

URL_CHECK_MODE="${FREEBOARD_URL_CHECK_MODE:-head}"
URL_CHECK_TIMEOUT_SECONDS="${FREEBOARD_URL_CHECK_TIMEOUT_SECONDS:-5}"
URL_CHECK_INTERVAL_SECONDS="${FREEBOARD_URL_CHECK_INTERVAL_SECONDS:-5}"
URL_CHECK_MAX_ATTEMPTS="${FREEBOARD_URL_CHECK_MAX_ATTEMPTS:-0}"

DEFAULT_WIDTH="${FREEBOARD_DEFAULT_WIDTH:-1920}"
DEFAULT_HEIGHT="${FREEBOARD_DEFAULT_HEIGHT:-1080}"

BROWSER_BINARY="${FREEBOARD_BROWSER_BINARY:-/usr/bin/chromium-browser}"
BROWSER_FLAGS_EXTRA="${FREEBOARD_BROWSER_FLAGS_EXTRA:-}"

for numeric_value in \
    "$URL_CHECK_TIMEOUT_SECONDS" \
    "$URL_CHECK_INTERVAL_SECONDS" \
    "$URL_CHECK_MAX_ATTEMPTS" \
    "$DEFAULT_WIDTH" \
    "$DEFAULT_HEIGHT"; do
    if [[ ! "$numeric_value" =~ ^[0-9]+$ ]]; then
        log "Numeric player settings must be unsigned integers."
        exit 1
    fi
done

if [[ "$URL_CHECK_TIMEOUT_SECONDS" -le 0 || "$URL_CHECK_INTERVAL_SECONDS" -le 0 ]]; then
    log "URL probe timeout/interval must be greater than zero."
    exit 1
fi

if [[ "$DEFAULT_WIDTH" -le 0 || "$DEFAULT_HEIGHT" -le 0 ]]; then
    log "Default window size must be greater than zero."
    exit 1
fi

if [[ "$URL_CHECK_MODE" != "none" && "$URL_CHECK_MODE" != "head" && "$URL_CHECK_MODE" != "get" ]]; then
    log "Invalid FREEBOARD_URL_CHECK_MODE='$URL_CHECK_MODE' (expected: none|head|get)."
    exit 1
fi

if ! command -v /usr/bin/startx >/dev/null 2>&1; then
    log "startx was not found at /usr/bin/startx."
    exit 1
fi

resolve_browser_binary() {
    if [[ -x "$BROWSER_BINARY" ]]; then
        printf '%s\n' "$BROWSER_BINARY"
        return 0
    fi

    for candidate in /usr/bin/chromium-browser /usr/bin/chromium; do
        if [[ -x "$candidate" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    return 1
}

BROWSER_BINARY="$(resolve_browser_binary || true)"
if [[ -z "$BROWSER_BINARY" ]]; then
    log "No supported Chromium binary was found."
    exit 1
fi

url_probe() {
    local method
    case "$URL_CHECK_MODE" in
        head)
            method="HEAD"
            ;;
        get)
            method="GET"
            ;;
        none)
            return 0
            ;;
        *)
            return 1
            ;;
    esac

    curl \
        --silent \
        --show-error \
        --fail \
        --location \
        --request "$method" \
        --connect-timeout "$URL_CHECK_TIMEOUT_SECONDS" \
        --max-time "$URL_CHECK_TIMEOUT_SECONDS" \
        "$FREEBOARD_PLAYER_URL" \
        >/dev/null
}

wait_for_url() {
    if [[ "$URL_CHECK_MODE" == "none" ]]; then
        log "URL probe disabled (FREEBOARD_URL_CHECK_MODE=none)."
        return
    fi

    local attempts=0
    until url_probe; do
        attempts=$((attempts + 1))

        if [[ "$URL_CHECK_MAX_ATTEMPTS" -gt 0 && "$attempts" -ge "$URL_CHECK_MAX_ATTEMPTS" ]]; then
            log "URL probe failed after $attempts attempts; giving up."
            return 1
        fi

        log "URL probe failed (attempt=$attempts, mode=$URL_CHECK_MODE); retrying in ${URL_CHECK_INTERVAL_SECONDS}s..."
        sleep "$URL_CHECK_INTERVAL_SECONDS"
    done

    if [[ "$attempts" -gt 0 ]]; then
        log "URL became reachable after $attempts retries."
    fi
}

wait_for_url

WIDTH="$DEFAULT_WIDTH"
HEIGHT="$DEFAULT_HEIGHT"
if command -v fbset >/dev/null 2>&1; then
    RES="$(fbset 2>/dev/null | awk '/geometry/ { print $2 "x" $3; exit }' || true)"
    if [[ "$RES" =~ ^[0-9]+x[0-9]+$ ]]; then
        WIDTH="${RES%x*}"
        HEIGHT="${RES#*x}"
    fi
fi

flags=(
    --kiosk
    --window-size="${WIDTH},${HEIGHT}"
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

if [[ -n "$BROWSER_FLAGS_EXTRA" ]]; then
    read -r -a extra_flags <<< "$BROWSER_FLAGS_EXTRA"
    flags+=("${extra_flags[@]}")
fi

export DISPLAY

startx_cmd=(
    /usr/bin/startx
    "$BROWSER_BINARY"
    "${flags[@]}"
    --app="$FREEBOARD_PLAYER_URL"
)

log "Starting kiosk browser as user '$TARGET_USER' on display '$DISPLAY'."

if [[ "$TARGET_USER" != "$CURRENT_USER" ]]; then
    preserve_env_vars=(
        FREEBOARD_PLAYER_URL
        FREEBOARD_USER
        FREEBOARD_DISPLAY
        FREEBOARD_BROWSER_BINARY
        FREEBOARD_BROWSER_FLAGS_EXTRA
        FREEBOARD_URL_CHECK_MODE
        FREEBOARD_URL_CHECK_TIMEOUT_SECONDS
        FREEBOARD_URL_CHECK_INTERVAL_SECONDS
        FREEBOARD_URL_CHECK_MAX_ATTEMPTS
        FREEBOARD_DEFAULT_WIDTH
        FREEBOARD_DEFAULT_HEIGHT
        FREEBOARD_LOG_DIR
    )
    preserve_env_csv="$(IFS=,; printf '%s' "${preserve_env_vars[*]}")"
    exec sudo --preserve-env="$preserve_env_csv" -u "$TARGET_USER" "${startx_cmd[@]}"
fi

exec "${startx_cmd[@]}"
