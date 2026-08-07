import { addFooterCredit, brandChrome, retitleDocument } from './brand';
import { transmuteTitle } from './engine';
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

// Links stay on this host so browsing never escapes the parody, while the
// paths themselves keep the real slugs and remain resolvable upstream.
export function rewriteUrls(html: string, host: string, scheme: string): string {
  let out = html;
  for (const upstreamHost of UPSTREAM_HOSTS) {
    out = out
      .split(`https://${upstreamHost}/wiki/`)
      .join(`${scheme}://${host}/wiki/`)
      .split(`https://${upstreamHost}/w/`)
      .join(`${scheme}://${host}/w/`)
      .split(`//${upstreamHost}/wiki/`)
      .join(`//${host}/wiki/`);
  }
  return out;
}

export function shouldTransmute(contentType: string | null): boolean {
  return !!contentType && /^text\/html/i.test(contentType);
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
  html = rewriteUrls(html, url.host, url.protocol.replace(':', ''));

  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', `public, max-age=0, s-maxage=${HTML_TTL_SECONDS}`);
  headers.set('x-pikiwedia-title', encodeURIComponent(display));
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  return new Response(html, { status: upstream.status, headers });
}
