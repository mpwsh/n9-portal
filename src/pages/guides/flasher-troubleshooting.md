---
layout: ../../layouts/GuideLayout.astro
title: Flasher Troubleshooting
description: Recover a Nokia N9 that won't boot, and manage RD mode flags.
---

> ℹ️ The N9 is very hard to actually brick. As long as `sudo flasher -i` sees the device in flash mode (volume-up + USB), you can recover it.

## Device won't boot after a flash

The combined flash command (`-F OS -F eMMC --flash-only=mmc`) sometimes only flashes the eMMC portion. If your device is stuck on the Nokia logo or boot-looping, try flashing the OS image on its own first:

```bash
sudo flasher -f -F ./images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin
```

File: [DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin](/images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin)

If you also need to restore eMMC content, flash that separately afterwards:

```bash
sudo flasher -f -F ./images/E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin --flash-only=mmc
```

File: [E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin](/images/E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin)

## RD mode and flags

R&D mode unlocks low-level access. Enable it with:

```bash
sudo flasher --enable-rd-mode
```

Useful flags:

```bash
# Allow power key to force-reboot
sudo flasher --enable-rd-mode --set-rd-flags=force-power-key

# Disable the watchdog auto-reboot
sudo flasher --enable-rd-mode --set-rd-flags=no-lifeguard-reset
```

## Disabling RD mode

If you enabled RD mode with no flags:

```bash
sudo flasher --disable-rd-mode
```

If you set flags, you **must** clear them explicitly when disabling, or they'll stick:

```bash
sudo flasher --disable-rd-mode --clear-rd-flags=no-lifeguard-reset
```

Multiple flags can be cleared at once:

```bash
sudo flasher --disable-rd-mode --clear-rd-flags=no-lifeguard-reset,force-power-key
```

## Other commands

```bash
# Reboot the device
sudo flasher --reboot
```

---

**Back to:** [Flashing guide](/guides/flashing)
