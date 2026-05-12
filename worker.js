/**
 * N9 Mirror Worker
 *
 * Workers serves Astro's static output via the ASSETS binding automatically.
 * This worker handles two things only:
 *   1. /api/list — JSON listing of the R2 bucket (used by the browser UI)
 *   2. any other path that isn't a static asset — try to serve it from R2
 *
 * The runtime calls our fetch() only when ASSETS has no match for the path,
 * so the bandwidth-heavy site files (HTML/CSS/JS/.deb in public/) never touch
 * this code.
 *
 * R2 behaviour:
 *   - Exact-key lookup first.
 *   - Directory-style URL (trailing slash) → look for /index.html under it.
 *   - Extension-less key with a matching /index.html → 301 redirect to add the slash
 *     (so relative links in the doc HTML resolve correctly).
 */

const CACHE_INDEX_SECONDS = 300;          // 5 min for apt index files
const CACHE_PACKAGE_SECONDS = 31536000;   // 1 year for frozen .debs
const CACHE_DOCS_SECONDS = 86400;         // 1 day for docs HTML

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  pdf: 'application/pdf',
  deb: 'application/vnd.debian.binary-package',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  zip: 'application/zip',
  tar: 'application/x-tar',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    if (path === '/api/list') {
      return handleList(url, env);
    }

    const key = path.replace(/^\//, '');
    if (!key) {
      return new Response('Not Found', { status: 404 });
    }

    // Directory-style URL: /docs/  →  docs/index.html
    if (key.endsWith('/')) {
      const indexKey = key + 'index.html';
      const obj = await env.BUCKET.get(indexKey);
      if (obj) return respond(obj, indexKey, CACHE_DOCS_SECONDS);
      return new Response('Not Found', { status: 404 });
    }

    // Try exact key
    const direct = await env.BUCKET.get(key);
    if (direct) {
      return respond(direct, key, ttlFor(key));
    }

    // No exact match, no extension → maybe it's a directory missing the slash.
    // /docs  →  redirect to /docs/  if docs/index.html exists.
    if (!hasExtension(key)) {
      const head = await env.BUCKET.head(key + '/index.html');
      if (head) {
        return Response.redirect(url.origin + '/' + key + '/', 301);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

function hasExtension(key) {
  const lastSlash = key.lastIndexOf('/');
  const tail = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
  return tail.includes('.');
}

function ttlFor(key) {
  if (/\/(Release|InRelease|Release\.gpg|Packages(\.gz|\.bz2|\.xz)?)$/i.test(key)) {
    return CACHE_INDEX_SECONDS;
  }
  if (key.startsWith('docs/')) return CACHE_DOCS_SECONDS;
  return CACHE_PACKAGE_SECONDS;
}

function contentTypeFor(key) {
  const dot = key.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  const ext = key.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function respond(object, key, ttlSeconds) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', `public, max-age=${ttlSeconds}`);

  // R2 typically stores objects without a content-type, or as octet-stream.
  // Override with extension-based lookup so HTML/CSS/JS render correctly.
  const ct = headers.get('content-type');
  if (!ct || ct === 'application/octet-stream') {
    headers.set('content-type', contentTypeFor(key));
  }

  return new Response(object.body, { headers });
}

async function handleList(url, env) {
  let prefix = url.searchParams.get('prefix') || '';
  if (prefix.startsWith('/')) prefix = prefix.slice(1);
  if (prefix && !prefix.endsWith('/')) prefix += '/';

  const cursor = url.searchParams.get('cursor') || undefined;
  const listing = await env.BUCKET.list({
    prefix,
    delimiter: '/',
    limit: 1000,
    cursor,
  });

  const folders = (listing.delimitedPrefixes || []).map((p) => ({
    name: p.slice(prefix.length).replace(/\/$/, ''),
    path: p,
  }));

  const files = listing.objects
    .filter((o) => o.key !== prefix)
    .map((o) => ({
      name: o.key.slice(prefix.length),
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      etag: o.etag,
    }));

  return jsonResponse({
    prefix,
    folders,
    files,
    truncated: listing.truncated,
    cursor: listing.truncated ? listing.cursor : null,
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
