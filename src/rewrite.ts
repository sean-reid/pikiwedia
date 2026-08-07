import { transmuteText, type Pins } from './engine';

export const BRAND = {
  wordmark: 'Pikiwedia',
  tagline: 'The Lee Enfrycodepia',
  credit: 'A parody of Wikipedia. All content derives from wikipedia.org.',
};

// Wikipedia markup whose text is cited, foreign, or machine-read; transmuting
// any of it produces noise instead of a joke.
const SKIP_TAGS = new Set([
  'script',
  'style',
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  'math',
  'svg',
  'textarea',
  'title',
]);

const SKIP_CLASS_RE =
  /\b(reference|references|reflist|refbegin|citation|mw-references|mw-reference-text|IPA|ipa|mw-editsection|mw-jump-link|navbox|catlinks|printfooter|mw-indicators|licence|license|footer-info|footer-places|mw-editform)\b/;

const SKIP_ID_RE =
  /^(References|Bibliography|Further_reading|External_links|Notes|Sources|Citations|footer-info-copyright|siteSub)$/;

const TEXT_ATTRS = ['title', 'alt', 'aria-label', 'placeholder'];
const TEXT_ATTR_TAGS = new Set(['a', 'img', 'abbr', 'span', 'div', 'input', 'button', 'li']);

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

interface Attr {
  name: string;
  before: string;
  value: string | null;
  quote: string;
}

interface ParsedTag {
  name: string;
  attrs: Attr[];
  trailing: string;
}

// Attribute values carry escaped HTML, since Parsoid's data-mw JSON holds
// whole tags; a regex over raw tag text matches attribute names nested inside
// those values, so attributes are parsed positionally instead.
export function parseTag(seg: string): ParsedTag | null {
  const m = /^<\s*([A-Za-z][A-Za-z0-9-]*)/.exec(seg);
  if (!m) return null;
  const name = (m[1] ?? '').toLowerCase();
  const attrs: Attr[] = [];
  const end = seg.length - 1;
  let i = m[0].length;

  while (i < end) {
    const wsStart = i;
    while (i < end && /\s/.test(seg[i] ?? '')) i++;
    if (i >= end || seg[i] === '/') {
      i = wsStart;
      break;
    }
    const before = seg.slice(wsStart, i);
    const nameStart = i;
    while (i < end && !/[\s=/]/.test(seg[i] ?? '')) i++;
    if (i === nameStart) {
      i = wsStart;
      break;
    }
    const attrName = seg.slice(nameStart, i);
    let j = i;
    while (j < end && /\s/.test(seg[j] ?? '')) j++;
    if (seg[j] !== '=') {
      attrs.push({ name: attrName, before, value: null, quote: '' });
      continue;
    }
    j++;
    while (j < end && /\s/.test(seg[j] ?? '')) j++;
    const q = seg[j];
    if (q === '"' || q === "'") {
      const close = seg.indexOf(q, j + 1);
      if (close === -1 || close >= seg.length) {
        i = wsStart;
        break;
      }
      attrs.push({ name: attrName, before, value: seg.slice(j + 1, close), quote: q });
      i = close + 1;
    } else {
      let k = j;
      while (k < end && !/[\s>]/.test(seg[k] ?? '')) k++;
      attrs.push({ name: attrName, before, value: seg.slice(j, k), quote: '' });
      i = k;
    }
  }
  return { name, attrs, trailing: seg.slice(i, seg.length - 1) };
}

// A ">" inside a quoted attribute value does not end the tag, and an
// apostrophe inside a double-quoted value opens nothing, so quote state is
// tracked rather than counted.
export function findTagEnd(html: string, start: number): number {
  let quote = '';
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '>') return i;
  }
  return -1;
}

function serializeTag(tag: ParsedTag): string {
  let s = '<' + tag.name;
  for (const a of tag.attrs) {
    s += (a.before || ' ') + a.name;
    if (a.value !== null) s += '=' + a.quote + a.value + a.quote;
  }
  return s + tag.trailing + '>';
}

function getAttr(tag: ParsedTag, name: string): string | null {
  for (const a of tag.attrs) if (a.name.toLowerCase() === name) return a.value ?? '';
  return null;
}

const ENTITY_RE = /&(?:#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,31});/g;
const SENTINEL = '\u0011';

// Entities are lifted out before tokenizing: their letters are not words, and
// decoding them loses distinctions the page relies on, such as &nbsp;.
function shield(s: string): { text: string; entities: string[] } {
  const entities: string[] = [];
  const text = s.replace(ENTITY_RE, (e) => {
    entities.push(e);
    return SENTINEL + (entities.length - 1) + SENTINEL;
  });
  return { text, entities };
}

function unshield(text: string, entities: string[]): string {
  if (entities.length === 0) return text;
  return text.replace(
    new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g'),
    (_m, n: string) => entities[Number(n)] ?? '',
  );
}

function opensSkip(tag: ParsedTag): boolean {
  if (SKIP_TAGS.has(tag.name)) return true;
  if (SKIP_CLASS_RE.test(getAttr(tag, 'class') ?? '')) return true;
  if (SKIP_ID_RE.test(getAttr(tag, 'id') ?? '')) return true;
  const lang = getAttr(tag, 'lang');
  if (lang !== null && lang !== '' && !/^en\b/i.test(lang)) return true;
  return false;
}

interface Frame {
  tag: string;
  skip: boolean;
}

export interface RewriteOptions {
  pins: Pins;
  seed: string;
  density?: number;
}

// Markup is copied through byte for byte; only text nodes outside protected
// subtrees reach the engine. A block counter seeds each region so a page
// always renders the same way.
export function rewriteHtml(html: string, opts: RewriteOptions): string {
  const { pins, seed, density } = opts;
  const stack: Frame[] = [];
  let skipDepth = 0;
  let out = '';
  let i = 0;
  let block = 0;

  const skipping = (): boolean => skipDepth > 0;

  const transmuteChunk = (text: string, n: number): string => {
    if (!/\p{L}{3}/u.test(text)) return text;
    const { text: shielded, entities } = shield(text);
    return unshield(transmuteText(shielded, [seed, String(n)], pins, density), entities);
  };

  const rewriteAttrs = (tag: ParsedTag, original: string, n: number): string => {
    if (!TEXT_ATTR_TAGS.has(tag.name)) return original;
    let touched = false;
    for (const a of tag.attrs) {
      if (a.value === null || a.quote === '') continue;
      if (!TEXT_ATTRS.includes(a.name.toLowerCase())) continue;
      if (!/\p{L}{3}/u.test(a.value)) continue;
      const { text: shielded, entities } = shield(a.value);
      const swapped = unshield(
        transmuteText(shielded, [seed, a.name, String(n)], pins, density),
        entities,
      );
      if (swapped === a.value) continue;
      a.value = a.quote === '"' ? swapped.replace(/"/g, '&quot;') : swapped.replace(/'/g, '&#39;');
      touched = true;
    }
    return touched ? serializeTag(tag) : original;
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += skipping() ? html.slice(i) : transmuteChunk(html.slice(i), block++);
      break;
    }
    if (lt > i) {
      const text = html.slice(i, lt);
      out += skipping() ? text : transmuteChunk(text, block++);
    }

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt);
      const stop = end === -1 ? html.length : end + 3;
      out += html.slice(lt, stop);
      i = stop;
      continue;
    }

    const gt = findTagEnd(html, lt);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    const seg = html.slice(lt, gt + 1);

    const m = /^<\s*(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(seg);
    if (!m) {
      out += seg;
      i = gt + 1;
      continue;
    }
    const closing = m[1] === '/';
    const tagName = (m[2] ?? '').toLowerCase();

    if (closing) {
      for (let d = stack.length - 1; d >= 0; d--) {
        if (stack[d]?.tag !== tagName) continue;
        for (let k = stack.length - 1; k >= d; k--) {
          if (stack[k]?.skip) skipDepth--;
          stack.pop();
        }
        break;
      }
      out += seg;
      i = gt + 1;
      continue;
    }

    const parsed = parseTag(seg);
    const skip = parsed ? opensSkip(parsed) : false;
    if (skipping() || skip || !parsed) out += seg;
    else out += rewriteAttrs(parsed, seg, block++);

    if (!(seg.endsWith('/>') || VOID_TAGS.has(tagName))) {
      stack.push({ tag: tagName, skip });
      if (skip) skipDepth++;
    }
    i = gt + 1;
  }

  return out;
}
