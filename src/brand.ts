import { BRAND } from './rewrite';

const WORDMARK_IMG_RE = /<img\b[^>]*class="[^"]*\bmw-logo-wordmark\b[^"]*"[^>]*>/i;
const TAGLINE_IMG_RE = /<img\b[^>]*class="[^"]*\bmw-logo-tagline\b[^"]*"[^>]*>/i;

// Wikipedia ships the wordmark and tagline as images, so they are replaced
// with text carrying the same classes; the skin's own rules then size and
// place them, and a redesign is inherited rather than chased.
const WORDMARK_STYLE =
  "font-family:'Linux Libertine','Georgia','Times New Roman',serif;" +
  'font-size:1.4em;line-height:1;letter-spacing:0.01em;color:inherit;' +
  'display:inline-block;white-space:nowrap';
const TAGLINE_STYLE =
  "font-family:'Linux Libertine','Georgia','Times New Roman',serif;" +
  'font-size:0.68em;line-height:1.2;color:inherit;display:inline-block;white-space:nowrap';

// The upstream wordmark sets the first and last letters at full height with
// the middle in small capitals, as in WIKIPEDIA.
function smallCaps(text: string): string {
  if (text.length < 3) return text.toUpperCase();
  const first = text.charAt(0).toUpperCase();
  const middle = text.slice(1, -1).toUpperCase();
  const last = text.charAt(text.length - 1).toUpperCase();
  return `${first}<span style="font-size:0.78em">${middle}</span>${last}`;
}

// Minerva brands with a bare wordmark image inside .branding-box; Vector uses
// classed wordmark and tagline images. Both are replaced with text so the
// skin's own rules keep sizing and placing them.
const BRANDING_BOX_IMG_RE =
  /(<div\b[^>]*class="[^"]*\bbranding-box\b[^"]*"[^>]*>[\s\S]{0,400}?)<img\b[^>]*wordmark[^>]*>/i;

export function brandChrome(html: string): string {
  const wordmark = `<span class="mw-logo-wordmark" style="${WORDMARK_STYLE}">${smallCaps(BRAND.wordmark)}</span>`;
  let out = html.replace(WORDMARK_IMG_RE, wordmark);
  out = out.replace(
    TAGLINE_IMG_RE,
    `<span class="mw-logo-tagline" style="${TAGLINE_STYLE}">${BRAND.tagline}</span>`,
  );
  if (!out.includes('mw-logo-wordmark')) {
    out = out.replace(BRANDING_BOX_IMG_RE, (_m, lead: string) => lead + wordmark);
  }
  return out;
}

const COPYRIGHT_LI_RE = /(<li\b[^>]*id="footer-info-copyright"[^>]*>)([\s\S]*?)(<\/li>)/i;

// The licence notice stays verbatim; the parody credit is added beside it.
export function addFooterCredit(html: string): string {
  if (html.includes('pikiwedia-credit')) return html;
  const credited = html.replace(
    COPYRIGHT_LI_RE,
    (_m, open: string, body: string, close: string) =>
      `${open}${body}${close}<li id="pikiwedia-credit">${BRAND.credit}</li>`,
  );
  if (credited !== html) return credited;
  return html.replace(
    /<\/body>/i,
    `<div id="pikiwedia-credit" style="text-align:center;padding:1em;font-size:0.875em">${BRAND.credit}</div></body>`,
  );
}

export function retitleDocument(html: string, display: string): string {
  return html.replace(
    /<title>([\s\S]*?)<\/title>/i,
    () => `<title>${display} - ${BRAND.wordmark}</title>`,
  );
}
