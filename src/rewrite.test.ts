import { describe, expect, it } from 'vitest';
import { transmuteTitle } from './engine';
import { findTagEnd, rewriteHtml } from './rewrite';

function run(html: string, title = 'Ham sandwich'): string {
  const { pins } = transmuteTitle(title);
  return rewriteHtml(html, { pins, seed: title });
}

describe('rewriteHtml', () => {
  it('leaves markup byte for byte and only touches text', () => {
    const html = '<p class="lead" data-x="a>b">The ham sandwich is tasty.</p>';
    const out = run(html);
    expect(out.startsWith('<p class="lead" data-x="a>b">')).toBe(true);
    expect(out.endsWith('</p>')).toBe(true);
    expect(out).toContain('sam handwich');
  });

  it('skips script, style, code, and math', () => {
    const html =
      '<script>var sandwich = "bread";</script><style>.sandwich{color:red}</style>' +
      '<code>make_sandwich()</code><math><mi>sandwich</mi></math>';
    expect(run(html)).toBe(html);
  });

  it('skips references, citations, and IPA', () => {
    const html =
      '<sup class="reference">bread sandwich cheese</sup>' +
      '<span class="IPA">bread sandwich cheese</span>' +
      '<ol class="references"><li>Smith, John. Bread and Cheese. 1998.</li></ol>';
    expect(run(html)).toBe(html);
  });

  it('skips non-English text but keeps English children of English parents', () => {
    const html = '<p><span lang="fr">le sandwich au jambon</span> and the bread</p>';
    const out = run(html);
    expect(out).toContain('<span lang="fr">le sandwich au jambon</span>');
    expect(out).not.toContain('and the bread and');
  });

  it('resumes transmuting after a protected subtree closes', () => {
    const html = '<p><code>raw_bread()</code> the toasted bread and melted cheese here</p>';
    const out = run(html);
    expect(out).toContain('<code>raw_bread()</code>');
    expect(out).not.toContain('the toasted bread and melted cheese here');
  });

  it('preserves entities and does not double-encode', () => {
    const html = '<p>Bread &amp; cheese &lt;tasty&gt; sandwiches are common here today.</p>';
    const out = run(html);
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;');
    expect(out).not.toContain('&amp;amp;');
  });

  it('transmutes link and image text attributes', () => {
    const html = '<a href="/wiki/Cheese" title="Melted cheese and toasted bread">cheese</a>';
    const out = run(html);
    expect(out).toContain('href="/wiki/Cheese"');
    expect(out).not.toContain('title="Melted cheese and toasted bread"');
  });

  it('keeps unclosed and void tags from corrupting the skip stack', () => {
    const html = '<p>The toasted bread<br><img src="a.png"> and the melted cheese today</p>';
    const out = run(html);
    expect(out).toContain('<br>');
    expect(out).toContain('<img src="a.png">');
    expect(out).not.toContain('The toasted bread');
  });

  it('ends a tag correctly when a value holds an apostrophe or an angle bracket', () => {
    const apos = '<a href="/wiki/Landau\'s_ranking" class="x">text</a>';
    expect(findTagEnd(apos, 0)).toBe(apos.indexOf('>'));
    const angle = `<span data-mw='{"html":"<b>hi</b>"}'>word</span>`;
    expect(findTagEnd(angle, 0)).toBe(angle.indexOf(`'>`) + 1);
  });

  it('leaves a tag byte identical when an apostrophe appears in a href', () => {
    const html = '<a href="/wiki/Einstein\'s_exam" class="mw-file-description" id="a1">bread</a>';
    const out = run(html);
    expect(out).toContain('<a href="/wiki/Einstein\'s_exam" class="mw-file-description" id="a1">');
  });

  it('does not rewrite attribute names nested inside another attribute value', () => {
    const html = `<span typeof="mw:File" data-mw='{"caption":"&lt;a href=\\"/wiki/X\\" title=\\"Melted cheese bread\\"&gt;"}'>the toasted bread and melted cheese</span>`;
    const out = run(html);
    expect(out).toContain('title=\\"Melted cheese bread\\"');
    expect(out).not.toContain('>the toasted bread and melted cheese<');
  });

  it('preserves entities rather than decoding them away', () => {
    const html = '<p>The bread weighs 5&nbsp;kg and the cheese &mdash; melted &#8212; is warm.</p>';
    const out = run(html);
    expect(out).toContain('&nbsp;');
    expect(out).toContain('&mdash;');
    expect(out).toContain('&#8212;');
  });

  it('is deterministic', () => {
    const html = '<p>The ham sandwich has toasted bread and melted cheese inside.</p>';
    expect(run(html)).toBe(run(html));
  });
});
