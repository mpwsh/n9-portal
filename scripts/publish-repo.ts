/**
 * publish-repo.ts
 *
 * Publish the freshly built setup .deb to the R2 apt repo at meego/repo/.
 *
 * Mirrors publish.sh but in TypeScript, using Bun's built-in S3 client.
 * No external dependencies; no `mc` or `dpkg-dev` install needed in CI.
 *
 * Flow:
 *   1. Read public/setup.deb, extract control fields (Package, Version, Arch).
 *   2. List existing .deb objects in meego/repo/ on R2.
 *   3. Download each existing .deb to memory (small files, low count expected).
 *   4. Add the new .deb to the in-memory set, generate a single combined
 *      Packages file from all stanzas, gzip it.
 *   5. Upload the new versioned .deb and Packages.gz back to R2.
 *
 * Run via:  bun run publish
 *
 * Required environment:
 *   R2_ENDPOINT     e.g. https://<account>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY   R2 access key id
 *   R2_SECRET_KEY   R2 secret access key
 */

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { S3Client } from "bun";

const BUCKET = "meego";
const REPO_PATH = "repo";
const LOCAL_DEB = "public/setup.deb";

// ---------- env ----------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`error: ${name} is required`);
    process.exit(1);
  }
  return value;
}

const r2 = new S3Client({
  endpoint: requireEnv("R2_ENDPOINT"),
  accessKeyId: requireEnv("R2_ACCESS_KEY"),
  secretAccessKey: requireEnv("R2_SECRET_KEY"),
  bucket: BUCKET,
  // R2 uses a single region alias.
  region: "auto",
});

// ---------- .deb introspection ----------

/**
 * A .deb is an `ar` archive containing (in order):
 *   debian-binary, control.tar.{gz,xz,zst}, data.tar.{gz,xz,zst}
 *
 * We only need the control archive to read Package:, Version:, etc.
 * No external dpkg-deb needed — the ar format is trivial.
 */
function readControlFieldsFromBytes(
  buf: Uint8Array,
  label: string,
): Record<string, string> {
  // ar header magic
  if (new TextDecoder("ascii").decode(buf.subarray(0, 8)) !== "!<arch>\n") {
    throw new Error(`${label}: not an ar archive`);
  }

  let offset = 8;
  while (offset < buf.length) {
    // Each member header is 60 bytes: 16 name, 12 mtime, 6 uid, 6 gid, 8 mode,
    // 10 size (ASCII), 2 magic "`\n".
    const name = new TextDecoder("ascii")
      .decode(buf.subarray(offset, offset + 16))
      .trim()
      .replace(/\/$/, "");
    const size = parseInt(
      new TextDecoder("ascii")
        .decode(buf.subarray(offset + 48, offset + 58))
        .trim(),
      10,
    );
    const dataStart = offset + 60;
    const dataEnd = dataStart + size;

    if (name.startsWith("control.tar")) {
      const controlArchive = buf.subarray(dataStart, dataEnd);
      return extractControlFromTar(name, controlArchive);
    }

    // ar members are 2-byte aligned.
    offset = dataEnd + (size % 2);
  }

  throw new Error(`${label}: no control.tar.* member found`);
}

async function readControlFields(
  path: string,
): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await readFile(path));
  return readControlFieldsFromBytes(bytes, path);
}

/**
 * Decompress control.tar.{gz,xz,zst} and parse the embedded ./control file.
 * For our build (gzip), gunzipSync handles it. xz/zst would need different
 * decoders; build-deb.sh forces gzip so this is fine.
 */
function extractControlFromTar(
  memberName: string,
  archive: Uint8Array,
): Record<string, string> {
  let tarBytes: Uint8Array;

  if (memberName === "control.tar.gz") {
    tarBytes = gunzipSync(archive);
  } else if (memberName === "control.tar") {
    tarBytes = archive;
  } else {
    throw new Error(
      `unsupported control archive: ${memberName}. ` +
        `build-deb.sh forces gzip (-Zgzip) so this shouldn't happen.`,
    );
  }

  // Walk tar headers (POSIX/ustar). 512-byte blocks.
  let offset = 0;
  while (offset < tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    // End of archive: two consecutive zero blocks (or just an all-zero header).
    if (header[0] === 0) break;

    const name = readCString(header.subarray(0, 100));
    const sizeOctal = readCString(header.subarray(124, 136));
    const size = parseInt(sizeOctal, 8) || 0;

    if (name === "./control" || name === "control") {
      const content = tarBytes.subarray(offset + 512, offset + 512 + size);
      return parseControlFile(new TextDecoder("utf-8").decode(content));
    }

    // Advance to next 512-byte-aligned block after the file data.
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  throw new Error("control file not found in control.tar");
}

function readCString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return new TextDecoder("ascii").decode(
    end >= 0 ? bytes.subarray(0, end) : bytes,
  );
}

/**
 * Parse a single-stanza Debian control file. Same continuation-line semantics
 * as sync-packages.ts parseStanzas, simplified to one stanza.
 */
function parseControlFile(text: string): Record<string, string> {
  const stanza: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!line) continue;
    if (/^[ \t]/.test(line)) {
      if (!currentKey) continue;
      let cont = line.slice(1);
      if (cont === ".") cont = "";
      stanza[currentKey] = stanza[currentKey]
        ? stanza[currentKey] + "\n" + cont
        : cont;
    } else {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim();
      stanza[key] = line.slice(colon + 1).trim();
      currentKey = key;
    }
  }
  return stanza;
}

// ---------- Packages index generation ----------

/**
 * Build one stanza for the Packages index from a .deb's content + control.
 *
 * The format is the same as the .deb's own control file, with extra fields
 * apt requires to download and verify the package:
 *   Filename:  path relative to the repo root
 *   Size:      bytes
 *   MD5sum/SHA1/SHA256: hex digests
 */
function buildPackagesStanza(
  control: Record<string, string>,
  filename: string,
  data: Uint8Array,
): string {
  // Fields that should appear at the top of the stanza, in this order, if
  // present. Anything else from the control file is appended afterwards.
  const orderedFields = [
    "Package",
    "Version",
    "Architecture",
    "Maintainer",
    "Installed-Size",
    "Depends",
    "Pre-Depends",
    "Recommends",
    "Suggests",
    "Conflicts",
    "Replaces",
    "Provides",
    "Section",
    "Priority",
    "Homepage",
    "Description",
  ];

  const lines: string[] = [];
  const seen = new Set<string>();

  for (const key of orderedFields) {
    if (control[key] !== undefined) {
      lines.push(formatField(key, control[key]));
      seen.add(key);
    }
  }

  // Insert apt-required fields after the standard ones.
  lines.push(`Filename: ${filename}`);
  lines.push(`Size: ${data.length}`);
  lines.push(`MD5sum: ${hashHex("md5", data)}`);
  lines.push(`SHA1: ${hashHex("sha1", data)}`);
  lines.push(`SHA256: ${hashHex("sha256", data)}`);

  // Remaining control fields not in the standard set (e.g. Maemo-* metadata).
  for (const [key, value] of Object.entries(control)) {
    if (!seen.has(key)) {
      lines.push(formatField(key, value));
    }
  }

  return lines.join("\n");
}

/**
 * Format a control-file field, applying continuation-line rules:
 *   "Description: short\n\nlong\nlong" becomes:
 *     Description: short
 *      .
 *      long
 *      long
 * Empty continuation lines become " ." (literal-blank-line marker).
 */
function formatField(key: string, value: string): string {
  const valueLines = value.split("\n");
  const head = `${key}: ${valueLines[0]}`;
  const tail = valueLines.slice(1).map((line) => {
    if (line === "") return " .";
    return ` ${line}`;
  });
  return [head, ...tail].join("\n");
}

function hashHex(algo: "md5" | "sha1" | "sha256", data: Uint8Array): string {
  return createHash(algo).update(data).digest("hex");
}

// ---------- R2 helpers ----------

async function listRepoDebs(): Promise<string[]> {
  const prefix = `${REPO_PATH}/`;
  const objects: string[] = [];

  // S3Client.list is paginated. Iterate until done.
  let continuationToken: string | undefined;
  do {
    const result = await r2.list({
      prefix,
      continuationToken,
    });
    for (const obj of result.contents ?? []) {
      if (obj.key && obj.key.endsWith(".deb")) {
        objects.push(obj.key);
      }
    }
    continuationToken = result.isTruncated
      ? result.nextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

async function downloadObject(key: string): Promise<Uint8Array> {
  const file = r2.file(key);
  const arrayBuffer = await file.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function uploadObject(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const file = r2.file(key);
  await file.write(data, { type: contentType });
}

// ---------- main ----------

async function main() {
  // 1. Inspect the freshly built .deb.
  const localBytes = await readFile(LOCAL_DEB);
  const localBuf = new Uint8Array(localBytes);
  const control = await readControlFields(LOCAL_DEB);

  const pkgName = control["Package"];
  const version = control["Version"];
  const arch = control["Architecture"];
  if (!pkgName || !version || !arch) {
    throw new Error(
      `${LOCAL_DEB}: missing Package/Version/Architecture in control file`,
    );
  }

  const versionedName = `${pkgName}_${version}_${arch}.deb`;
  const versionedKey = `${REPO_PATH}/${versionedName}`;
  console.log(`==> Built: ${pkgName} ${version} (${arch})`);
  console.log(`==> Publishing as: ${versionedName}`);

  // 2. List existing .debs in the repo.
  const existingKeys = await listRepoDebs();
  console.log(`==> Existing repo objects: ${existingKeys.length}`);

  // 3. Collect all stanzas. For existing .debs we need their control fields
  //    plus their checksums, which means downloading the bytes. For a small
  //    repo (handful of packages) this is fine; revisit if it grows.
  const stanzas: string[] = [];

  for (const key of existingKeys) {
    // Skip the slot we're about to overwrite — we'll add it from local bytes.
    if (key === versionedKey) continue;

    console.log(`    indexing ${key}`);
    const bytes = await downloadObject(key);
    const existingControl = readControlFieldsFromBytes(bytes, key);
    // Filename in Packages is relative to the repo root.
    const relName = key.slice(REPO_PATH.length + 1);
    stanzas.push(buildPackagesStanza(existingControl, relName, bytes));
  }

  // 4. Add the freshly built .deb's stanza.
  stanzas.push(buildPackagesStanza(control, versionedName, localBuf));

  // 5. Combine and gzip. Packages is just stanzas separated by blank lines.
  const packagesText = stanzas.join("\n\n") + "\n";
  const packagesGz = gzipSync(Buffer.from(packagesText, "utf-8"), { level: 9 });
  console.log(
    `==> Generated Packages.gz: ${stanzas.length} stanzas, ${packagesGz.length} bytes`,
  );

  // 6. Upload. Order: .deb first so it's reachable by the time clients see
  //    its entry in the new index.
  await uploadObject(
    versionedKey,
    localBuf,
    "application/vnd.debian.binary-package",
  );
  console.log(`==> Uploaded ${versionedKey}`);

  await uploadObject(
    `${REPO_PATH}/Packages.gz`,
    packagesGz,
    "application/gzip",
  );
  console.log(`==> Uploaded ${REPO_PATH}/Packages.gz`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("publish-repo failed:", err);
  process.exit(1);
});
