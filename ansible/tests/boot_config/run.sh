#!/usr/bin/env bash
# Behaviour tests for the kiosk_boot_tuning role's config.txt handling (#338).
#
# Runs the role's real task files with a real ansible-playbook, on copies of a
# stock Raspberry Pi OS config.txt in a temporary directory. Nothing outside
# that directory is touched, and the playbooks refuse a path under /boot.
#
# fixtures/config.txt is stage1/00-boot-files/files/config.txt from
# RPi-Distro/pi-gen at ccafc13f2574c7ab2445f71a0e9f4e2cbf2bb0b3, unmodified.
# fixtures/provisioned.txt is what one provisioning run must make of it.
#
# Usage: ansible/tests/boot_config/run.sh     (exits non-zero on any failure)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
stock="$here/fixtures/config.txt"
expected="$here/fixtures/provisioned.txt"
suffix=".freeboard-kiosk.bak"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

export ANSIBLE_ROLES_PATH="$here/../../roles"
# Not ansible/ansible.cfg, whose inventory and callback settings are for real
# hosts: run from the temporary directory, which has no ansible.cfg.
unset ANSIBLE_CONFIG
cd "$work"
export ANSIBLE_NOCOLOR=1
export ANSIBLE_RETRY_FILES_ENABLED=0

failures=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# play <provision|rollback> <config path>: run one harness playbook, keeping its
# output in $work/last.log. Returns the playbook's own exit status.
play() {
  ansible-playbook -i localhost, "$here/$1.yml" \
    -e "kiosk_boot_config_path=$2" > "$work/last.log" 2>&1
}

changed_count() { sed -n 's/.*changed=\([0-9]*\).*/\1/p' "$work/last.log" | tail -n 1; }

# --- provisioning a stock image ---------------------------------------------
cfg="$work/stock/config.txt"
mkdir -p "$work/stock"
cp "$stock" "$cfg"

if play provision "$cfg" && cmp -s "$cfg" "$expected"; then
  pass "provisioning stock config.txt appends the managed block and changes nothing else"
else
  fail "provisioning stock config.txt"; diff -u "$expected" "$cfg" || true; cat "$work/last.log"
fi

if grep -qx 'dtoverlay=nospi10' "$cfg" && [ "$(grep -cx 'dtoverlay=vc4-kms-v3d' "$cfg")" = 1 ]; then
  pass "the [pi5] overlay survives and vc4-kms-v3d is not added a second time"
else
  fail "overlay lines after provisioning"
fi

before="$(sha256sum "$cfg")"
if play provision "$cfg" && [ "$(sha256sum "$cfg")" = "$before" ] && [ "$(changed_count)" = 0 ]; then
  pass "a second provisioning run changes nothing"
else
  fail "second provisioning run is not idempotent (changed=$(changed_count))"; cat "$work/last.log"
fi

# --- rollback keeps changes made after provisioning --------------------------
cp "$stock" "$cfg$suffix"  # the role's first-provision backup
extra=$'dtparam=i2c_arm=on\ndtparam=i2c_arm_baudrate=50000\ncore_freq_min=500'
printf '%s\n' "$extra" >> "$cfg"
{ cat "$stock"; printf '%s\n' "$extra"; } > "$work/after-rollback.txt"

if play rollback "$cfg" && cmp -s "$cfg" "$work/after-rollback.txt"; then
  pass "rollback removes the managed block and keeps lines added since"
else
  fail "rollback"; diff -u "$work/after-rollback.txt" "$cfg" || true; cat "$work/last.log"
fi

# --- rollback on a host provisioned by the old, unmarked role ---------------
legacy="$work/legacy/config.txt"
mkdir -p "$work/legacy"
sed 's/^dtoverlay=nospi10$/dtoverlay=vc4-kms-v3d/' "$stock" > "$legacy"
printf 'framebuffer_depth=32\n' >> "$legacy"
cp "$stock" "$legacy$suffix"
before="$(sha256sum "$legacy")"
if play rollback "$legacy"; then
  fail "rollback of an unmarked, previously provisioned config.txt should refuse"
elif grep -q 'Compare it with the backup' "$work/last.log" && [ "$(sha256sum "$legacy")" = "$before" ]; then
  pass "rollback refuses an unmarked config.txt with a backup, and leaves it as it was"
else
  fail "legacy rollback refused for the wrong reason, or changed the file"; cat "$work/last.log"
fi

# --- rollback on a host that was never provisioned --------------------------
never="$work/never/config.txt"
mkdir -p "$work/never"
cp "$stock" "$never"
if play rollback "$never" && cmp -s "$never" "$stock"; then
  pass "rollback on a never-provisioned config.txt succeeds and changes nothing"
else
  fail "rollback on a never-provisioned config.txt"; cat "$work/last.log"
fi

if play rollback "$work/absent/config.txt"; then
  pass "rollback with no config.txt at all succeeds"
else
  fail "rollback with no config.txt"; cat "$work/last.log"
fi

# --- settings only a board filter sets are still set for every board ---------
# The exact lines the role wants, but under [pi4] only: they do not apply to a
# Pi 5, so they must not count as already present.
scoped="$work/scoped/config.txt"
mkdir -p "$work/scoped"
{ grep -vx 'dtoverlay=vc4-kms-v3d' "$stock"; printf '[pi4]\ngpu_mem_256=96\ndtoverlay=vc4-kms-v3d\n'; } > "$scoped"
block() { sed -n '/^# BEGIN freeboard-kiosk boot tuning$/,/^# END/p' "$1"; }
if play provision "$scoped" \
  && [ "$(grep -cx 'gpu_mem_256=96' "$scoped")" = 2 ] \
  && block "$scoped" | grep -qx 'gpu_mem_256=96' \
  && block "$scoped" | grep -qx 'dtoverlay=vc4-kms-v3d'; then
  pass "a line present only under a board filter still goes in the [all] block"
else
  fail "board-filtered settings"; cat "$scoped"; cat "$work/last.log"
fi

if [ "$failures" -ne 0 ]; then
  printf '%d check(s) failed\n' "$failures"
  exit 1
fi
printf 'all boot config checks passed\n'
