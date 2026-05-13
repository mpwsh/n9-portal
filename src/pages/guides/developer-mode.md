---
layout: ../../layouts/GuideLayout.astro
title: Enable Developer Mode
description: Install the N9 mirror and unlock root access on your Nokia N9.
---

> ⚠️ **Warning:** Developer mode gives you root access. Be careful with terminal commands — you can break your device.

> ℹ️ Nokia's original repositories are dead, so enabling Developer Mode on a stock N9 fails out of the box. You need to install the N9 mirror first, then toggle Developer Mode.

## Step 1: Allow non-store installations

On your N9:

1. Open **Settings**
2. Go to **Applications → Installations**
3. Enable **Allow installations from non-Store sources**

## Step 2: Connect to the internet

Wi-Fi or 3G, doesn't matter — just make sure you're online.

## Step 3: Install the mirror package

Open the browser on your N9 and go to:

```
n9.mpw.sh/setup.deb
```

Tap the file when it downloads, accept the prompts, and let it install. This adds the N9 mirror to your apt sources so Developer Mode can find the packages it needs.

## Step 4: Enable Developer Mode

1. Go to **Settings**
2. Scroll down to **Security**
3. Tap **Developer mode**
4. Toggle it **ON**
5. Accept the terms and conditions

Your device will download and install Terminal, SDK Connection, and the other developer tools. This takes a few minutes.

## Step 5: Access the terminal

Tap the **Terminal** icon in your applications menu.

## Step 6: Gain root access

In the terminal:

```bash
devel-su
# password is rootme
```

## Step 7: Install wget

As root, run:

```bash
apt-get update
apt-get install wget -y
```

You can also install "Utilities" from Security -> Developer mode -> Press install on utilities

---

## Alternative: configure the mirror by hand

If the `.deb` from Step 3 fails — corrupt download, browser refuses to open it, or you'd rather see what it does — you can wire the sources up yourself. After you've finished Step 6 (root access in terminal), drop a file at `/etc/apt/sources.list.d/n9-mirror.list` with:

```
# Flat repositories
deb http://n9.mpw.sh/n9mirror/001 ./
deb http://n9.mpw.sh/n9mirror/apps ./
deb http://n9.mpw.sh/n9mirror/tools ./

# OpenRepos mirror
deb http://n9.mpw.sh/openrepos ./

# Standard repository (Harmattan SDK)
deb http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free non-free
deb-src http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free

# Nokia binaries
deb http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/41667a5bd857be02f487c2ce806fbf85 nokia-binaries
```

Then `apt-get update`. Same result as the `.deb`.

---

**Next:** Browse the [package catalog](/packages) to find apps, or check out the other [guides](/guides/).
