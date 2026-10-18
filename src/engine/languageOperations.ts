// src/engine/languageOperations.ts
import { Automaton, AutomatonTransition } from '../types';
import { EPSILON, computeDefaultLayout, convertNfaToDfa, minimizeDfa } from './automaton';

/** Make a DFA complete over an alphabet by adding a sink (dead) state */
export function completeDfa(dfa: Automaton, alphabet: string[]): Automaton {
  const deadState = 'q_sink';
  let hasDead = false;
  const newTransitions = [...dfa.transitions];
  const states = new Set(dfa.states);

  for (const s of dfa.states) {
    for (const sym of alphabet) {
      const exists = dfa.transitions.some(t => t.from === s && t.symbol === sym);
      if (!exists) {
        hasDead = true;
        states.add(deadState);
        newTransitions.push({ from: s, symbol: sym, to: deadState });
      }
    }
  }

  if (hasDead) {
    // Sink transitions back to sink for every symbol
    for (const sym of alphabet) {
      newTransitions.push({ from: deadState, symbol: sym, to: deadState });
    }
  }

  const allStates = Array.from(states);
  return {
    ...dfa,
    states: allStates,
    alphabet,
    transitions: newTransitions,
    layout: computeDefaultLayout(allStates, dfa.startState),
  };
}

/** Product Automaton Construction for Boolean Operations (Intersection, Union, Difference) */
export function productAutomaton(
  m1: Automaton,
  m2: Automaton,
  operation: 'INTERSECTION' | 'UNION' | 'DIFFERENCE'
): Automaton {
  // Common combined alphabet
  const alphabet = Array.from(new Set([...m1.alphabet, ...m2.alphabet])).sort();

  // Convert both to complete DFAs over the common alphabet
  const dfa1 = completeDfa(m1.type === 'DFA' ? m1 : minimizeDfa(convertNfaToDfa(m1)), alphabet);
  const dfa2 = completeDfa(m2.type === 'DFA' ? m2 : minimizeDfa(convertNfaToDfa(m2)), alphabet);

  const acc1 = new Set(dfa1.acceptingStates);
  const acc2 = new Set(dfa2.acceptingStates);

  const pairName = (s1: string, s2: string) => `(${s1},${s2})`;
  const startPair = pairName(dfa1.startState, dfa2.startState);

  const productStates = new Set<string>();
  const productAccepting = new Set<string>();
  const productTransitions: AutomatonTransition[] = [];

  const queue: [string, string][] = [[dfa1.startState, dfa2.startState]];
  const visited = new Set<string>([startPair]);
  productStates.add(startPair);

  const checkAccepting = (s1: string, s2: string): boolean => {
    const in1 = acc1.has(s1);
    const in2 = acc2.has(s2);
    if (operation === 'INTERSECTION') return in1 && in2;
    if (operation === 'UNION') return in1 || in2;
    if (operation === 'DIFFERENCE') return in1 && !in2;
    return false;
  };

  if (checkAccepting(dfa1.startState, dfa2.startState)) {
    productAccepting.add(startPair);
  }

  while (queue.length > 0) {
    const [u1, u2] = queue.shift()!;
    const fromPair = pairName(u1, u2);

    for (const sym of alphabet) {
      const t1 = dfa1.transitions.find(t => t.from === u1 && t.symbol === sym);
      const t2 = dfa2.transitions.find(t => t.from === u2 && t.symbol === sym);

      if (t1 && t2) {
        const v1 = t1.to;
        const v2 = t2.to;
        const toPair = pairName(v1, v2);

        productTransitions.push({ from: fromPair, symbol: sym, to: toPair });

        if (!visited.has(toPair)) {
          visited.add(toPair);
          productStates.add(toPair);
          if (checkAccepting(v1, v2)) {
            productAccepting.add(toPair);
          }
          queue.push([v1, v2]);
        }
      }
    }
  }

  const allStates = Array.from(productStates);
  const opTitles = {
    INTERSECTION: 'Intersection (L1 ∩ L2)',
    UNION: 'Union (L1 ∪ L2)',
    DIFFERENCE: 'Difference (L1 \\ L2)',
  };

  const rawAutomaton: Automaton = {
    id: `prod_${operation.toLowerCase()}_${Date.now()}`,
    name: opTitles[operation],
    type: 'DFA',
    states: allStates,
    alphabet,
    transitions: productTransitions,
    startState: startPair,
    acceptingStates: Array.from(productAccepting),
    layout: computeDefaultLayout(allStates, startPair),
  };

  return minimizeDfa(rawAutomaton);
}

/** Complement Operation: Σ* \ L */
export function complementAutomaton(m: Automaton): Automaton {
  const alphabet = [...m.alphabet];
  const dfa = completeDfa(m.type === 'DFA' ? m : minimizeDfa(convertNfaToDfa(m)), alphabet);

  const accOriginal = new Set(dfa.acceptingStates);
  const complementAcc = dfa.states.filter(s => !accOriginal.has(s));

  return {
    id: `complement_${Date.now()}`,
    name: `Complement (¬${m.name})`,
    type: 'DFA',
    states: [...dfa.states],
    alphabet,
    transitions: [...dfa.transitions],
    startState: dfa.startState,
    acceptingStates: complementAcc,
    layout: dfa.layout,
  };
}

/** Concatenation: L1 · L2 */
export function concatenateAutomata(m1: Automaton, m2: Automaton): Automaton {
  // Rename states to avoid collisions
  const s1Prefix = 'm1_';
  const s2Prefix = 'm2_';

  const s1 = m1.states.map(s => s1Prefix + s);
  const s2 = m2.states.map(s => s2Prefix + s);

  const t1 = m1.transitions.map(t => ({
    from: s1Prefix + t.from,
    symbol: t.symbol,
    to: s1Prefix + t.to,
  }));

  const t2 = m2.transitions.map(t => ({
    from: s2Prefix + t.from,
    symbol: t.symbol,
    to: s2Prefix + t.to,
  }));

  // Add ε-transitions from each accept state of m1 to start state of m2
  const bridgeTransitions: AutomatonTransition[] = m1.acceptingStates.map(acc => ({
    from: s1Prefix + acc,
    symbol: EPSILON,
    to: s2Prefix + m2.startState,
  }));

  const allStates = [...s1, ...s2];
  const allTransitions = [...t1, ...t2, ...bridgeTransitions];
  const acceptingStates = m2.acceptingStates.map(acc => s2Prefix + acc);
  const alphabet = Array.from(new Set([...m1.alphabet, ...m2.alphabet])).sort();
  const start = s1Prefix + m1.startState;

  const nfa: Automaton = {
    id: `concat_${Date.now()}`,
    name: `Concatenation (${m1.name} · ${m2.name})`,
    type: 'EPSILON_NFA',
    states: allStates,
    alphabet,
    transitions: allTransitions,
    startState: start,
    acceptingStates,
    layout: computeDefaultLayout(allStates, start),
  };

  return convertNfaToDfa(nfa);
}

/** Kleene Star: L* */
export function kleeneStarAutomaton(m: Automaton): Automaton {
  const newStart = 'q_star_start';
  const newAccept = 'q_star_accept';

  const prefix = 'k_';
  const innerStates = m.states.map(s => prefix + s);
  const innerTransitions = m.transitions.map(t => ({
    from: prefix + t.from,
    symbol: t.symbol,
    to: prefix + t.to,
  }));

  const extraTransitions: AutomatonTransition[] = [
    { from: newStart, symbol: EPSILON, to: prefix + m.startState },
    { from: newStart, symbol: EPSILON, to: newAccept },
  ];

  for (const acc of m.acceptingStates) {
    extraTransitions.push({ from: prefix + acc, symbol: EPSILON, to: prefix + m.startState });
    extraTransitions.push({ from: prefix + acc, symbol: EPSILON, to: newAccept });
  }

  const allStates = [newStart, newAccept, ...innerStates];
  const allTransitions = [...innerTransitions, ...extraTransitions];

  const nfa: Automaton = {
    id: `star_${Date.now()}`,
    name: `Kleene Star (${m.name}*)`,
    type: 'EPSILON_NFA',
    states: allStates,
    alphabet: m.alphabet,
    transitions: allTransitions,
    startState: newStart,
    acceptingStates: [newAccept],
    layout: computeDefaultLayout(allStates, newStart),
  };

  return convertNfaToDfa(nfa);
}
