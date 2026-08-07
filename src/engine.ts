import { isSpeakable, matchCase, splitChunk, splitOnset, swapWithin } from './onset';
import { rngFor, type Rng } from './prng';
import { CURATED, CURATED_PHRASES, isEligible, WORD_RE } from './words';

export interface Pins {
  phrases: Array<{ from: string[]; to: string[] }>;
  words: Map<string, string>;
}

// Probability an eligible word starts an op. Pair and chain ops consume two
// or three words each, so the resulting share of transformed words runs well
// above this; DEFAULT_DENSITY is calibrated to land near the reference 65%.
export const DEFAULT_DENSITY = 0.68;
const MAX_PARTNER_DISTANCE = 3;
const BOUNDARY_RE = /[.!?;:()[\]{}"«»=|]/;

function isBoundary(gap: string): boolean {
  return BOUNDARY_RE.test(gap) || /\d/.test(gap);
}

// Long words survive a swap as unreadable rubble rather than a joke, so they
// take part less often.
function legibility(word: string): number {
  if (word.length <= 8) return 1;
  if (word.length <= 10) return 0.7;
  if (word.length <= 12) return 0.4;
  return 0.15;
}

function speakablePair(x: string, y: string, a: string, b: string): [string, string] | null {
  if (!isSpeakable(x) || !isSpeakable(y)) return null;
  return [matchCase(x, a), matchCase(y, b)];
}

function swapOnsets(a: string, b: string): [string, string] | null {
  const sa = splitOnset(a);
  const sb = splitOnset(b);
  if (!sa.rest || !sb.rest) return null;
  if (sa.onset.toLowerCase() === sb.onset.toLowerCase()) return null;
  return speakablePair(sb.onset + sa.rest, sa.onset + sb.rest, a, b);
}

function swapChunks(a: string, b: string, includeCoda: boolean): [string, string] | null {
  const ca = splitChunk(a, includeCoda);
  const cb = splitChunk(b, includeCoda);
  if (!ca || !cb) return null;
  if (ca.chunk.toLowerCase() === cb.chunk.toLowerCase()) return null;
  return speakablePair(cb.chunk + ca.rest, ca.chunk + cb.rest, a, b);
}

// gaps[i] is the separator text before words[i]; gaps.length === words.length.
export function transmuteBlockWords(
  words: string[],
  gaps: string[],
  rng: Rng,
  pins: Pins,
  density: number = DEFAULT_DENSITY,
): string[] {
  const out = [...words];
  const consumed = new Array<boolean>(words.length).fill(false);

  for (const { from, to } of pins.phrases) {
    for (let i = 0; i + from.length <= words.length; i++) {
      let hit = true;
      for (let k = 0; k < from.length; k++) {
        const w = words[i + k];
        if (consumed[i + k] || !w || w.toLowerCase() !== from[k]) hit = false;
        if (k > 0 && isBoundary(gaps[i + k] ?? '')) hit = false;
      }
      if (!hit) continue;
      for (let k = 0; k < from.length; k++) {
        out[i + k] = matchCase(to[k] ?? '', words[i + k] ?? '');
        consumed[i + k] = true;
      }
    }
  }

  for (let i = 0; i < words.length; i++) {
    if (consumed[i]) continue;
    const pin = pins.words.get((words[i] ?? '').toLowerCase());
    if (pin !== undefined) {
      out[i] = matchCase(pin, words[i] ?? '');
      consumed[i] = true;
    }
  }

  const partner = (i: number, needOnset: boolean): number => {
    for (let j = i + 1; j <= i + MAX_PARTNER_DISTANCE && j < words.length; j++) {
      if (isBoundary(gaps[j] ?? '')) return -1;
      if (consumed[j] || !isEligible(words[j] ?? '')) continue;
      if (needOnset && !splitOnset(out[j] ?? '').onset) continue;
      return j;
    }
    return -1;
  };

  for (let i = 0; i < words.length; i++) {
    if (consumed[i] || !isEligible(words[i] ?? '')) continue;
    if (rng() >= density * legibility(words[i] ?? '')) continue;
    const pick = rng();
    const wi = out[i] ?? '';

    if (pick < 0.2) {
      const swapped = swapWithin(wi);
      if (swapped) {
        out[i] = swapped;
        consumed[i] = true;
      }
      continue;
    }

    // A vowel-initial word only reads well inside a three-way chain, where it
    // both gives and takes; in a bare pair it strands a headless fragment.
    const chaining = pick < 0.35;
    const j = partner(i, !chaining && !!splitOnset(wi).onset);
    if (j === -1) {
      const swapped = swapWithin(wi);
      if (swapped && rng() < 0.5) {
        out[i] = swapped;
        consumed[i] = true;
      }
      continue;
    }
    const wj = out[j] ?? '';

    if (chaining) {
      const k = partner(j, false);
      if (k !== -1) {
        const wk = out[k] ?? '';
        const oi = splitOnset(wi);
        const oj = splitOnset(wj);
        const ok = splitOnset(wk);
        const onsets = [oi.onset, oj.onset, ok.onset].filter(Boolean).length;
        const rot = [oj.onset + oi.rest, ok.onset + oj.rest, oi.onset + ok.rest];
        if (oi.rest && oj.rest && ok.rest && onsets >= 2 && rot.every(isSpeakable)) {
          out[i] = matchCase(rot[0] ?? '', wi);
          out[j] = matchCase(rot[1] ?? '', wj);
          out[k] = matchCase(rot[2] ?? '', wk);
          consumed[i] = consumed[j] = consumed[k] = true;
          continue;
        }
      }
    }

    if (pick >= 0.35 && pick < 0.5) {
      const swapped = swapChunks(wi, wj, rng() < 0.5);
      if (swapped) {
        [out[i], out[j]] = swapped;
        consumed[i] = consumed[j] = true;
        continue;
      }
    }

    const swapped = swapOnsets(wi, wj);
    if (swapped) {
      [out[i], out[j]] = swapped;
      consumed[i] = consumed[j] = true;
    }
  }

  return out;
}

interface TokenizedText {
  words: string[];
  gaps: string[];
  tail: string;
}

export function tokenize(text: string): TokenizedText {
  const words: string[] = [];
  const gaps: string[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    gaps.push(text.slice(last, m.index));
    words.push(m[0]);
    last = m.index + m[0].length;
  }
  return { words, gaps, tail: text.slice(last) };
}

export function assemble(t: TokenizedText, words: string[]): string {
  let s = '';
  for (let i = 0; i < words.length; i++) s += (t.gaps[i] ?? '') + (words[i] ?? '');
  return s + t.tail;
}

export function transmuteText(
  text: string,
  seedParts: string[],
  pins: Pins,
  density: number = DEFAULT_DENSITY,
): string {
  const t = tokenize(text);
  if (t.words.length === 0) return text;
  const rng = rngFor(...seedParts, text);
  return assemble(t, transmuteBlockWords(t.words, t.gaps, rng, pins, density));
}

export function emptyPins(): Pins {
  return { phrases: [...CURATED_PHRASES], words: new Map(CURATED) };
}

export interface TitleTransmutation {
  display: string;
  pins: Pins;
}

// The title transforms unconditionally and its rendering is pinned page-wide,
// as is the head noun on its own ("sandwich" -> "handwich" everywhere).
export function transmuteTitle(title: string): TitleTransmutation {
  const pins = emptyPins();
  const t = tokenize(title);
  const out = t.words.map((w) => {
    const pin = pins.words.get(w.toLowerCase());
    return pin === undefined ? w : matchCase(pin, w);
  });

  const idx = t.words
    .map((w, i) => ({ w, i }))
    .filter(
      ({ w, i }) =>
        isEligible(w) && !pins.words.has(w.toLowerCase()) && !consumedByPhrase(t.words, pins, i),
    )
    .map(({ i }) => i);

  const withOnset = idx.filter((i) => splitOnset(out[i] ?? '').onset);
  const pair = withOnset.length >= 2 ? withOnset : idx;
  const a = pair[0];
  const b = pair[1];
  if (a !== undefined && b !== undefined) {
    const swapped =
      swapOnsets(out[a] ?? '', out[b] ?? '') ?? swapChunks(out[a] ?? '', out[b] ?? '', true);
    if (swapped) [out[a], out[b]] = swapped;
  } else if (a !== undefined) {
    const swapped = swapWithin(out[a] ?? '');
    if (swapped) out[a] = swapped;
  }

  const fromWords = t.words.map((w) => w.toLowerCase());
  const toWords = out.map((w) => w.toLowerCase());
  if (fromWords.length > 0 && fromWords.join(' ') !== toWords.join(' ')) {
    pins.phrases.push({ from: fromWords, to: toWords });
    const lastIdx = b;
    if (lastIdx !== undefined) {
      pins.words.set(fromWords[lastIdx] ?? '', toWords[lastIdx] ?? '');
    }
  }

  return { display: assemble(t, out), pins };
}

function consumedByPhrase(words: string[], pins: Pins, index: number): boolean {
  for (const { from } of pins.phrases) {
    for (let i = 0; i + from.length <= words.length; i++) {
      if (index < i || index >= i + from.length) continue;
      let hit = true;
      for (let k = 0; k < from.length; k++) {
        if ((words[i + k] ?? '').toLowerCase() !== from[k]) hit = false;
      }
      if (hit) return true;
    }
  }
  return false;
}
