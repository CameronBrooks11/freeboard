# Ansible Guide

## Purpose

Provision a Debian-based host (including Raspberry Pi) for kiosk/player deployments.

Playbook actions include:

- Docker engine + compose plugin install
- Optional Raspberry Pi Mongo image preload
- System boot tuning and splash setup
- X11/Chromium kiosk dependencies
- `freeboard.service` installation for player mode

## Supported targets

- Debian 12+ (x86_64)
- Raspberry Pi OS 64-bit (Bookworm) on Pi 4/5

## Key variables (`ansible/vars.yml`)

- `freeboard_player_url`: dashboard URL opened by the kiosk player
- `freeboard_deploy_user`: user added to required groups
- `freeboard_service_user`: service account used to launch player
- `freeboard_repo_dir`: repo path containing `player.sh`
- `mongo_arm_tar_url` / `mongo_arm_tar_path`: optional Pi Mongo preload source/path

## Usage

Dry run:

```bash
ansible-playbook -i inventory.ini ansible/playbook.yml -t docker,player -C
```

Apply:

```bash
ansible-playbook -i inventory.ini ansible/playbook.yml --ask-become-pass
```

Tag subsets:

- `-t docker`
- `-t mongo`
- `-t system`
- `-t splashscreen`
- `-t player`

## Service behavior

- Service runs as `freeboard_service_user` (non-root by default).
- `FREEBOARD_PLAYER_URL` and `FREEBOARD_USER` are injected into the systemd unit.
- Player startup fails fast if `player.sh` is missing from `freeboard_repo_dir`.

## Security notes

- Do not run kiosk sessions with admin/editor credentials.
- Keep kiosk deployments on `safe` execution mode unless explicitly required.
- Prefer private dashboards for device-control interfaces.
