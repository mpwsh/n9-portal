---
layout: ../../layouts/GuideLayout.astro
title: Enable Developer Mode
description: Unlock root access and install developer tools on your Nokia N9.
---

> ⚠️ **Warning:** Enabling developer mode gives you root access. Be careful with terminal commands — you can break your device.

## Step 1: Install the Developer Mode package

On your Nokia N9, open the Nokia Store and search for "Developer Mode". Install the official Developer Mode package.

## Step 2: Enable Developer Mode

1. Go to **Settings**
2. Scroll down to **Security**
3. Tap **Developer mode**
4. Toggle it **ON**
5. Accept the terms and conditions

Your device will download and install the necessary packages. This may take a few minutes.

## Step 3: Access the terminal

Once enabled, you can access the terminal by tapping the **Terminal** icon in your applications menu.

## Step 4: Gain root access

In the terminal, type:

```
devel-su
```

Enter the root password you set during developer mode activation.

## Step 5: Add the mirror

Now that you have root access, you can configure the N9 Mirror for package downloads:

```
devel-su
wget https://n9.mpw.sh/n9-mirror-setup.deb
dpkg -i n9-mirror-setup.deb
apt-get update
```

Or do it manually — see the [Setup page](/setup) for the full sources.list.

---

**Next:** Browse the [mirror](/browse) to find packages, or check out the other [guides](/guides/).
