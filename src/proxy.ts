import { addFooterCredit, brandChrome, retitleDocument } from './brand';
import { transmuteText, transmuteTitle, type Pins } from './engine';
import { rewriteHtml } from './rewrite';

export const UPSTREAM = 'en.wikipedia.org';
export const UPSTREAM_HOSTS = new Set([
  'en.wikipedia.org',
  'en.m.wikipedia.org',
  'www.wikipedia.org',
]);

export const HTML_TTL_SECONDS = 3600;

const CONTACT = 'https://github.com/sean-reid/pikiwedia';

const MOBILE_UA_RE = /Android|iPhone|iPod|Windows Phone|BlackBerry|Mobile Safari|Opera Mini/i;

// The upstream varies its skin by User-Agent, so the visitor's device class is
// forwarded and folded into the cache key.
export function isMobile(userAgent: string): boolean {
  return MOBILE_UA_RE.test(userAgent) && !/iPad|Tablet/i.test(userAgent);
}

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function upstreamUserAgent(mobile: boolean): string {
  return `${mobile ? MOBILE_UA : DESKTOP_UA} Pikiwedia/1.0 (${CONTACT})`;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'content-encoding',
  'content-length',
  'strict-transport-security',
  'report-to',
  'nel',
  'set-cookie',
  'public-key-pins',
]);

export function titleFromPath(pathname: string): string {
  const m = /^\/wiki\/(.+)$/.exec(pathname);
  if (!m) return '';
  let slug = m[1] ?? '';
  const hash = slug.indexOf('#');
  if (hash !== -1) slug = slug.slice(0, hash);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // A malformed escape is left as written rather than failing the request.
  }
  return slug.replace(/_/g, ' ');
}

// Article links are made relative so browsing never escapes the parody and no
// deployment host is baked into the markup. Paths keep the real slugs and stay
// resolvable upstream. Asset hosts are left alone so images and scripts still
// load from Wikimedia.
export function rewriteUrls(html: string): string {
  let out = html;
  for (const upstreamHost of UPSTREAM_HOSTS) {
    for (const prefix of ['/wiki/', '/w/']) {
      out = out
        .split(`https://${upstreamHost}${prefix}`)
        .join(prefix)
        .split(`http://${upstreamHost}${prefix}`)
        .join(prefix)
        .split(`//${upstreamHost}${prefix}`)
        .join(prefix);
    }
  }
  return out;
}

export function shouldTransmute(contentType: string | null): boolean {
  return !!contentType && /^text\/html/i.test(contentType);
}

export function isSearchApi(pathname: string, contentType: string | null): boolean {
  if (!contentType || !/^application\/json/i.test(contentType)) return false;
  return pathname.startsWith('/w/api.php') || pathname.startsWith('/w/rest.php');
}

// Display-only fields. The slug lives in "key", so navigation still resolves
// upstream while the dropdown reads as the parody.
const DISPLAY_KEYS = new Set([
  'title',
  'excerpt',
  'description',
  'snippet',
  'displaytitle',
  'matched_title',
  'label',
]);

export interface SearchRewrite {
  body: string;
  // transmuted display title -> real slug, so a typeahead click can be
  // routed back to the article the display name stands for.
  pairs: Array<{ display: string; slug: string }>;
}

export function transmuteSearchJson(body: string, pins: Pins, density?: number): SearchRewrite {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body, pairs: [] };
  }

  const pairs: Array<{ display: string; slug: string }> = [];

  const text = (value: string, seed: string): string =>
    /\p{L}{3}/u.test(value) ? transmuteText(value, ['search', seed], pins, density) : value;

  const walk = (node: unknown, key: string): unknown => {
    if (typeof node === 'string') {
      if (/^(https?:)?\/\//.test(node)) return rewriteUrls(node);
      return DISPLAY_KEYS.has(key) ? text(node, key) : node;
    }
    if (Array.isArray(node)) return node.map((v) => walk(v, key));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v, k);
      const rec = out as { key?: unknown; title?: unknown };
      if (typeof rec.key === 'string' && typeof rec.title === 'string' && rec.key) {
        pairs.push({ display: rec.title, slug: rec.key });
      }
      return out;
    }
    return node;
  };

  // opensearch answers with [query, titles, descriptions, urls] and no keys to
  // go by, so its display arrays are addressed positionally.
  if (Array.isArray(parsed) && parsed.length === 4 && Array.isArray(parsed[1])) {
    const [query, titles, descriptions, urls] = parsed as [string, string[], string[], string[]];
    const outTitles = titles.map((t) => text(t, 'title'));
    const outUrls = urls.map((u) => rewriteUrls(u));
    outTitles.forEach((t, i) => {
      const slug = /^\/wiki\/(.+)$/.exec(outUrls[i] ?? '')?.[1];
      if (slug) pairs.push({ display: t, slug });
    });
    return {
      body: JSON.stringify([
        query,
        outTitles,
        descriptions.map((d) => text(d, 'description')),
        outUrls,
      ]),
      pairs,
    };
  }

  return { body: JSON.stringify(walk(parsed, '')), pairs };
}

const SEARCH_MAP_ORIGIN = 'https://searchmap.pikiwedia.invalid/';

function searchMapKey(display: string): Request {
  return new Request(SEARCH_MAP_ORIGIN + encodeURIComponent(display.trim().toLowerCase()));
}

async function rememberSearchPairs(pairs: Array<{ display: string; slug: string }>): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open('searchmap');
  await Promise.all(
    pairs.map(({ display, slug }) =>
      cache.put(
        searchMapKey(display),
        new Response(slug, { headers: { 'cache-control': `max-age=${HTML_TTL_SECONDS}` } }),
      ),
    ),
  );
}

async function lookupSearchPair(display: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open('searchmap');
  const hit = await cache.match(searchMapKey(display));
  return hit ? hit.text() : null;
}

// The typeahead links each suggestion to Special:Search with the DISPLAY
// title as the query, marked wprov=acrw1_N. The display is our transmuted
// text, which the upstream search cannot resolve, so the click is answered
// from the remembered display-to-slug map instead.
export function typeaheadClick(url: URL): { display: string; fragment: string } | null {
  if (url.pathname !== '/w/index.php') return null;
  if (url.searchParams.get('title') !== 'Special:Search') return null;
  if (!(url.searchParams.get('wprov') ?? '').startsWith('acrw')) return null;
  const q = url.searchParams.get('search') ?? '';
  if (!q) return null;
  const hash = q.indexOf('#');
  if (hash === -1) return { display: q, fragment: '' };
  return { display: q.slice(0, hash), fragment: q.slice(hash + 1) };
}

function passthroughHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

export interface HandleOptions {
  density?: number;
}

export async function handle(request: Request, opts: HandleOptions = {}): Promise<Response> {
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Pikiwedia serves reads only.', { status: 405 });
  }

  if (url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (url.pathname === '/') {
    return Response.redirect(`${url.origin}/wiki/Main_Page`, 302);
  }

  const click = typeaheadClick(url);
  if (click) {
    const slug = await lookupSearchPair(click.display);
    if (slug) {
      const fragment = click.fragment ? '#' + click.fragment.replace(/ /g, '_') : '';
      return Response.redirect(`${url.origin}/wiki/${slug}${fragment}`, 302);
    }
  }

  const mobile = isMobile(request.headers.get('user-agent') ?? '');
  const upstreamUrl = new URL(url.pathname + url.search, `https://${UPSTREAM}`);

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: {
      'user-agent': upstreamUserAgent(mobile),
      accept: request.headers.get('accept') ?? '*/*',
      'accept-language': request.headers.get('accept-language') ?? 'en',
    },
    redirect: 'follow',
  });

  const upstream = await fetch(upstreamRequest, {
    cf: { cacheTtlByStatus: { '200-299': HTML_TTL_SECONDS, '404': 60, '500-599': 0 } },
  });

  const contentType = upstream.headers.get('content-type');
  const headers = passthroughHeaders(upstream.headers);
  headers.set('x-pikiwedia-upstream', String(upstream.status));

  if (isSearchApi(url.pathname, contentType)) {
    const { pins } = transmuteTitle(titleFromPath(url.pathname) || 'Pikiwedia');
    const { body, pairs } = transmuteSearchJson(await upstream.text(), pins, opts.density);
    await rememberSearchPairs(pairs);
    headers.set('cache-control', `public, max-age=0, s-maxage=${HTML_TTL_SECONDS}`);
    return new Response(body, { status: upstream.status, headers });
  }

  if (!shouldTransmute(contentType)) {
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const raw = await upstream.text();
  const title = titleFromPath(url.pathname) || 'Pikiwedia';
  const { display, pins } = transmuteTitle(title);

  let html = rewriteHtml(raw, { pins, seed: title, density: opts.density });
  html = brandChrome(html);
  html = retitleDocument(html, display);
  html = addFooterCredit(html);
  html = rewriteUrls(html);

  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', `public, max-age=0, s-maxage=${HTML_TTL_SECONDS}`);
  headers.set('x-pikiwedia-title', encodeURIComponent(display));
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  return new Response(html, { status: upstream.status, headers });
}
