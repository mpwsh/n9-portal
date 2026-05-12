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
 */

const CACHE_INDEX_SECONDS = 300;          // 5 min for apt index files
const CACHE_PACKAGE_SECONDS = 31536000;   // 1 year for frozen .debs

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    if (path === '/api/list') {
      return handleList(url, env);
    }

    // Strip leading slash to get an R2 key, then try to serve it
    const key = path.replace(/^\//, '');
    if (!key) {
      return new Response('Not Found', { status: 404 });
    }

    const isIndex = /\/(Release|InRelease|Release\.gpg|Packages(\.gz|\.bz2|\.xz)?)$/i.test(key);
    const ttl = isIndex ? CACHE_INDEX_SECONDS : CACHE_PACKAGE_SECONDS;
    return serveR2Object(env, key, ttl);
  },
};

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

async function serveR2Object(env, key, ttlSeconds) {
  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', `public, max-age=${ttlSeconds}`);

  if (!headers.has('content-type')) {
    if (key.endsWith('.deb')) headers.set('content-type', 'application/vnd.debian.binary-package');
    else if (key.endsWith('.gz')) headers.set('content-type', 'application/gzip');
    else headers.set('content-type', 'application/octet-stream');
  }

  return new Response(object.body, { headers });
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
