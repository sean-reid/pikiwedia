const STOPWORD_LIST = `a an the and or but nor so yet of in on at by for with to from as is are was
were be been being am it its it's this that these those they them their there
he she his her him hers we us our you your i me my mine not no if then than
too very just also more most much many such may can could would should shall
will might must has have had do does did done about against between through
during before after above below up down out off over under again further once
here when where why how all any both each few some own same other another
because while until upon per via etc who whom whose which what into onto ones
one two ten new old due like unlike among within without across along around
behind beside despite except toward towards since only even still ever never
now often always sometimes rather quite less least away back yes no`;

export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_LIST.split(/\s+/).filter(Boolean));

export const CURATED: ReadonlyMap<string, string> = new Map([
  ['wikipedia', 'pikiwedia'],
  ['wikipedias', 'pikiwedias'],
  ['wikipedian', 'pikiwedian'],
  ['wikipedians', 'pikiwedians'],
  ['wikimedia', 'mikiwedia'],
  ['wiktionary', 'piktionary'],
  ['encyclopedia', 'enfrycodepia'],
  ['encyclopedias', 'enfrycodepias'],
  ['encyclopedic', 'enfrycodepic'],
  ['article', 'tarticle'],
  ['articles', 'tarticles'],
  ['talk', 'alk'],
  ['tools', 'loots'],
  ['disambiguation', 'disgamibutation'],
]);

export const CURATED_PHRASES: ReadonlyArray<{ from: string[]; to: string[] }> = [
  { from: ['free', 'encyclopedia'], to: ['lee', 'enfrycodepia'] },
];

export const WORD_RE = /\p{L}+(?:['’]\p{L}+)*/gu;

const SIMPLE_WORD_RE = /^[A-Za-z][a-z'’]*$/;

export function isEligible(word: string): boolean {
  if (word.length < 3) return false;
  if (!SIMPLE_WORD_RE.test(word)) return false;
  if (STOPWORDS.has(word.toLowerCase())) return false;
  if (!/[aeiouyAEIOUY]/.test(word)) return false;
  return true;
}
