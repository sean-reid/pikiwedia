# Pikiwedia

The lee enfrycodepia. A Cloudflare Worker that proxies live English Wikipedia and spoonerizes the text: word onsets swap between neighbors, deterministically per page, so [Sam handwich](https://pikiwedia.dwainosaur.com/wiki/Ham_sandwich) reads the same on every visit. Styling, scripts, and images come straight from Wikipedia, so Pikiwedia always looks exactly like current Wikipedia.

Live at [pikiwedia.dwainosaur.com](https://pikiwedia.dwainosaur.com).

## Develop

```sh
npm install
npm run dev        # wrangler dev on localhost
npm test           # engine and rewriter unit tests
npm run test:e2e   # Playwright against wrangler dev
```

## Deploy

```sh
npm run deploy
```

Content is fetched from wikipedia.org at request time and is available under CC BY-SA 4.0. Pikiwedia is a parody and is not affiliated with the Wikimedia Foundation.
