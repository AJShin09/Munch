// src/engine/automaton.ts
import { Automaton, AutomatonTransition, SimulationStep } from '../types';

export const EPSILON = 'ε';

/** Compute epsilon closure for a set of states in an NFA */
export function epsilonClosure(automaton: Automaton, states: Set<string>): Set<string> {
  const closure = new Set<string>(states);
  const stack = Array.from(states);

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const t of automaton.transitions) {
      if (t.from === current && (t.symbol === EPSILON || t.symbol === '' || t.symbol === 'eps')) {
        if (!closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      }
    }
  }

  return closure;
}

/** Step the automaton given active states and input character */
export function stepAutomaton(
  automaton: Automaton,
  activeStates: Set<string>,
  symbol: string
): Set<string> {
  const nextStates = new Set<string>();

  for (const state of activeStates) {
    for (const t of automaton.transitions) {
      if (t.from === state && t.symbol === symbol) {
        nextStates.add(t.to);
      }
    }
  }

  return epsilonClosure(automaton, nextStates);
}

/** Check if current active states contain an accepting state */
export function isStateSetAccepting(automaton: Automaton, states: Set<string>): boolean {
  const acceptingSet = new Set(automaton.acceptingStates);
  for (const s of states) {
    if (acceptingSet.has(s)) return true;
  }
  return false;
}

/** Simulate an entire string on an automaton, producing step-by-step trace */
export function simulateAutomaton(automaton: Automaton, input: string): SimulationStep[] {
  const steps: SimulationStep[] = [];
  let currentStates = epsilonClosure(automaton, new Set([automaton.startState]));

  steps.push({
    activeStates: new Set(currentStates),
    symbol: null,
    inputIndex: 0,
    explanation: `Initial state: start at {${Array.from(currentStates).sort().join(', ')}}`,
    isAccepted: isStateSetAccepting(automaton, currentStates),
  });

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prev = new Set(currentStates);
    currentStates = stepAutomaton(automaton, currentStates, char);

    const fromList = Array.from(prev).sort().join(', ');
    const toList = currentStates.size > 0 ? Array.from(currentStates).sort().join(', ') : 'Dead (∅)';
    const accepted = isStateSetAccepting(automaton, currentStates);

    steps.push({
      activeStates: new Set(currentStates),
      symbol: char,
      inputIndex: i + 1,
      explanation: `Read '${char}': {${fromList}} ➔ {${toList}}`,
      isAccepted: accepted,
    });
  }

  return steps;
}

/** Convert NFA to DFA via Powerset / Subset Construction */
export function convertNfaToDfa(nfa: Automaton): Automaton {
  const initialClosure = epsilonClosure(nfa, new Set([nfa.startState]));
  const stateSetKey = (set: Set<string>) => Array.from(set).sort().join(',');

  const dfaStateMap = new Map<string, string>(); // stateSetKey -> dfaStateName
  const dfaStates: string[] = [];
  const dfaAccepting: string[] = [];
  const dfaTransitions: AutomatonTransition[] = [];

  let stateCounter = 0;
  const getOrAddDfaState = (set: Set<string>): string => {
    const key = stateSetKey(set);
    if (dfaStateMap.has(key)) {
      return dfaStateMap.get(key)!;
    }
    const name = `q${stateCounter++}`;
    dfaStateMap.set(key, name);
    dfaStates.push(name);
    if (isStateSetAccepting(nfa, set)) {
      dfaAccepting.push(name);
    }
    return name;
  };

  const startDfaState = getOrAddDfaState(initialClosure);
  const queue: Set<string>[] = [initialClosure];
  const visited = new Set<string>();
  visited.add(stateSetKey(initialClosure));

  // Extract non-epsilon alphabet
  const alphabet = Array.from(
    new Set(nfa.transitions.map(t => t.symbol).filter(s => s && s !== EPSILON && s !== 'eps'))
  ).sort();

  while (queue.length > 0) {
    const currentSet = queue.shift()!;
    const fromName = dfaStateMap.get(stateSetKey(currentSet))!;

    for (const sym of alphabet) {
      const nextSet = stepAutomaton(nfa, currentSet, sym);
      if (nextSet.size > 0) {
        const nextKey = stateSetKey(nextSet);
        const toName = getOrAddDfaState(nextSet);
        dfaTransitions.push({ from: fromName, symbol: sym, to: toName });

        if (!visited.has(nextKey)) {
          visited.add(nextKey);
          queue.push(nextSet);
        }
      }
    }
  }

  return {
    id: `dfa_${Date.now()}`,
    name: `${nfa.name} (DFA)`,
    type: 'DFA',
    states: dfaStates,
    alphabet,
    transitions: dfaTransitions,
    startState: startDfaState,
    acceptingStates: dfaAccepting,
    layout: computeDefaultLayout(dfaStates, startDfaState),
  };
}

/** Minimize a DFA using Hopcroft's / Partition refinement algorithm */
export function minimizeDfa(dfa: Automaton): Automaton {
  // Ensure we operate on a complete DFA by finding reachable states first
  const reachable = new Set<string>();
  const q = [dfa.startState];
  reachable.add(dfa.startState);

  while (q.length > 0) {
    const curr = q.shift()!;
    for (const t of dfa.transitions) {
      if (t.from === curr && !reachable.has(t.to)) {
        reachable.add(t.to);
        q.push(t.to);
      }
    }
  }

  const activeStates = dfa.states.filter(s => reachable.has(s));
  const acceptingSet = new Set(dfa.acceptingStates.filter(s => reachable.has(s)));
  const nonAccepting = activeStates.filter(s => !acceptingSet.has(s));

  let partitions: Set<string>[] = [];
  if (acceptingSet.size > 0) partitions.push(new Set(acceptingSet));
  if (nonAccepting.length > 0) partitions.push(new Set(nonAccepting));

  let changed = true;
  while (changed) {
    changed = false;
    const newPartitions: Set<string>[] = [];

    for (const group of partitions) {
      if (group.size <= 1) {
        newPartitions.push(group);
        continue;
      }

      // Split group based on transitions for each alphabet symbol
      const subgroups = new Map<string, Set<string>>();

      for (const state of group) {
        const signatureParts: string[] = [];
        for (const sym of dfa.alphabet) {
          const t = dfa.transitions.find(tr => tr.from === state && tr.symbol === sym);
          if (!t) {
            signatureParts.push('DEAD');
          } else {
            const destGroupIdx = partitions.findIndex(p => p.has(t.to));
            signatureParts.push(`${sym}:${destGroupIdx}`);
          }
        }
        const signature = signatureParts.join('|');
        if (!subgroups.has(signature)) {
          subgroups.set(signature, new Set());
        }
        subgroups.get(signature)!.add(state);
      }

      if (subgroups.size > 1) {
        changed = true;
        for (const sg of subgroups.values()) {
          newPartitions.push(sg);
        }
      } else {
        newPartitions.push(group);
      }
    }

    partitions = newPartitions;
  }

  // Build minimized DFA states
  const stateToGroup = new Map<string, string>();
  const minStates: string[] = [];
  const minAccepting: string[] = [];
  let minStart = '';

  partitions.forEach((group, idx) => {
    const groupName = `s${idx}`;
    minStates.push(groupName);

    let isAcc = false;
    for (const state of group) {
      stateToGroup.set(state, groupName);
      if (state === dfa.startState) {
        minStart = groupName;
      }
      if (acceptingSet.has(state)) {
        isAcc = true;
      }
    }
    if (isAcc) minAccepting.push(groupName);
  });

  const minTransitions: AutomatonTransition[] = [];
  const addedTransitionKeys = new Set<string>();

  for (const t of dfa.transitions) {
    const fromG = stateToGroup.get(t.from);
    const toG = stateToGroup.get(t.to);
    if (fromG && toG) {
      const key = `${fromG}-${t.symbol}-${toG}`;
      if (!addedTransitionKeys.has(key)) {
        addedTransitionKeys.add(key);
        minTransitions.push({ from: fromG, symbol: t.symbol, to: toG });
      }
    }
  }

  return {
    id: `min_dfa_${Date.now()}`,
    name: `${dfa.name} (Minimized)`,
    type: 'DFA',
    states: minStates,
    alphabet: dfa.alphabet,
    transitions: minTransitions,
    startState: minStart || minStates[0] || 's0',
    acceptingStates: minAccepting,
    layout: computeDefaultLayout(minStates, minStart),
  };
}

/** Compute an aesthetically pleasing circular/force layout for states */
export function computeDefaultLayout(
  states: string[],
  startState: string
): Record<string, { x: number; y: number }> {
  const layout: Record<string, { x: number; y: number }> = {};
  const n = states.length;
  if (n === 0) return layout;
  if (n === 1) {
    layout[states[0]] = { x: 250, y: 150 };
    return layout;
  }

  // Put start state on the left
  const otherStates = states.filter(s => s !== startState);
  const ordered = [startState, ...otherStates];

  const centerX = 320;
  const centerY = 180;
  const radius = Math.min(220, Math.max(100, 40 * n));

  ordered.forEach((state, idx) => {
    if (state === startState && n > 2) {
      layout[state] = { x: 100, y: centerY };
    } else {
      const angle = (2 * Math.PI * idx) / ordered.length - Math.PI;
      const x = Math.round(centerX + radius * Math.cos(angle));
      const y = Math.round(centerY + (radius * 0.75) * Math.sin(angle));
      layout[state] = { x, y };
    }
  });

  return layout;
}
