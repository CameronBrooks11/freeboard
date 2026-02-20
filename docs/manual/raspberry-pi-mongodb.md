# Raspberry Pi MongoDB Guidance

Last reviewed: February 16, 2026

## Why This Exists

MongoDB on Raspberry Pi is not as straightforward as standard x86 Linux installs.

For this project, we keep an explicit Pi fallback path and document the tradeoffs so operators do not lose time chasing incompatible combinations.

## Support Reality (Short Version)

- Raspberry Pi 4 often needs community builds for MongoDB 5+/6+/7+ workflows.
- Raspberry Pi 5 (64-bit, modern CPU baseline) has a better path to official MongoDB arm64 support.
- Community images/binaries are useful but are not official MongoDB Inc. production support.

## Freeboard Baseline Decision

For Pi-focused local/dev and kiosk appliance workflows, this repo keeps a pinned fallback in `.env.pi`:

```dotenv
FREEBOARD_MONGO_IMAGE=mongodb-raspberrypi4-unofficial-r7.0.28:latest
```

And the optional Ansible Mongo preload role defaults to the matching `r7.0.28` tarball release.

## Operator Matrix

1. Pi 4 and you need quickest path to working Mongo for Freeboard:

- Use `.env.pi` fallback image and treat it as community-supported.

2. Pi 5 or newer arm64 target and you can validate official compatibility:

- Prefer official MongoDB-supported path first.
- Keep `.env.pi` fallback as contingency only.

3. Internet-exposed or strict compliance production:

- Avoid unmanaged community dependencies unless you own the risk explicitly.
- Consider managed/remote Mongo where platform support is clearer.

## Required Risk Notes

- Community builds can disappear, lag, or change unexpectedly.
- Pin exact tags/releases and review before upgrades.
- Do not auto-upgrade Mongo image tags blindly on Pi deployments.

## Source Links

Official context:

- MongoDB Production Notes (platform guidance):
  - https://www.mongodb.com/docs/manual/administration/production-notes/

Community workarounds used here:

- themattman binaries:
  - https://github.com/themattman/mongodb-raspberrypi-binaries
  - https://github.com/themattman/mongodb-raspberrypi-binaries/releases/tag/r7.0.28-rpi-unofficial
- themattman docker images/releases:
  - https://github.com/themattman/mongodb-raspberrypi-docker
  - https://github.com/themattman/mongodb-raspberrypi-docker/releases/tag/r7.0.28-mongodb-raspberrypi-docker-unofficial

Community discussion that led to these workarounds:

- Stack Overflow thread (includes response from themattman):
  - https://stackoverflow.com/questions/72673150/how-to-install-mongodb-on-a-rspberry-pi-4

## Maintenance Checklist

When revisiting Pi Mongo baseline:

1. Confirm MongoDB official support state for your exact Pi generation/OS/architecture.
2. Check latest themattman release tags.
3. Update `.env.pi` and `ansible/vars.yml` together.
4. Re-run compose + Ansible validation on real Pi hardware before merge.
