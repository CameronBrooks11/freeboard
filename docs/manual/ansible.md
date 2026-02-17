# Ansible Guide

## Purpose

Provision supported kiosk devices (Debian 12+ and Raspberry Pi OS Bookworm) for Freeboard with a profile-driven, modular workflow.

This automation is designed for production-safe operation:

- explicit profile selection
- fail-fast preflight checks
- optional high-risk roles (boot tuning, runtime, Mongo preload)
- backup/rollback path for managed system files

## Supported targets

- Debian 12+ (x86_64)
- Raspberry Pi OS 64-bit (Bookworm) on Pi 4/5

## Architecture

Main playbook: `ansible/playbook.yml`

Roles:

- `kiosk_preflight`: validates platform + required settings
- `kiosk_base`: service user + base directories/packages
- `kiosk_display`: X11 + Chromium dependencies/config
- `kiosk_player`: `player.sh` deployment + `/etc/freeboard/kiosk.env` + `freeboard-kiosk.service`
- `container_runtime` (optional): Docker install
- `mongo_preload` (optional): ARM Mongo image preload
- `kiosk_boot_tuning` (optional): splash and boot tuning

Rollback playbook: `ansible/rollback.yml`

## Profiles

Set `kiosk_profile` in inventory/group vars or via `-e`:

- `player_only` (default)
  - player + display only
  - no Docker/runtime changes
  - no boot tuning
- `appliance_with_runtime`
  - includes `container_runtime`
- `appliance_with_runtime_and_boot_tuning`
  - includes runtime and boot tuning

Per-role overrides are available (`kiosk_enable_*` booleans).

## Required config

Required variable:

- `kiosk_player_url` (dashboard URL the device opens)

Commonly overridden:

- `kiosk_service_user`
- `kiosk_player_script_source`
- `kiosk_browser_binary`
- `kiosk_url_check_mode` (`none|get|head`)
- `kiosk_systemd_no_new_privileges` (default `false` for Xorg/startx compatibility)

If using `appliance_with_runtime` profiles on 32-bit Raspberry Pi OS, pin image tags to the
legacy armv7 track (`latest-armv7`, `v*-armv7`, or `sha-*-armv7`).

External references for container architecture constraints:

- https://docs.docker.com/engine/install/raspberry-pi-os/
- https://docs.docker.com/engine/release-notes/29/
- https://github.com/nodejs/docker-node
- https://hub.docker.com/r/arm32v7/node

Reference defaults: `ansible/vars.yml`

## Inventory setup

Create inventory from the example:

```bash
cp ansible/inventory.ini.example ansible/inventory.ini
```

Then choose one pattern:

1. Control-node pattern (recommended for production):

- Set one or more remote hosts under `[kiosk]` (with `ansible_host` and `ansible_user`).

2. Self-provision pattern (single-device bootstrap):

- Use localhost with local connection:
  - `localhost ansible_connection=local`

## Execution patterns

### Pattern A: Control Node to Remote Kiosk Hosts (Production)

Run from your control machine (not from the Pi itself).

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg ansible-playbook -i ansible/inventory.ini ansible/playbook.yml -e "kiosk_profile=player_only kiosk_player_url=http://192.168.1.20:8080/s/abc123" --check --diff
```

Apply after dry-run:

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg ansible-playbook -i ansible/inventory.ini ansible/playbook.yml -e "kiosk_profile=player_only kiosk_player_url=http://192.168.1.20:8080/s/abc123"
```

### Pattern B: Self-Provision on the Kiosk Device (Single Host)

SSH into the target Pi, then run Ansible locally:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i localhost, -c local ansible/playbook.yml -e "freeboard_target_group=all kiosk_profile=player_only kiosk_player_url=http://127.0.0.1:8080/s/abc123" --check --diff
ANSIBLE_CONFIG=ansible/ansible.cfg .venv/bin/ansible-playbook -i localhost, -c local ansible/playbook.yml -e "freeboard_target_group=all kiosk_profile=player_only kiosk_player_url=http://127.0.0.1:8080/s/abc123"
```

Notes:

- `freeboard_target_group=all` is required in localhost mode because `localhost,` is not in the default `kiosk` group.
- Reboot is usually not required for `player_only`; use `sudo systemctl restart freeboard-kiosk.service` after config changes if needed.

## Role tags

Target selected roles/tags if needed:

- `preflight`
- `kiosk_base`
- `kiosk_display`
- `kiosk_player`
- `container_runtime`
- `mongo_preload`
- `kiosk_boot_tuning`

Example:

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg ansible-playbook -i ansible/inventory.ini ansible/playbook.yml -t preflight,kiosk_player -e "kiosk_player_url=http://192.168.1.20:8080/s/abc123"
```

## Quality checks

Local checks:

```bash
ansible-lint ansible/playbook.yml ansible/rollback.yml
ansible-playbook -i localhost, ansible/playbook.yml --syntax-check -e "freeboard_target_group=all kiosk_player_url=http://localhost:8080/s/demo"
ansible-playbook -i localhost, ansible/rollback.yml --syntax-check -e "freeboard_target_group=all"
```

CI check workflow: `.github/workflows/ansible-quality.yml`

## Service contract

The role installs:

- env file: `/etc/freeboard/kiosk.env`
- systemd unit: `/etc/systemd/system/freeboard-kiosk.service`
- script: `/opt/freeboard/player.sh` (default)

`player.sh` now supports bounded startup probing via:

- `FREEBOARD_URL_CHECK_MODE`
- `FREEBOARD_URL_CHECK_TIMEOUT_SECONDS`
- `FREEBOARD_URL_CHECK_INTERVAL_SECONDS`
- `FREEBOARD_URL_CHECK_MAX_ATTEMPTS`

## Raspberry Pi Mongo preload note

If you enable `mongo_preload`, this playbook uses the pinned community `themattman` Raspberry Pi Mongo release configured in `ansible/vars.yml`.

For support tradeoffs, upgrade workflow, and links to upstream references, see:

- [Raspberry Pi MongoDB Guidance](/manual/raspberry-pi-mongodb)

## Rollback

Rollback managed kiosk artifacts:

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg ansible-playbook -i ansible/inventory.ini ansible/rollback.yml
```

Rollback from inside the kiosk host (localhost/self-provision pattern):

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg ansible-playbook -i localhost, -c local ansible/rollback.yml -e "freeboard_target_group=all"
```

This stops the kiosk service, restores managed backups where present, removes managed service/env files, and reloads systemd.

## Post-apply verification

Pattern A (control node to remote host):

```bash
ansible -i ansible/inventory.ini kiosk -b -m shell -a "systemctl is-enabled freeboard-kiosk.service && systemctl is-active freeboard-kiosk.service"
ansible -i ansible/inventory.ini kiosk -b -m shell -a "journalctl -u freeboard-kiosk.service -n 50 --no-pager"
```

Pattern B (inside kiosk host):

```bash
sudo systemctl is-enabled freeboard-kiosk.service
sudo systemctl is-active freeboard-kiosk.service
sudo journalctl -u freeboard-kiosk.service -n 50 --no-pager
```

When `kiosk_profile` includes boot tuning, schedule a controlled reboot window and validate service state again after reboot.

## Security notes

- Do not run kiosk devices with admin/editor credentials.
- Prefer viewer-only accounts or share-token URLs for kiosk playback.
- Keep execution mode `safe` for kiosk and IoT deployments unless explicitly justified.
- Keep host key checking enabled for production automation.
