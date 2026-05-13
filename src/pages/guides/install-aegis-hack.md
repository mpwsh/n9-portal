---
layout: ../../layouts/GuideLayout.astro
title: Install Aegis Hack
description: Unlock OpenRepos packages that require system-level permissions.
---

> ℹ️ Prerequisite: you've installed the [N9 mirror](/setup) and [enabled Developer Mode](/guides/developer-mode).

## What this is

The N9's Aegis security framework rejects unsigned packages that ask for system-level permissions (rebooting, packet capture, etc.). Some OpenRepos apps need those permissions to work — without this step they may install but their privileged features won't function.

**Aegis Installer** (by Coderus) is the community-standard workaround. It patches the install process so unsigned community packages can claim a trusted origin. Installing it requires trusting a GPG signing key, since the patched installer comes from a signed repository.

## Step 1: Become root

```bash
devel-su
# password is rootme
```

## Step 2: Trust the community signing key

```bash
wget -q -O - http://n9.mpw.sh/apt-repo/wunderwungiel.key | apt-key add -
```

You should see `OK` printed. This tells apt to trust packages signed by this key.

## Step 3: Enable the signed repository

```bash
echo "deb http://n9.mpw.sh/apt-repo unstable main" > /etc/apt/sources.list.d/n9-apt-repo.list
apt-get update
```

You should see the new repository fetched without GPG warnings.

## Step 4: Install Aegis Installer

```bash
apt-get install hack-installer
```

You'll see output like this — that's the installer patching itself:

```
Setting up hack-installer ...
# Backuping installer package status
# Backuping original sources lists
# Backuping original apt lists
# Injecting local repository
# Refreshing hack repository
# Installing patched aegis-install
# Removing local repository
# Restoring original apt lists
# Restoring original sources lists
# Returning installer package status
# Aegis-installer hacked. You can remove hack-installer package now =)
```

## Step 5: Remove the installer package (optional)

The patch is applied — the `hack-installer` package itself isn't doing anything anymore:

```bash
apt-get remove hack-installer
```

The patched `aegis-install` stays in place. This is just cleanup.

## You're done

From now on, plain `apt-get install` works for any OpenRepos package, with full system permissions:

```bash
apt-get install reboot
apt-get install filecase
apt-get install fingerterm
```

Open the **Reboot** app from your launcher to confirm — tapping it actually reboots the device. (Without Aegis Installer, the app installs but can't trigger the reboot.)

## How this works

The patched aegis-install sits in front of dpkg (via a dpkg-divert), so every package install runs through it. It sets the origin to com.nokia.maemo and then calls the real dpkg. Aegis allows the AEGIS_FIXED_ORIGIN override specifically because it's coming from this whitelisted binary path.

This works on closed-mode devices — no kernel reflash, no Open Mode required.

---

**Next:** [browse the package catalog](/packages) for community apps, or check out the other [guides](/guides/).
