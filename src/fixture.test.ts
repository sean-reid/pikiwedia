import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transmuteTitle } from './engine';
import { rewriteHtml } from './rewrite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'ham-sandwich.html'), 'utf8');

const TEXT_ATTR_RE = /\s(title|alt|aria-label|placeholder)\s*=\s*("[^"]*"|'[^']*')/gi;

// Human-readable attributes are meant to change, so they are blanked before
// comparing; what remains is pure markup and must survive untouched.
function skeleton(html: string): string[] {
  return (html.match(/<[A-Za-z][^>]*>/g) ?? []).map((t) => t.replace(TEXT_ATTR_RE, ' $1=""'));
}

describe('rewriteHtml over a real Wikipedia article', () => {
  const { display, pins } = transmuteTitle('Ham sandwich');
  const out = rewriteHtml(FIXTURE, { pins, seed: 'Ham sandwich' });

  it('renders the title as Sam handwich', () => {
    expect(display).toBe('Sam handwich');
  });

  it('preserves every tag and attribute, including quoted JSON holding angle brackets', () => {
    expect(skeleton(out)).toEqual(skeleton(FIXTURE));
    const dataMw = /data-mw='[^']*'/.exec(FIXTURE)?.[0];
    expect(dataMw).toBeDefined();
    expect(out).toContain(dataMw);
  });

  it('transmutes human-readable attributes and nothing else', () => {
    expect(out).toContain('title="Sam handwich (disgamibutation)"');
    expect(out).toContain('href="https://en.wikipedia.org/wiki/Ham_sandwich_(disambiguation)"');
  });

  it('preserves every HTML entity', () => {
    const count = (s: string) =>
      (s.match(/&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,31});/g) ?? []).length;
    expect(count(out)).toBe(count(FIXTURE));
  });

  it('actually transmutes the prose rather than protecting all of it', () => {
    // Counted over every word in the article's paragraphs, stopwords and
    // numbers included, so the share lands well below the density applied to
    // eligible words alone.
    const paragraphs = (s: string) =>
      (s.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [])
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ');

    const bw = paragraphs(FIXTURE);
    const aw = paragraphs(out);
    expect(bw.length).toBeGreaterThan(100);
    expect(aw.length).toBe(bw.length);
    expect(out).toContain('sam handwich');

    const changed = bw.filter((w, i) => w !== aw[i]).length;
    expect(changed / bw.length).toBeGreaterThan(0.15);
    expect(changed / bw.length).toBeLessThan(0.5);
  });

  it('leaves citation markers and their brackets alone', () => {
    expect(out).toContain('id="cite_ref-1"');
    expect(out.match(/class="cite-bracket"/g)?.length).toBe(
      FIXTURE.match(/class="cite-bracket"/g)?.length,
    );
  });

  it('keeps the byte length within a few percent of the original', () => {
    expect(Math.abs(out.length - FIXTURE.length) / FIXTURE.length).toBeLessThan(0.05);
  });

  it('is deterministic across runs', () => {
    expect(rewriteHtml(FIXTURE, { pins, seed: 'Ham sandwich' })).toBe(out);
  });
});
