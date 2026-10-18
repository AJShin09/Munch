// src/engine/equivalenceChecker.ts
import { Automaton } from '../types';
import { completeDfa } from './languageOperations';
import { convertNfaToDfa, minimizeDfa } from './automaton';
import { compileRegexToNfa } from './regexToAutomaton';

export interface EquivalenceResult {
  areEquivalent: boolean;
  symmetricDifferenceDfa: Automaton;
  counterexample?: {
    string: string;
    acceptedByM1: boolean;
    acceptedByM2: boolean;
    explanation: string;
  };
}

/** Check whether two DFAs recognize the same language */
export function checkDfaEquivalence(m1: Automaton, m2: Automaton): EquivalenceResult {
  const alphabet = Array.from(new Set([...m1.alphabet, ...m2.alphabet])).sort();

  // Ensure both are complete DFAs
  const dfa1 = completeDfa(m1.type === 'DFA' ? m1 : minimizeDfa(convertNfaToDfa(m1)), alphabet);
  const dfa2 = completeDfa(m2.type === 'DFA' ? m2 : minimizeDfa(convertNfaToDfa(m2)), alphabet);

  const acc1 = new Set(dfa1.acceptingStates);
  const acc2 = new Set(dfa2.acceptingStates);

  const pairKey = (s1: string, s2: string) => `(${s1},${s2})`;
  const startPair = pairKey(dfa1.startState, dfa2.startState);

  // Symmetric difference: accepts iff (s1 in acc1 XOR s2 in acc2)
  const isDiffAccepting = (s1: string, s2: string) => {
    const in1 = acc1.has(s1);
    const in2 = acc2.has(s2);
    return (in1 && !in2) || (!in1 && in2);
  };

  const productStates = new Set<string>([startPair]);
  const productAccepting = new Set<string>();
  const productTransitions: Array<{ from: string; symbol: string; to: string }> = [];

  const queue: [string, string][] = [[dfa1.startState, dfa2.startState]];
  const visited = new Set<string>([startPair]);

  // Track parent pointer to reconstruct counterexample path
  const parentMap = new Map<string, { parentPair: string; symbol: string }>();

  if (isDiffAccepting(dfa1.startState, dfa2.startState)) {
    productAccepting.add(startPair);
  }

  let counterexampleState: string | null = isDiffAccepting(dfa1.startState, dfa2.startState)
    ? startPair
    : null;

  while (queue.length > 0) {
    const [u1, u2] = queue.shift()!;
    const fromPair = pairKey(u1, u2);

    for (const sym of alphabet) {
      const t1 = dfa1.transitions.find(t => t.from === u1 && t.symbol === sym);
      const t2 = dfa2.transitions.find(t => t.from === u2 && t.symbol === sym);

      if (t1 && t2) {
        const v1 = t1.to;
        const v2 = t2.to;
        const toPair = pairKey(v1, v2);

        productTransitions.push({ from: fromPair, symbol: sym, to: toPair });

        if (!visited.has(toPair)) {
          visited.add(toPair);
          productStates.add(toPair);
          parentMap.set(toPair, { parentPair: fromPair, symbol: sym });

          if (isDiffAccepting(v1, v2)) {
            productAccepting.add(toPair);
            if (!counterexampleState) {
              counterexampleState = toPair;
            }
          }
          queue.push([v1, v2]);
        }
      }
    }
  }

  const symDiffDfa: Automaton = {
    id: `sym_diff_${Date.now()}`,
    name: `Symmetric Difference (${dfa1.name} ⊕ ${dfa2.name})`,
    type: 'DFA',
    states: Array.from(productStates),
    alphabet,
    transitions: productTransitions,
    startState: startPair,
    acceptingStates: Array.from(productAccepting),
  };

  if (productAccepting.size === 0 || !counterexampleState) {
    return {
      areEquivalent: true,
      symmetricDifferenceDfa: symDiffDfa,
    };
  }

  // Reconstruct shortest counterexample string
  let curr = counterexampleState;
  const pathSymbols: string[] = [];

  while (curr !== startPair && parentMap.has(curr)) {
    const edge = parentMap.get(curr)!;
    pathSymbols.unshift(edge.symbol);
    curr = edge.parentPair;
  }

  const counterexampleStr = pathSymbols.join('');

  // Extract u1, u2 from counterexampleState
  const match = counterexampleState.match(/^\(([^,]+),([^\)]+)\)$/);
  const endU1 = match ? match[1] : '';
  const endU2 = match ? match[2] : '';

  const inM1 = acc1.has(endU1);
  const inM2 = acc2.has(endU2);

  const explanation = inM1
    ? `String "${counterexampleStr}" is ACCEPTED by Automaton 1 (${dfa1.name}) but REJECTED by Automaton 2 (${dfa2.name}).`
    : `String "${counterexampleStr}" is REJECTED by Automaton 1 (${dfa1.name}) but ACCEPTED by Automaton 2 (${dfa2.name}).`;

  return {
    areEquivalent: false,
    symmetricDifferenceDfa: symDiffDfa,
    counterexample: {
      string: counterexampleStr,
      acceptedByM1: inM1,
      acceptedByM2: inM2,
      explanation,
    },
  };
}

/** Check regular expression equivalence */
export function checkRegexEquivalence(
  regex1: string,
  regex2: string
): EquivalenceResult {
  const nfa1 = compileRegexToNfa('Regex 1', regex1);
  const nfa2 = compileRegexToNfa('Regex 2', regex2);
  const dfa1 = minimizeDfa(convertNfaToDfa(nfa1));
  const dfa2 = minimizeDfa(convertNfaToDfa(nfa2));
  return checkDfaEquivalence(dfa1, dfa2);
}
