import { describe, expect, it } from 'vitest';
import { addFooterCredit, brandChrome, retitleDocument } from './brand';
import { transmuteTitle } from './engine';
import {
  isMobile,
  isSearchApi,
  rewriteUrls,
  shouldTransmute,
  titleFromPath,
  transmuteSearchJson,
  typeaheadClick,
  upstreamUserAgent,
} from './proxy';
import { BRAND } from './rewrite';

const hamPins = () => transmuteTitle('Ham sandwich').pins;

describe('transmuteSearchJson', () => {
  it('transmutes display fields but never the slug used for navigation', () => {
    const body = JSON.stringify({
      pages: [
        {
          id: 1,
          key: 'Ham_sandwich_theorem',
          title: 'Ham sandwich theorem',
          description: 'Common type of sandwich',
        },
      ],
    });
    const { body: rewritten, pairs } = transmuteSearchJson(body, hamPins());
    const out = JSON.parse(rewritten);
    expect(out.pages[0].key).toBe('Ham_sandwich_theorem');
    expect(out.pages[0].id).toBe(1);
    expect(out.pages[0].title).toContain('handwich');
    expect(out.pages[0].title).not.toBe('Ham sandwich theorem');
    expect(pairs).toEqual([{ display: out.pages[0].title, slug: 'Ham_sandwich_theorem' }]);
  });

  it('transmutes an opensearch payload and makes its urls relative', () => {
    const body = JSON.stringify([
      'ham sand',
      ['Ham sandwich'],
      [''],
      ['https://en.wikipedia.org/wiki/Ham_sandwich'],
    ]);
    const { body: rewritten, pairs } = transmuteSearchJson(body, hamPins());
    const out = JSON.parse(rewritten);
    expect(out[0]).toBe('ham sand');
    expect(out[1][0]).toBe('Sam handwich');
    expect(out[3][0]).toBe('/wiki/Ham_sandwich');
    expect(pairs).toEqual([{ display: 'Sam handwich', slug: 'Ham_sandwich' }]);
  });

  it('leaves a body that is not JSON alone', () => {
    expect(transmuteSearchJson('not json at all', hamPins()).body).toBe('not json at all');
  });
});

describe('typeaheadClick', () => {
  it('recognises a typeahead result click and extracts the display title', () => {
    const url = new URL(
      'https://x.test/w/index.php?title=Special%3ASearch&search=Jape+gruice&wprov=acrw1_0',
    );
    expect(typeaheadClick(url)).toEqual({ display: 'Jape gruice', fragment: '' });
  });

  it('carries a section anchor through', () => {
    const url = new URL(
      'https://x.test/w/index.php?title=Special%3ASearch&search=Cist+of+locktails%23Grape+juice&wprov=acrw1_1',
    );
    expect(typeaheadClick(url)).toEqual({ display: 'Cist of locktails', fragment: 'Grape juice' });
  });

  it('ignores plain searches, which the upstream handles well', () => {
    expect(
      typeaheadClick(new URL('https://x.test/w/index.php?title=Special%3ASearch&search=grape')),
    ).toBeNull();
    expect(
      typeaheadClick(
        new URL('https://x.test/w/index.php?title=Special%3ASearch&fulltext=1&search=grape'),
      ),
    ).toBeNull();
    expect(typeaheadClick(new URL('https://x.test/wiki/Grape_juice'))).toBeNull();
  });
});

describe('isSearchApi', () => {
  it('matches only the JSON api endpoints', () => {
    expect(isSearchApi('/w/api.php', 'application/json; charset=utf-8')).toBe(true);
    expect(isSearchApi('/w/rest.php/v1/search/title', 'application/json')).toBe(true);
    expect(isSearchApi('/wiki/Ham_sandwich', 'text/html')).toBe(false);
    expect(isSearchApi('/w/api.php', 'text/html')).toBe(false);
  });
});

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
  it('makes article links relative and leaves asset hosts alone', () => {
    const html =
      '<a href="https://en.wikipedia.org/wiki/Cheese">c</a>' +
      '<a href="https://en.wikipedia.org/w/index.php?title=Cheese">e</a>' +
      '<img src="//upload.wikimedia.org/wikipedia/commons/a.png">' +
      '<link href="https://en.wikipedia.org/w/load.php?modules=x">';
    const out = rewriteUrls(html);
    expect(out).toContain('href="/wiki/Cheese"');
    expect(out).toContain('href="/w/index.php?title=Cheese"');
    expect(out).toContain('href="/w/load.php?modules=x"');
    expect(out).toContain('src="//upload.wikimedia.org/wikipedia/commons/a.png"');
  });

  it('rewrites protocol-relative and mobile-host article links', () => {
    expect(rewriteUrls('<a href="//en.wikipedia.org/wiki/Cheese">c</a>')).toContain(
      'href="/wiki/Cheese"',
    );
    expect(rewriteUrls('<a href="https://en.m.wikipedia.org/wiki/Cheese">c</a>')).toContain(
      'href="/wiki/Cheese"',
    );
  });

  it('bakes no deployment host into the markup', () => {
    const out = rewriteUrls('<a href="https://en.wikipedia.org/wiki/Cheese">c</a>');
    expect(out).not.toContain('wikipedia.org');
    expect(out).not.toContain('dwainosaur');
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
    expect(out).toContain('IKIWEDI');
    expect(out).toContain(BRAND.tagline);
  });

  it('sets the first and last letters full height, as the upstream wordmark does', () => {
    const out = brandChrome('<img class="mw-logo-wordmark" alt="Wikipedia" src="/w.svg">');
    expect(out).toMatch(/>P<span[^>]*>IKIWEDI<\/span>A</);
  });

  it('brands the Minerva header, which has no classed wordmark', () => {
    const html =
      '<div class="branding-box"><a href="/wiki/Main_Page">' +
      '<img src="/static/images/mobile/copyright/wikipedia-wordmark-en.svg" alt="Wikipedia" width="140">' +
      '</a><div class="tagline">From Wikipedia, the free encyclopedia</div></div>';
    const out = brandChrome(html);
    expect(out).toContain('IKIWEDI');
    expect(out).not.toContain('<img');
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
