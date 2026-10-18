// src/engine/grammarEngine.ts
import { RegularGrammar, GrammarDerivationStep, Automaton, AutomatonTransition } from '../types';
import { EPSILON, computeDefaultLayout } from './automaton';

/** Convert a Right-Linear Regular Grammar to a Finite Automaton */
export function grammarToAutomaton(grammar: RegularGrammar): Automaton {
  const finalState = 'F_acc';
  const states = new Set<string>([...grammar.nonTerminals]);
  const transitions: AutomatonTransition[] = [];
  const acceptingStates = new Set<string>();

  let needsDedicatedFinal = false;

  for (const prod of grammar.productions) {
    const from = prod.lhs;
    const rhs = prod.rhs;

    if (rhs.length === 1 && (rhs[0] === EPSILON || rhs[0] === 'ε' || rhs[0] === '')) {
      // A -> ε: A is an accepting state
      acceptingStates.add(from);
    } else if (rhs.length === 1) {
      // A -> a: transition from A to final state on 'a'
      needsDedicatedFinal = true;
      transitions.push({ from, symbol: rhs[0], to: finalState });
    } else if (rhs.length === 2) {
      // A -> a B: transition from A to B on 'a'
      const symbol = rhs[0];
      const toState = rhs[1];
      states.add(toState);
      transitions.push({ from, symbol, to: toState });
    }
  }

  if (needsDedicatedFinal) {
    states.add(finalState);
    acceptingStates.add(finalState);
  }

  const allStates = Array.from(states);
  const alphabet = Array.from(
    new Set(transitions.map(t => t.symbol).filter(s => s !== EPSILON && s !== ''))
  ).sort();

  return {
    id: `nfa_from_grammar_${Date.now()}`,
    name: `${grammar.name} (NFA)`,
    type: 'NFA',
    states: allStates,
    alphabet,
    transitions,
    startState: grammar.startSymbol,
    acceptingStates: Array.from(acceptingStates),
    layout: computeDefaultLayout(allStates, grammar.startSymbol),
  };
}

/** Convert a Finite Automaton to a Right-Linear Regular Grammar */
export function automatonToGrammar(automaton: Automaton): RegularGrammar {
  const nonTerminals = [...automaton.states];
  const terminals = [...automaton.alphabet];
  const productions: Array<{ id: string; lhs: string; rhs: string[] }> = [];

  let prodId = 0;

  // For every transition (A, a) -> B, add rule A -> a B
  for (const t of automaton.transitions) {
    const sym = t.symbol === EPSILON ? 'ε' : t.symbol;
    productions.push({
      id: `p_${prodId++}`,
      lhs: t.from,
      rhs: sym === 'ε' ? [t.to] : [sym, t.to],
    });
  }

  // For every accepting state A in F, add rule A -> ε
  for (const acc of automaton.acceptingStates) {
    productions.push({
      id: `p_${prodId++}`,
      lhs: acc,
      rhs: ['ε'],
    });
  }

  return {
    id: `grammar_${Date.now()}`,
    name: `Grammar from ${automaton.name}`,
    nonTerminals,
    terminals,
    startSymbol: automaton.startState,
    productions,
  };
}

/** Generate sample strings with step-by-step derivations from a grammar */
export function generateGrammarDerivations(
  grammar: RegularGrammar,
  maxStrings: number = 8,
  maxSteps: number = 15
): { string: string; steps: GrammarDerivationStep[] }[] {
  const results: { string: string; steps: GrammarDerivationStep[] }[] = [];

  interface QueueItem {
    sentential: string[];
    steps: GrammarDerivationStep[];
  }

  const queue: QueueItem[] = [
    {
      sentential: [grammar.startSymbol],
      steps: [
        {
          step: 1,
          sententialForm: [grammar.startSymbol],
          explanation: `Start symbol ${grammar.startSymbol}`,
        },
      ],
    },
  ];

  const seenStrings = new Set<string>();

  while (queue.length > 0 && results.length < maxStrings) {
    const { sentential, steps } = queue.shift()!;

    // Find first non-terminal
    const ntIndex = sentential.findIndex(sym => grammar.nonTerminals.includes(sym));

    if (ntIndex === -1) {
      // Completed terminal string!
      const finalStr = sentential.filter(s => s !== 'ε' && s !== EPSILON).join('');
      if (!seenStrings.has(finalStr)) {
        seenStrings.add(finalStr);
        results.push({
          string: finalStr || 'ε',
          steps,
        });
      }
      continue;
    }

    if (steps.length > maxSteps) continue;

    const nt = sentential[ntIndex];
    const applicableProds = grammar.productions.filter(p => p.lhs === nt);

    for (const prod of applicableProds) {
      const nextSentential = [
        ...sentential.slice(0, ntIndex),
        ...prod.rhs,
        ...sentential.slice(ntIndex + 1),
      ];

      const stepExplanation = `${nt} ➔ ${prod.rhs.join(' ')}`;
      const nextSteps: GrammarDerivationStep[] = [
        ...steps,
        {
          step: steps.length + 1,
          sententialForm: nextSentential,
          productionUsed: stepExplanation,
          explanation: `Applied rule ${stepExplanation} ➔ ${nextSentential.join(' ')}`,
        },
      ];

      queue.push({
        sentential: nextSentential,
        steps: nextSteps,
      });
    }
  }

  return results;
}
