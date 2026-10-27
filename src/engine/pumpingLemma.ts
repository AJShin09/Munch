// src/engine/pumpingLemma.ts
import { PumpingLemmaLanguage } from '../types';

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

const isAnBn = (w: string): boolean => {
  const match = w.match(/^(a*)(b*)$/);
  return Boolean(match && match[0] === w && match[1].length === match[2].length);
};

const isEvenPalindrome = (w: string): boolean => {
  if (!Array.from(w).every(char => char === '0' || char === '1')) return false;
  if (w.length % 2 !== 0) return false;
  const half = w.length / 2;
  return w.slice(0, half) === w.slice(half).split('').reverse().join('');
};

const isSquareUnary = (w: string): boolean => {
  if (!Array.from(w).every(char => char === '0')) return false;
  const root = Math.round(Math.sqrt(w.length));
  return root * root === w.length;
};

const isPrimeUnary = (w: string): boolean =>
  Array.from(w).every(char => char === 'a') && isPrime(w.length);

function validatePumpingDecomposition(
  isInLanguage: (s: string) => boolean,
  s: string,
  p: number,
  x: string,
  y: string,
  z: string
): { valid: boolean; error?: string } {
  if (!Number.isInteger(p) || p < 1) {
    return { valid: false, error: 'The pumping length p must be a positive integer.' };
  }
  if (!isInLanguage(s)) {
    return { valid: false, error: 'The witness s must belong to the selected language.' };
  }
  if (s.length < p) {
    return { valid: false, error: `The witness length |s| = ${s.length} must be at least p (${p}).` };
  }
  if (x + y + z !== s) {
    return { valid: false, error: 'The decomposition must satisfy x + y + z = s.' };
  }
  if (y.length === 0) {
    return { valid: false, error: 'The decomposition must satisfy |y| > 0.' };
  }
  if (x.length + y.length > p) {
    return {
      valid: false,
      error: `The decomposition must satisfy |xy| ≤ p; got |xy| = ${x.length + y.length} and p = ${p}.`,
    };
  }
  return { valid: true };
}

function validatePumpExponent(i: number): string | undefined {
  return Number.isInteger(i) && i >= 0
    ? undefined
    : 'The pumping exponent i must be a nonnegative integer.';
}

function invalidPumpingResult(error: string) {
  return {
    valid: false,
    error,
    pumpedString: '',
    inLanguage: false,
    contradictionExplanation: error,
  };
}

export const pumpingLemmaLanguages: PumpingLemmaLanguage[] = [
  {
    id: 'an_bn',
    name: 'Equal As and Bs',
    formula: 'L = { aⁿ bⁿ | n ≥ 0 }',
    description: 'Strings of n copies of "a" followed immediately by n copies of "b". Requires an unbounded stack/counter, which finite automata lack.',
    alphabet: ['a', 'b'],
    isInLanguage: isAnBn,
    defaultP: 4,
    defaultString: (p: number) => 'a'.repeat(p) + 'b'.repeat(p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) =>
      validatePumpingDecomposition(isAnBn, s, p, x, y, z),
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const validation = validatePumpingDecomposition(isAnBn, s, p, x, y, z);
      if (!validation.valid) return invalidPumpingResult(validation.error ?? 'Invalid pumping witness.');
      const exponentError = validatePumpExponent(i);
      if (exponentError) return invalidPumpingResult(exponentError);
      const pumped = x + y.repeat(i) + z;
      const countA = (pumped.match(/a/g) || []).length;
      const countB = (pumped.match(/b/g) || []).length;
      const validOrder = /^a*b*$/.test(pumped);
      const inLanguage = validOrder && countA === countB;
      const delta = i - 1;
      const deltaA = delta * (y.match(/a/g) || []).length;
      const deltaB = delta * (y.match(/b/g) || []).length;

      let explanation = '';
      if (!validOrder) {
        explanation = `The pumped string contains 'a' after 'b', which is not in the form aⁿbⁿ.`;
      } else if (countA !== countB) {
        explanation = `The pumped string has ${countA} 'a's and ${countB} 'b's. Pumping y changes the counts by ${deltaA} 'a's and ${deltaB} 'b's.`;
      } else {
        explanation = `The string happens to be balanced for this specific choice.`;
      }

      return { valid: true, pumpedString: pumped, inLanguage, contradictionExplanation: explanation };
    },
    proofWalkthrough: [
      'Assume for contradiction that L = { aⁿ bⁿ | n ≥ 0 } is regular.',
      'By the Pumping Lemma, there exists a pumping constant p ≥ 1.',
      'Select string s = aᵖ bᵖ ∈ L. Clearly, |s| = 2p ≥ p.',
      'According to the lemma, s can be split into s = xyz where |xy| ≤ p and |y| ≥ 1.',
      'Since |xy| ≤ p, both x and y must consist entirely of the character "a" (i.e. y = aᵏ for some k ≥ 1).',
      'Now pump with i = 0 (or i = 2): s\' = x y⁰ z = x z.',
      'The number of "a"s in s\' is p - k, while the number of "b"s remains p.',
      'Since k ≥ 1, p - k ≠ p. Thus s\' ∉ L, which contradicts the Pumping Lemma!',
      'Therefore, L is NOT a regular language. Q.E.D.',
    ],
  },
  {
    id: 'palindromes',
    name: 'Palindromes (Even Length)',
    formula: 'L = { w wᴿ | w ∈ {0, 1}* }',
    description: 'Strings consisting of a binary word followed by its exact reverse. Remembering an arbitrary sequence in reverse requires memory proportional to length.',
    alphabet: ['0', '1'],
    isInLanguage: isEvenPalindrome,
    defaultP: 3,
    defaultString: (p: number) => '0'.repeat(p) + '11' + '0'.repeat(p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) =>
      validatePumpingDecomposition(isEvenPalindrome, s, p, x, y, z),
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const validation = validatePumpingDecomposition(isEvenPalindrome, s, p, x, y, z);
      if (!validation.valid) return invalidPumpingResult(validation.error ?? 'Invalid pumping witness.');
      const exponentError = validatePumpExponent(i);
      if (exponentError) return invalidPumpingResult(exponentError);
      const pumped = x + y.repeat(i) + z;
      const isEven = pumped.length % 2 === 0;
      let isPal = false;
      if (isEven) {
        const half = pumped.length / 2;
        const first = pumped.slice(0, half);
        const secondRev = pumped.slice(half).split('').reverse().join('');
        isPal = first === secondRev;
      }

      return {
        valid: true,
        pumpedString: pumped,
        inLanguage: isPal,
        contradictionExplanation: isPal
          ? 'String is a palindrome.'
          : `For i = ${i}, the pumped string "${pumped}" is not an even-length palindrome.`,
      };
    },
    proofWalkthrough: [
      'Assume for contradiction that L = { w wᴿ | w ∈ {0, 1}* } is regular.',
      'There exists a pumping length p ≥ 1.',
      'Pick s = 0ᵖ 1 1 0ᵖ ∈ L. Clearly |s| = 2p + 2 ≥ p.',
      'The split s = xyz satisfies |xy| ≤ p and |y| ≥ 1. Hence, y consists entirely of 0s from the initial block.',
      'Consider i = 2 (or i = 0): s\' = x y² z.',
      's\' now has more than p leading zeros, but still only p trailing zeros.',
      'Consequently, s\' cannot be of the form w wᴿ, so s\' ∉ L.',
      'This contradicts the Pumping Lemma; hence L is not regular. Q.E.D.',
    ],
  },
  {
    id: 'squares',
    name: 'Square Lengths',
    formula: 'L = { 0^(n²) | n ≥ 0 }',
    description: 'Strings of zeros whose total length is a perfect square (0, 1, 4, 9, 16, 25, ...). Gaps between consecutive squares grow indefinitely.',
    alphabet: ['0'],
    isInLanguage: isSquareUnary,
    defaultP: 3,
    defaultString: (p: number) => '0'.repeat(p * p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) =>
      validatePumpingDecomposition(isSquareUnary, s, p, x, y, z),
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const validation = validatePumpingDecomposition(isSquareUnary, s, p, x, y, z);
      if (!validation.valid) return invalidPumpingResult(validation.error ?? 'Invalid pumping witness.');
      const exponentError = validatePumpExponent(i);
      if (exponentError) return invalidPumpingResult(exponentError);
      const pumped = x + y.repeat(i) + z;
      const len = pumped.length;
      const sqrt = Math.round(Math.sqrt(len));
      const inLanguage = sqrt * sqrt === len;

      return {
        valid: true,
        pumpedString: pumped,
        inLanguage,
        contradictionExplanation: inLanguage
          ? `Pumped string length ${len} is a perfect square.`
          : `Pumped string length ${len} is not a perfect square for this valid decomposition and chosen exponent.`,
      };
    },
    proofWalkthrough: [
      'Assume for contradiction that L = { 0^(n²) | n ≥ 0 } is regular.',
      'Let p be the pumping length. Choose s = 0^(p²), so |s| = p² ≥ p.',
      'By the lemma, s = xyz with |xy| ≤ p and 1 ≤ |y| ≤ p.',
      'Pump with i = 2: |x y² z| = |xyz| + |y| = p² + |y|.',
      'Since 1 ≤ |y| ≤ p, we have: p² < p² + |y| ≤ p² + p < p² + 2p + 1 = (p + 1)².',
      'Thus, the length of x y² z lies strictly between two consecutive squares p² and (p+1)²',
      'Therefore, the length cannot be a perfect square, so x y² z ∉ L.',
      'Contradiction! L is not regular. Q.E.D.',
    ],
  },
  {
    id: 'primes',
    name: 'Prime Lengths',
    formula: 'L = { aᵖ | p is prime }',
    description: 'Unary strings whose length is a prime number (2, 3, 5, 7, 11, ...). Multiplication property of pumping forces composite lengths.',
    alphabet: ['a'],
    isInLanguage: isPrimeUnary,
    defaultP: 3,
    defaultString: (p: number) => {
      // Choose a prime witness strictly larger than p for the pumping proof.
      let n = Math.max(2, p + 1);
      while (!isPrime(n)) n++;
      return 'a'.repeat(n);
    },
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) =>
      validatePumpingDecomposition(isPrimeUnary, s, p, x, y, z),
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const validation = validatePumpingDecomposition(isPrimeUnary, s, p, x, y, z);
      if (!validation.valid) return invalidPumpingResult(validation.error ?? 'Invalid pumping witness.');
      const exponentError = validatePumpExponent(i);
      if (exponentError) return invalidPumpingResult(exponentError);
      const pumped = x + y.repeat(i) + z;
      const len = pumped.length;
      const prime = isPrime(len);
      const proofExponent = s.length + 1;
      const proofPumpedString = x + y.repeat(proofExponent) + z;
      const k = y.length;

      return {
        valid: true,
        pumpedString: pumped,
        inLanguage: prime,
        proofExponent,
        proofPumpedString,
        contradictionExplanation:
          `For the selected i = ${i}, the pumped length is ${len}, ` +
          `${prime ? 'which is prime' : 'which is not prime'}. ` +
          `For a guaranteed contradiction, choose i = m + 1 = ${proofExponent}, ` +
          `where m = |s| = ${s.length}. Since s = aᵐ and y = aᵏ with k = ${k}, ` +
          `|xyⁱz| = m + (i - 1)k = m + mk = m(k + 1) = ${proofPumpedString.length}; ` +
          `both factors exceed 1, so this length is composite and the pumped string is outside L.`,
      };
    },
    proofWalkthrough: [
      'Assume L = { aᵖ | p is prime } is regular.',
      'Let p ≥ 1 be the pumping length. Choose a prime m > p and let s = aᵐ ∈ L.',
      'Write s = xyz where 1 ≤ |y| ≤ p and |xy| ≤ p.',
      'Because s contains only a, write y = aᵏ for some 1 ≤ k ≤ p.',
      'Choose i = m + 1. This exponent is calculated from the prime witness length m, not from a particular decomposition.',
      'Then |xyⁱz| = |x| + (m + 1)k + |z| = m + mk = m(k + 1).',
      'Both factors m and k + 1 are greater than 1, so this pumped length is composite.',
      'Thus xyⁱz ∉ L, contradicting the Pumping Lemma.',
      'Contradiction! L is not regular. Q.E.D.',
    ],
  },
];
