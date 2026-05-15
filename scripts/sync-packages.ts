/**
 * sync-packages.ts
 *
 * Fetches all 5 Packages.gz files from the mirror, parses Debian control-file
 * stanzas, and writes:
 *   - src/data/packages.json       (full catalog, used by Astro pages)
 *   - public/search-index.json     (small client-side search manifest)
 *
 * Run via:  bun run sync-packages
 *
 * Idempotent. Safe to re-run. Build-time only — no runtime dependency on these
 * URLs (the JSON files are committed to the build output).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface RepoConfig {
  id: string;
  label: string;
  url: string;
  filePrefix: string;
}

const REPOS: RepoConfig[] = [
  {
    id: "mpw",
    label: "mpw",
    url: "http://n9.mpw.sh/repo/Packages.gz",
    filePrefix: "http://n9.mpw.sh/repo/",
  },
  {
    id: "apt-repo",
    label: "Community repo",
    url: "http://n9.mpw.sh/apt-repo/dists/unstable/main/binary-armel/Packages.gz",
    filePrefix: "http://n9.mpw.sh/apt-repo/",
  },
  {
    id: "n9mirror-001",
    label: "Nokia core",
    url: "http://n9.mpw.sh/n9mirror/001/Packages.gz",
    filePrefix: "http://n9.mpw.sh/n9mirror/001/",
  },
  {
    id: "n9mirror-apps",
    label: "Nokia apps",
    url: "http://n9.mpw.sh/n9mirror/apps/Packages.gz",
    filePrefix: "http://n9.mpw.sh/n9mirror/apps/",
  },
  {
    id: "n9mirror-tools",
    label: "Developer tools",
    url: "http://n9.mpw.sh/n9mirror/tools/Packages.gz",
    filePrefix: "http://n9.mpw.sh/n9mirror/tools/",
  },
  {
    id: "openrepos",
    label: "OpenRepos",
    url: "http://n9.mpw.sh/openrepos/Packages.gz",
    filePrefix: "http://n9.mpw.sh/openrepos/",
  },
];

export interface ParsedPackage {
  // Identity
  name: string;
  version: string;
  architecture: string;
  // Repo origin
  repoId: string;
  repoLabel: string;
  // Download
  filename: string; // path within the repo, from Packages.gz "Filename:"
  downloadUrl: string; // absolute, built from filePrefix + filename
  size: number;
  md5sum?: string;
  sha1?: string;
  sha256?: string;
  // Metadata
  maintainer?: string;
  description?: string; // raw, with newlines preserved
  descriptionShort: string; // first line, never empty (falls back to "(no description)")
  section?: string;
  homepage?: string;
  depends?: string;
  recommends?: string;
  suggests?: string;
  conflicts?: string;
  provides?: string;
  // Visual
  icon?: string; // base64 PNG, no data: prefix
}

/**
 * Decompress a gzipped Response body using the platform DecompressionStream.
 * Works in both Bun and Node 18+ (where DecompressionStream is global).
 */
async function gunzipResponse(res: Response): Promise<string> {
  if (!res.body) throw new Error("Response had no body");
  const ds = new DecompressionStream("gzip");
  const decompressed = res.body.pipeThrough(ds);
  const text = await new Response(decompressed).text();
  return text;
}

/**
 * Parse a Debian control-file body into stanzas.
 *
 * Format:
 *   - Stanzas separated by blank line
 *   - Within a stanza: "Key: value" per line
 *   - Continuation lines start with whitespace and append to the prior key's
 *     value (joined with "\n", minus the leading space)
 *   - A literal "." on a continuation line means a blank line (used in
 *     Description fields)
 */
function parseStanzas(text: string): Record<string, string>[] {
  const stanzas: Record<string, string>[] = [];
  // Normalize line endings, strip BOM
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = block.split("\n");
    const stanza: Record<string, string> = {};
    let currentKey: string | null = null;

    for (const line of lines) {
      if (!line) continue;
      // Continuation line: starts with space or tab
      if (/^[ \t]/.test(line)) {
        if (!currentKey) continue;
        // Strip exactly one leading whitespace char
        let cont = line.slice(1);
        // "." on its own = literal blank line
        if (cont === ".") cont = "";
        stanza[currentKey] = stanza[currentKey]
          ? stanza[currentKey] + "\n" + cont
          : cont;
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx < 0) continue;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        stanza[key] = value;
        currentKey = key;
      }
    }

    if (Object.keys(stanza).length > 0) {
      stanzas.push(stanza);
    }
  }

  return stanzas;
}

function firstLine(s: string | undefined): string {
  if (!s) return "(no description)";
  const line = s.split("\n", 1)[0]?.trim();
  return line || "(no description)";
}

function normalizeBase64(s: string | undefined): string | undefined {
  if (!s) return undefined;
  // Strip all whitespace; the continuation-line format inserts plenty.
  const stripped = s.replace(/\s+/g, "");
  return stripped || undefined;
}

function stanzaToPackage(
  stanza: Record<string, string>,
  repo: RepoConfig,
): ParsedPackage | null {
  const name = stanza["Package"];
  const filename = stanza["Filename"];
  if (!name || !filename) return null;

  const arch = stanza["Architecture"] || "";
  // Per the plan: filter out anything not armel or all
  if (arch && arch !== "armel" && arch !== "all") return null;

  const sizeRaw = stanza["Size"];
  const size = sizeRaw ? parseInt(sizeRaw, 10) : 0;

  const description = stanza["Description"];

  return {
    name,
    version: stanza["Version"] || "",
    architecture: arch,
    repoId: repo.id,
    repoLabel: repo.label,
    filename,
    downloadUrl: repo.filePrefix + filename,
    size: Number.isFinite(size) ? size : 0,
    md5sum: stanza["MD5sum"] || stanza["MD5Sum"],
    sha1: stanza["SHA1"],
    sha256: stanza["SHA256"],
    maintainer: stanza["Maintainer"],
    description,
    descriptionShort: firstLine(description),
    section: stanza["Section"],
    homepage: stanza["Homepage"],
    depends: stanza["Depends"],
    recommends: stanza["Recommends"],
    suggests: stanza["Suggests"],
    conflicts: stanza["Conflicts"],
    provides: stanza["Provides"],
    // The N9 launcher icon. Field name varies; try the common one first.
    icon: normalizeBase64(
      stanza["Maemo-Icon-26"] || stanza["XB-Maemo-Icon-26"],
    ),
  };
}

async function fetchRepo(repo: RepoConfig): Promise<ParsedPackage[]> {
  console.log(`  fetching ${repo.id}…`);
  const res = await fetch(repo.url);
  if (!res.ok) {
    throw new Error(`  ${repo.id}: HTTP ${res.status} from ${repo.url}`);
  }
  const text = await gunzipResponse(res);
  const stanzas = parseStanzas(text);
  const packages: ParsedPackage[] = [];
  let skipped = 0;
  for (const stanza of stanzas) {
    const pkg = stanzaToPackage(stanza, repo);
    if (pkg) packages.push(pkg);
    else skipped++;
  }
  console.log(`  ${repo.id}: ${packages.length} packages (${skipped} skipped)`);
  return packages;
}

async function writeJSON(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

async function main() {
  console.log("Syncing package metadata from", REPOS.length, "repos…");
  const all: ParsedPackage[] = [];
  for (const repo of REPOS) {
    try {
      const packages = await fetchRepo(repo);
      all.push(...packages);
    } catch (err) {
      console.warn(`  ${repo.id}: skipped`, (err as Error).message);
    }
  }
  console.log(`Total: ${all.length} packages across all repos`);

  // Full catalog → used by Astro pages at build time
  await writeJSON("src/data/packages.json", all);
  console.log("  wrote src/data/packages.json");

  // Slim client-side search manifest. Keep keys short to save bytes.
  const searchIndex = all.map((p) => ({
    n: p.name,
    d: p.descriptionShort,
    r: p.repoId,
    v: p.version,
  }));
  await writeJSON("public/search-index.json", searchIndex);
  console.log("  wrote public/search-index.json");
}

main().catch((err) => {
  console.error("sync-packages failed:", err);
  process.exit(1);
});
