import { describe, expect, it } from 'vitest';
import { emptyPins, transmuteText, transmuteTitle } from './engine';
import { isSpeakable, matchCase, splitChunk, splitOnset, swapWithin } from './onset';
import { isEligible } from './words';

const HAM_LEAD =
  'A ham sandwich is a common type of sandwich. The bread may be fresh or toasted, ' +
  'and it can be made with a variety of toppings including cheese and vegetables like ' +
  'lettuce, tomato, onion or pickle slices. Various kinds of mustard and mayonnaise are also common.';

describe('splitOnset', () => {
  it('treats digraphs and clusters as part of the onset', () => {
    expect(splitOnset('cheese')).toEqual({ onset: 'ch', rest: 'eese' });
    expect(splitOnset('sliced')).toEqual({ onset: 'sl', rest: 'iced' });
    expect(splitOnset('strong')).toEqual({ onset: 'str', rest: 'ong' });
    expect(splitOnset('theory')).toEqual({ onset: 'th', rest: 'eory' });
  });

  it('keeps qu together and handles vowel-initial and y-initial words', () => {
    expect(splitOnset('queen')).toEqual({ onset: 'qu', rest: 'een' });
    expect(splitOnset('onion')).toEqual({ onset: '', rest: 'onion' });
    expect(splitOnset('years')).toEqual({ onset: 'y', rest: 'ears' });
  });
});

describe('splitChunk', () => {
  it('extracts onset plus vowel run, optionally with coda', () => {
    expect(splitChunk('western', true)).toEqual({ chunk: 'west', rest: 'ern' });
    expect(splitChunk('supermarkets', true)).toEqual({ chunk: 'sup', rest: 'ermarkets' });
    expect(splitChunk('common', true)).toEqual({ chunk: 'comm', rest: 'on' });
  });

  it('refuses a remainder that does not open on a vowel', () => {
    expect(splitChunk('western', false)).toBeNull();
    expect(splitChunk('light', true)).toBeNull();
  });

  it('refuses chunks that would consume the whole word', () => {
    expect(splitChunk('free', false)).toBeNull();
  });
});

describe('isSpeakable', () => {
  it('rejects onsets English never uses', () => {
    expect(isSpeakable('xettures')).toBe(false);
    expect(isSpeakable('chegetables')).toBe(true);
    expect(isSpeakable('slead')).toBe(true);
  });
});

describe('swapWithin', () => {
  it('swaps onset with the next consonant identity, preserving gemination', () => {
    expect(swapWithin('toppings')).toBe('pottings');
    expect(swapWithin('debated')).toBe('bedated');
  });

  it('returns null when there is nothing distinct to swap', () => {
    expect(swapWithin('onion')).toBeNull();
    expect(swapWithin('papa')).toBeNull();
  });
});

describe('matchCase', () => {
  it('follows the case of the landing position', () => {
    expect(matchCase('supern', 'Western')).toBe('Supern');
    expect(matchCase('Western', 'supermarkets')).toBe('western');
  });
});

describe('transmuteTitle', () => {
  it('spoonerizes Ham sandwich into Sam handwich and pins the head noun', () => {
    const t = transmuteTitle('Ham sandwich');
    expect(t.display).toBe('Sam handwich');
    expect(t.pins.words.get('sandwich')).toBe('handwich');
    expect(t.pins.phrases).toContainEqual({ from: ['ham', 'sandwich'], to: ['sam', 'handwich'] });
  });

  it('spoonerizes Main Page into Pain Mage', () => {
    expect(transmuteTitle('Main Page').display).toBe('Pain Mage');
  });

  it('leaves curated words to the dictionary', () => {
    const t = transmuteTitle('Wikipedia');
    expect(t.display).toBe('Pikiwedia');
  });
});

describe('transmuteText', () => {
  it('is deterministic for the same seed and varies across seeds', () => {
    const pins = emptyPins();
    const a = transmuteText(HAM_LEAD, ['Ham sandwich'], pins);
    const b = transmuteText(HAM_LEAD, ['Ham sandwich'], pins);
    const c = transmuteText(HAM_LEAD, ['Cheese'], pins);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes a medium fraction of eligible words and leaves structure intact', () => {
    const pins = emptyPins();
    const out = transmuteText(HAM_LEAD, ['Ham sandwich'], pins);
    const inWords = HAM_LEAD.split(/\s+/);
    const outWords = out.split(/\s+/);
    expect(outWords.length).toBe(inWords.length);
    const eligible = inWords.filter((w) => isEligible(w.replace(/[^A-Za-z'’]/g, '')));
    const changed = inWords.filter((w, i) => w !== outWords[i]);
    expect(changed.length).toBeGreaterThanOrEqual(Math.floor(eligible.length * 0.3));
    expect(changed.length).toBeLessThanOrEqual(Math.ceil(eligible.length * 0.9));
  });

  it('never touches stopwords, digits, or punctuation', () => {
    const pins = emptyPins();
    const text = 'The bread was baked in 1907 at 450 degrees, and the crust was thick.';
    const out = transmuteText(text, ['x'], pins);
    expect(out).toMatch(/^The /);
    expect(out).toContain('1907');
    expect(out).toContain('450');
    expect(out).toContain(', and the ');
    expect(out.endsWith('.')).toBe(true);
  });

  it('applies the curated dictionary everywhere', () => {
    const pins = emptyPins();
    const out = transmuteText('Wikipedia is a free encyclopedia.', ['x'], pins);
    expect(out).toContain('Pikiwedia');
    expect(out).toContain('lee enfrycodepia');
  });

  it('applies title pins across the page', () => {
    const { pins } = transmuteTitle('Ham sandwich');
    const out = transmuteText(
      'The ham sandwich is a popular sandwich in many countries.',
      ['Ham sandwich'],
      pins,
    );
    expect(out).toContain('sam handwich');
    expect(out).toContain('handwich in many');
  });

  it('skips acronyms and mixed-case proper nouns', () => {
    const pins = emptyPins();
    const out = transmuteText('NASA and McDonald and UNESCO stayed.', ['x'], pins);
    expect(out).toContain('NASA');
    expect(out).toContain('McDonald');
    expect(out).toContain('UNESCO');
  });
});
