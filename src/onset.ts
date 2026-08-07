const VOWELS = new Set('aeiouAEIOU');
const DIGRAPHS = new Set(['ch', 'sh', 'th', 'ph', 'wh', 'gh', 'qu', 'ck']);

function isVowelAt(word: string, i: number): boolean {
  const ch = word[i];
  if (ch === undefined) return false;
  if (VOWELS.has(ch)) return true;
  return (ch === 'y' || ch === 'Y') && i > 0;
}

export function splitOnset(word: string): { onset: string; rest: string } {
  let i = 0;
  while (i < word.length && !isVowelAt(word, i)) i++;
  if (i >= word.length) return { onset: word, rest: '' };
  const prev = word[i - 1];
  if (i > 0 && (prev === 'q' || prev === 'Q') && word[i]?.toLowerCase() === 'u') i++;
  return { onset: word.slice(0, i), rest: word.slice(i) };
}

// chunk = onset + first vowel run, optionally plus the following consonant
// run when at least one vowel remains after it ("west" from "western").
export function splitChunk(
  word: string,
  includeCoda: boolean,
): { chunk: string; rest: string } | null {
  const { onset, rest } = splitOnset(word);
  if (!rest) return null;
  let i = 0;
  while (i < rest.length && isVowelAt(word, onset.length + i)) i++;
  let end = onset.length + i;
  if (includeCoda) {
    let j = i;
    while (j < rest.length && !isVowelAt(word, onset.length + j)) j++;
    if (j < rest.length && j > i) end = onset.length + j;
  }
  if (end >= word.length) return null;
  return { chunk: word.slice(0, end), rest: word.slice(end) };
}

export function matchCase(word: string, template: string): string {
  const lowered = word.toLowerCase();
  const first = template.charAt(0);
  if (first && first !== first.toLowerCase()) {
    return lowered.charAt(0).toUpperCase() + lowered.slice(1);
  }
  return lowered;
}

function leadUnit(cluster: string): string {
  const two = cluster.slice(0, 2).toLowerCase();
  if (DIGRAPHS.has(two)) return cluster.slice(0, 2);
  return cluster.slice(0, 1);
}

interface Segment {
  vowel: boolean;
  text: string;
}

function segments(word: string): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  while (i < word.length) {
    const vowel = isVowelAt(word, i);
    let j = i;
    while (j < word.length && isVowelAt(word, j) === vowel) j++;
    segs.push({ vowel, text: word.slice(i, j) });
    i = j;
  }
  return segs;
}

// Swap the onset with the next consonant identity, preserving gemination:
// toppings -> pottings, debated -> bedated.
export function swapWithin(word: string): string | null {
  const segs = segments(word);
  const [s0, s1, s2, s3] = [segs[0], segs[1], segs[2], segs[3]];
  if (!s0 || s0.vowel || !s1 || !s2 || s2.vowel || !s3 || !s3.vowel) return null;
  const u1 = s0.text;
  const base2 = leadUnit(s2.text);
  if (u1.toLowerCase() === base2.toLowerCase()) return null;
  const doubled = s2.text.toLowerCase() === (base2 + base2).toLowerCase() && base2.length === 1;
  const newOnset = base2;
  const newMid = doubled && u1.length === 1 ? u1 + u1 : u1 + s2.text.slice(base2.length);
  const tail = segs
    .slice(3)
    .map((s) => s.text)
    .join('');
  return matchCase(newOnset + s1.text + newMid + tail, word);
}
