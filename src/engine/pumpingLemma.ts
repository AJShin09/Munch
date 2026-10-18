// src/engine/pumpingLemma.ts
import { PumpingLemmaLanguage } from '../types';

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

export const pumpingLemmaLanguages: PumpingLemmaLanguage[] = [
  {
    id: 'an_bn',
    name: 'Equal As and Bs',
    formula: 'L = { aⁿ bⁿ | n ≥ 0 }',
    description: 'Strings of n copies of "a" followed immediately by n copies of "b". Requires an unbounded stack/counter, which finite automata lack.',
    alphabet: ['a', 'b'],
    isInLanguage: (w: string) => {
      const match = w.match(/^(a*)(b*)$/);
      if (!match) return false;
      return match[1].length === match[2].length;
    },
    defaultP: 4,
    defaultString: (p: number) => 'a'.repeat(p) + 'b'.repeat(p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) => {
      if (x + y + z !== s) return { valid: false, error: 'x + y + z does not reconstruct string s!' };
      if (y.length === 0) return { valid: false, error: 'Condition 1 violated: |y| must be > 0.' };
      if ((x + y).length > p) {
        return { valid: false, error: `Condition 2 violated: |xy| = ${x.length + y.length} must be ≤ p (${p}).` };
      }
      return { valid: true };
    },
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const pumped = x + y.repeat(i) + z;
      const countA = (pumped.match(/a/g) || []).length;
      const countB = (pumped.match(/b/g) || []).length;
      const validOrder = /^a*b*$/.test(pumped);
      const inLanguage = validOrder && countA === countB;

      let explanation = '';
      if (!validOrder) {
        explanation = `The pumped string contains 'a' after 'b', which is not in the form aⁿbⁿ.`;
      } else if (countA !== countB) {
        explanation = `Count of 'a' (${countA}) does not equal count of 'b' (${countB}). For i = ${i}, the number of 'a's increased by ${(i - 1) * y.length}, creating an imbalance.`;
      } else {
        explanation = `The string happens to be balanced for this specific choice.`;
      }

      return { pumpedString: pumped, inLanguage, contradictionExplanation: explanation };
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
    isInLanguage: (w: string) => {
      if (w.length % 2 !== 0) return false;
      const half = w.length / 2;
      const first = w.slice(0, half);
      const secondRev = w.slice(half).split('').reverse().join('');
      return first === secondRev;
    },
    defaultP: 3,
    defaultString: (p: number) => '0'.repeat(p) + '11' + '0'.repeat(p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) => {
      if (x + y + z !== s) return { valid: false, error: 'x + y + z does not reconstruct string s!' };
      if (y.length === 0) return { valid: false, error: 'Condition 1 violated: |y| must be > 0.' };
      if ((x + y).length > p) {
        return { valid: false, error: `Condition 2 violated: |xy| = ${x.length + y.length} must be ≤ p (${p}).` };
      }
      return { valid: true };
    },
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
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
        pumpedString: pumped,
        inLanguage: isPal,
        contradictionExplanation: isPal
          ? 'String is a palindrome.'
          : `For i = ${i}, the pumped string "${pumped}" is not symmetric. Pumping y changes only the front segment of 0s, while the matching trailing 0s remain unchanged.`,
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
    isInLanguage: (w: string) => {
      if (!/^0*$/.test(w)) return false;
      const len = w.length;
      const sqrt = Math.round(Math.sqrt(len));
      return sqrt * sqrt === len;
    },
    defaultP: 3,
    defaultString: (p: number) => '0'.repeat(p * p),
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) => {
      if (x + y + z !== s) return { valid: false, error: 'x + y + z does not reconstruct string s!' };
      if (y.length === 0) return { valid: false, error: 'Condition 1: |y| must be > 0.' };
      if ((x + y).length > p) {
        return { valid: false, error: `Condition 2: |xy| ≤ p (${p}).` };
      }
      return { valid: true };
    },
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const pumped = x + y.repeat(i) + z;
      const len = pumped.length;
      const sqrt = Math.round(Math.sqrt(len));
      const inLanguage = sqrt * sqrt === len;

      const prevSquare = p * p;
      const nextSquare = (p + 1) * (p + 1);

      return {
        pumpedString: pumped,
        inLanguage,
        contradictionExplanation: inLanguage
          ? 'Length is a perfect square.'
          : `Pumped string length is ${len}. Notice that p² = ${prevSquare} < ${len} < (p+1)² = ${nextSquare}. Since there is no integer square strictly between p² and (p+1)², ${len} cannot be a square!`,
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
    isInLanguage: (w: string) => {
      if (!/^a*$/.test(w)) return false;
      return isPrime(w.length);
    },
    defaultP: 3,
    defaultString: (p: number) => {
      // Find smallest prime >= p
      let n = Math.max(2, p);
      while (!isPrime(n)) n++;
      return 'a'.repeat(n);
    },
    validateDecomposition: (s: string, p: number, x: string, y: string, z: string) => {
      if (x + y + z !== s) return { valid: false, error: 'x + y + z must equal s!' };
      if (y.length === 0) return { valid: false, error: '|y| > 0 required.' };
      if ((x + y).length > p) return { valid: false, error: `|xy| ≤ p (${p}) required.` };
      return { valid: true };
    },
    findPumpingFailure: (s: string, p: number, x: string, y: string, z: string, i: number) => {
      const pumped = x + y.repeat(i) + z;
      const len = pumped.length;
      const prime = isPrime(len);

      return {
        pumpedString: pumped,
        inLanguage: prime,
        contradictionExplanation: prime
          ? `Length ${len} is prime.`
          : `Length of pumped string is ${len}, which is composite (divisible by ${findFactor(len)}). Specifically, choosing i = |xz| + 1 makes |xyⁱz| = |xz| + i·|y| = (|y|+1)·|xz|, which is composite!`,
      };
    },
    proofWalkthrough: [
      'Assume L = { aᵖ | p is prime } is regular.',
      'Let p be the pumping length. Choose prime m ≥ p + 2, and s = aᵐ ∈ L.',
      'Write s = xyz where 1 ≤ |y| ≤ p and |xy| ≤ p.',
      'Let |y| = k and |xz| = m - k.',
      'Choose i = m - k + 1. Then |x yⁱ z| = |xz| + i · |y| = (m - k) + (m - k + 1) · k = (m - k)(1 + k) + k ... factored as (k + 1)(m - k + 1).',
      'Since both factors are greater than 1, |x yⁱ z| is a composite number.',
      'Hence the pumped string has non-prime length and is not in L.',
      'Contradiction! L is not regular. Q.E.D.',
    ],
  },
];

function findFactor(n: number): number {
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return i;
  }
  return n;
}
