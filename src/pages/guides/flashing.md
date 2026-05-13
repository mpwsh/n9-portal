---
layout: ../../layouts/GuideLayout.astro
title: Flashing the Nokia N9
description: Reflash your Nokia N9 firmware using flasher 3.12 on Linux.
---

> ⚠️ **Warning:** Flashing wipes the device. Make sure your battery is at least 50% charged before starting — a flash interrupted by a dead battery is the only realistic way to brick the N9.

## Step 1: Install flasher

Install the dependency first:

```bash
sudo apt install -y libusb-0.1-4
```

Then install flasher itself:

```bash
sudo dpkg -i ./flasher_3.12.1_amd64.deb
```

You can download the package here: [flasher_3.12.1_amd64.deb](https://n9.mpw.sh/tools/flasher_3.12.1_amd64.deb).

## Step 2: Connect the device

Power the N9 off. Hold **volume-up** while plugging the USB cable in, and keep holding until the device shows the USB icon.

Check that your computer sees it:

```bash
sudo flasher -i
```

You should see device info printed out. If you do, you're good to flash.

## Step 3: Flash the OS

To flash **only the OS** (keeps your user data on `/home` and MyDocs):

```bash
sudo flasher -f -F ./images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin
```

File: [DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin](/images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin)

## Step 4: Flash OS + eMMC (full wipe)

To fully wipe the device — OS, user data, MyDocs, everything — flash both images:

```bash
sudo flasher -f \
  -F ./images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin \
  -F ./images/E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin \
  --flash-only=mmc
```

Files:

- [DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin](/images/DFL61_HARMATTAN_40.2012.21-3_PR_LEGACY_001-OEM1-958_ARM.bin) (OS)
- [E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin](/images/E7FEB593_DFL61_HARMATTAN_40.2012.13-7.UKIRELAND_EMMC_UKIRELAND.bin) (eMMC)

The eMMC flash takes 5–10 minutes. The device will look idle. **Do not unplug it.** It reboots itself when done.

First boot after a full wipe sits on the Nokia logo for several minutes — that's normal.

---

**Next:** Set up [Developer Mode](/guides/developer-mode), or see the [troubleshooting guide](/guides/flasher-troubleshooting) if something goes wrong.
