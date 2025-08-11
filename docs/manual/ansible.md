# Ansible Guide — freeboard

## Purpose

Provision a Debian-based host or Raspberry Pi for `freeboard`. Installs Docker Engine and Compose plugin, prepares MongoDB, configures boot UX, X11 kiosk deps, and installs a `freeboard.service`.

## What the playbook does

- Removes distro Docker packages, adds official Docker repo, installs `docker-ce`, `docker-ce-cli`, `docker-compose-plugin`.
- Adds the deploy user to `docker` and other groups.
- (Pi only) Downloads and loads a prebuilt MongoDB image archive.
- Sets splash screen with Plymouth and tweaks framebuffer.
- Updates `/boot/firmware/{config.txt,cmdline.txt}` for KMS, cgroups, quiet boot.
- Disables swap.
- Installs kiosk deps: `xinit`, `feh`, Chromium.
- Optionally backs up and replaces X11 configs.
- Installs and enables `freeboard.service`.

## Supported targets

- Debian 12+ x86_64
- Raspberry Pi OS 64-bit (Bookworm) on Pi 4/5

## Prerequisites

- Control node: Ansible 2.15+.
- Managed node: Debian/PI with `sudo`, network, and Python 3.
- SSH access to a non-root deploy user with `become` privileges.

## Inventory and variables

Define hosts and a deploy user. Keep secrets in `vars.yml`.

```ini
[freeboard]
pi4 ansible_host=192.168.1.50 ansible_user=pi
debian-x86 ansible_host=192.168.1.60 ansible_user=deploy

[freeboard:vars]
ansible_python_interpreter=/usr/bin/python3
```

```ini
deploy_user: "{{ ansible_user_id }}"
mongo_arm_tar_url: "https://github.com/themattman/mongodb-raspberrypi-docker/releases/download/r7.0.4-mongodb-raspberrypi-docker-unofficial/mongodb.ce.pi4.r7.0.4-mongodb-raspberrypi-docker-unofficial.tar.gz"
mongo_arm_tar_path: "/tmp/mongodb.ce.pi4.r7.0.4.tar.gz"
```

## Files expected in repo

- `playbook.yml` (this play)
- `vars.yml`
- `rc.local`
- `freeboard.service.j2`
- Plymouth theme files in `files/`: `freeboard.plymouth`, `freeboard.script`, `splashscreen.png`

## Running

Dry run:

- `ansible-playbook -i inventory.ini playbook.yml -t docker,player -C`

Apply to all:

- `ansible-playbook -i inventory.ini playbook.yml --tags all --ask-become-pass`

Targeted runs:

- `-t docker` only Docker setup
- `-t mongo` only Mongo image load on Pi
- `-t system` boot and kernel args
- `-t splashscreen` Plymouth theme
- `-t player` kiosk deps and service

## Service lifecycle

- `systemctl status freeboard`
- `journalctl -u freeboard -b`
