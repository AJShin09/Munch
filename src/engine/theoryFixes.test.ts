import { compileRegexToNfa, compileRegexToDfa } from './regexToAutomaton';
import { convertNfaToDfa, simulateAutomaton } from './automaton';
import { pumpingLemmaLanguages } from './pumpingLemma';

const accepts = (automaton: ReturnType<typeof compileRegexToNfa>, input: string) =>
  simulateAutomaton(automaton, input).slice(-1)[0].isAccepted;

describe('empty-language regex construction', () => {
  test('[] accepts neither epsilon nor nonempty strings as an NFA', () => {
    const nfa = compileRegexToNfa('empty language', '[]');

    expect(nfa.transitions).toHaveLength(0);
    expect(accepts(nfa, '')).toBe(false);
    expect(accepts(nfa, 'a')).toBe(false);
    expect(accepts(nfa, 'anything')).toBe(false);
  });

  test('[] remains empty after NFA-to-DFA conversion', () => {
    const dfa = convertNfaToDfa(compileRegexToNfa('empty language', '[]'));

    expect(accepts(dfa, '')).toBe(false);
    expect(accepts(dfa, 'a')).toBe(false);
    expect(accepts(dfa, 'anything')).toBe(false);
  });

  test('the empty regex still denotes epsilon', () => {
    const nfa = compileRegexToNfa('epsilon', '');

    expect(accepts(nfa, '')).toBe(true);
    expect(accepts(nfa, 'a')).toBe(false);
  });

  test.each([
    ['(', /Unclosed group/],
    ['a)', /Unexpected/],
    ['[ab', /Unclosed character class/],
    ['*a', /Unexpected quantifier/],
  ])('reports a useful syntax error for %s', (regex, error) => {
    expect(() => compileRegexToDfa('malformed', regex)).toThrow(error);
  });
});

describe('pumping lemma witness validation', () => {
  const anBn = pumpingLemmaLanguages.find(language => language.id === 'an_bn')!;

  test('accepts a valid witness and decomposition and detects a pumped failure', () => {
    const witness = 'aaabbb';
    const decomposition = { x: 'a', y: 'a', z: 'abbb' };

    expect(anBn.validateDecomposition(witness, 3, decomposition.x, decomposition.y, decomposition.z))
      .toEqual({ valid: true });
    expect(anBn.findPumpingFailure(witness, 3, decomposition.x, decomposition.y, decomposition.z, 2))
      .toMatchObject({ valid: true, inLanguage: false, pumpedString: 'aaaabbb' });
  });

  test.each([
    ['not a member', 'aaa', 3, 'a', 'a', 'a', /belong to the selected language/],
    ['too short', 'aabb', 5, 'a', 'a', 'ab', /at least p/],
    ['does not reconstruct', 'aaabbb', 3, 'a', 'a', 'ab', /x \+ y \+ z = s/],
    ['empty y', 'aaabbb', 3, 'a', '', 'aabbb', /\|y\| > 0/],
    ['xy too long', 'aaabbb', 3, 'aaa', 'b', 'bb', /\|xy\| ≤ p/],
  ])('rejects an invalid witness or decomposition (%s)', (_case, s, p, x, y, z, error) => {
    const validation = anBn.validateDecomposition(s, p, x, y, z);
    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(error);

    const result = anBn.findPumpingFailure(s, p, x, y, z, 2);
    expect(result.valid).toBe(false);
    expect(result.inLanguage).toBe(false);
    expect(result.error).toMatch(error);
  });

  test('rejects nonpositive pumping lengths and invalid exponents', () => {
    expect(anBn.validateDecomposition('ab', 0, '', 'a', 'b'))
      .toMatchObject({ valid: false, error: expect.stringMatching(/positive integer/) });
    expect(anBn.findPumpingFailure('ab', 1, '', 'a', 'b', -1))
      .toMatchObject({ valid: false, error: expect.stringMatching(/nonnegative integer/) });
  });

  test('requires exact membership in the selected alphabet and language', () => {
    const palindrome = pumpingLemmaLanguages.find(language => language.id === 'palindromes')!;

    expect(anBn.isInLanguage('aabb\n')).toBe(false);
    expect(palindrome.isInLanguage('abba')).toBe(false);
    expect(palindrome.isInLanguage('0110')).toBe(true);
  });
});

describe('prime-length pumping proof', () => {
  const primeLengths = pumpingLemmaLanguages.find(language => language.id === 'primes')!;

  test('chooses a prime witness larger than p', () => {
    const witness = primeLengths.defaultString(3);

    expect(witness).toBe('aaaaa');
    expect(witness.length).toBeGreaterThan(3);
    expect(primeLengths.isInLanguage(witness)).toBe(true);
  });

  test('calculates a composite proof exponent for every legal y-length', () => {
    const p = 3;
    const witness = primeLengths.defaultString(p);
    const m = witness.length;

    for (let k = 1; k <= p; k++) {
      for (let xLength = 0; xLength + k <= p; xLength++) {
        const x = 'a'.repeat(xLength);
        const y = 'a'.repeat(k);
        const z = witness.slice(xLength + k);
        const result = primeLengths.findPumpingFailure(witness, p, x, y, z, 2);
        const expectedProofExponent = m + 1;
        const expectedProofString = x + y.repeat(expectedProofExponent) + z;

        expect(result.valid).toBe(true);
        expect(result.proofExponent).toBe(expectedProofExponent);
        expect(result.proofPumpedString).toBe(expectedProofString);
        expect(expectedProofString.length).toBe(m * (k + 1));
        expect(primeLengths.isInLanguage(expectedProofString)).toBe(false);
      }
    }
  });

  test('distinguishes an unproductive selected exponent from the guaranteed proof pump', () => {
    const witness = 'aaaaa';
    const result = primeLengths.findPumpingFailure(witness, 3, 'a', 'aa', 'aa', 2);

    expect(result.valid).toBe(true);
    expect(result.inLanguage).toBe(true);
    expect(result.proofExponent).toBe(6);
    expect(result.proofPumpedString).toBeDefined();
    expect(primeLengths.isInLanguage(result.proofPumpedString ?? '')).toBe(false);
  });
});
