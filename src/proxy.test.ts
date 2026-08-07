import { describe, expect, it } from 'vitest';
import { addFooterCredit, brandChrome, retitleDocument } from './brand';
import { isMobile, rewriteUrls, shouldTransmute, titleFromPath, upstreamUserAgent } from './proxy';
import { BRAND } from './rewrite';

describe('titleFromPath', () => {
  it('reads the article title from the slug', () => {
    expect(titleFromPath('/wiki/Ham_sandwich')).toBe('Ham sandwich');
    expect(titleFromPath('/wiki/Main_Page')).toBe('Main Page');
    expect(titleFromPath('/wiki/Caf%C3%A9')).toBe('Café');
    expect(titleFromPath('/wiki/Ham_sandwich#History')).toBe('Ham sandwich');
  });

  it('returns nothing for non-article paths', () => {
    expect(titleFromPath('/w/index.php?search=x')).toBe('');
    expect(titleFromPath('/')).toBe('');
  });

  it('survives a malformed escape', () => {
    expect(() => titleFromPath('/wiki/%E0%A4%A')).not.toThrow();
  });
});

describe('isMobile', () => {
  it('classifies phones as mobile and desktops and tablets as not', () => {
    expect(isMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari')).toBe(true);
    expect(isMobile('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe(true);
    expect(isMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0')).toBe(false);
    expect(isMobile('Mozilla/5.0 (iPad; CPU OS 17_0) Mobile Safari')).toBe(false);
    expect(isMobile('')).toBe(false);
  });
});

describe('upstreamUserAgent', () => {
  it('identifies the proxy and carries a contact address', () => {
    expect(upstreamUserAgent(false)).toContain('Pikiwedia/1.0');
    expect(upstreamUserAgent(false)).toContain('github.com/sean-reid/pikiwedia');
    expect(upstreamUserAgent(true)).toContain('iPhone');
    expect(upstreamUserAgent(false)).toContain('Macintosh');
  });
});

describe('rewriteUrls', () => {
  it('keeps article links on this host and leaves assets upstream', () => {
    const html =
      '<a href="https://en.wikipedia.org/wiki/Cheese">c</a>' +
      '<a href="https://en.wikipedia.org/w/index.php?title=Cheese">e</a>' +
      '<img src="//upload.wikimedia.org/wikipedia/commons/a.png">' +
      '<link href="https://en.wikipedia.org/w/load.php?modules=x">';
    const out = rewriteUrls(html, 'pikiwedia.dwainosaur.com', 'https');
    expect(out).toContain('href="https://pikiwedia.dwainosaur.com/wiki/Cheese"');
    expect(out).toContain('href="https://pikiwedia.dwainosaur.com/w/index.php?title=Cheese"');
    expect(out).toContain('src="//upload.wikimedia.org/wikipedia/commons/a.png"');
  });

  it('rewrites protocol-relative article links', () => {
    const out = rewriteUrls(
      '<a href="//en.wikipedia.org/wiki/Cheese">c</a>',
      'localhost:8787',
      'http',
    );
    expect(out).toContain('href="//localhost:8787/wiki/Cheese"');
  });
});

describe('shouldTransmute', () => {
  it('only rewrites HTML', () => {
    expect(shouldTransmute('text/html; charset=UTF-8')).toBe(true);
    expect(shouldTransmute('text/css')).toBe(false);
    expect(shouldTransmute('application/javascript')).toBe(false);
    expect(shouldTransmute('image/png')).toBe(false);
    expect(shouldTransmute(null)).toBe(false);
  });
});

describe('brandChrome', () => {
  it('replaces the wordmark and tagline images with styled text', () => {
    const html =
      '<img class="mw-logo-wordmark" alt="Wikipedia" src="/static/wordmark.svg">' +
      '<img class="mw-logo-tagline" alt="The Free Encyclopedia" src="/static/tagline.svg">';
    const out = brandChrome(html);
    expect(out).not.toContain('<img');
    expect(out).toContain('class="mw-logo-wordmark"');
    expect(out).toContain('IKIWEDIA');
    expect(out).toContain(BRAND.tagline);
  });

  it('leaves the puzzle globe icon alone', () => {
    const html = '<img class="mw-logo-icon" src="/static/images/icons/enwiki.svg">';
    expect(brandChrome(html)).toBe(html);
  });
});

describe('addFooterCredit', () => {
  it('adds the parody credit beside an untouched licence notice', () => {
    const licence =
      '<li id="footer-info-copyright">Text is available under the ' +
      '<a href="/wiki/CC_BY-SA_4.0">Creative Commons Attribution-ShareAlike 4.0 License</a>.</li>';
    const out = addFooterCredit(`<ul id="footer-info">${licence}</ul>`);
    expect(out).toContain(licence);
    expect(out).toContain(BRAND.credit);
  });

  it('falls back to the end of the body when no licence notice is present', () => {
    const out = addFooterCredit('<body><p>hi</p></body>');
    expect(out).toContain(BRAND.credit);
    expect(out).toContain('</body>');
  });

  it('does not add the credit twice', () => {
    const once = addFooterCredit('<body><p>hi</p></body>');
    expect(addFooterCredit(once)).toBe(once);
  });
});

describe('retitleDocument', () => {
  it('renames the browser tab', () => {
    const out = retitleDocument('<title>Ham sandwich - Wikipedia</title>', 'Sam handwich');
    expect(out).toBe('<title>Sam handwich - Pikiwedia</title>');
  });
});
