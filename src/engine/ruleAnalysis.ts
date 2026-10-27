// src/engine/ruleAnalysis.ts
//
// Static analysis of a token-rule list using regular-language set operations.
// Every question here is answered by a product construction over two DFAs:
//
//   L(A) ⊆ L(B)      subset test  -> "B shadows A, so A can never match"
//   L(A) = L(B)      equality     -> "duplicate rule"
//   L(A) ∩ L(B) ≠ ∅  intersection -> "same priority, order decides"
//   L(A) = ∅         emptiness    -> "rule can never match anything"
//
// The search is bounded: a pair whose product exceeds PAIR_BUDGET states is
// reported as unknown rather than risking a frozen interface. DFAs are already
// memoized by compileRegexToDfa, so repeated analyses are cheap.

import { Automaton, TokenRule } from '../types';
import { compileRegexToDfa } from './regexToAutomaton';
import { EPSILON } from './automaton';

export type RuleIssueKind = 'invalid' | 'empty' | 'shadowed' | 'duplicate' | 'tie';

export interface RuleIssue {
  kind: RuleIssueKind;
  ruleName: string;
  otherRule?: string;
  message: string;
}

export interface RuleAnalysisResult {
  issues: RuleIssue[];
  /** DFA size per compiled rule, for the drawer summary. */
  states: Record<string, number>;
  /** Number of rule pairs actually compared. */
  pairs: number;
  /** False when a comparison was abandoned (budget) or a rule failed to compile. */
  complete: boolean;
}

type Verdict = 'yes' | 'no' | 'unknown';

interface Compiled {
  rule: TokenRule;
  dfa: Automaton;
  delta: Map<string, Map<string, string>>;
  alphabet: string[];
  accepting: Set<string>;
}

const PAIR_BUDGET = 3000;
const MAX_RULES = 40;
const TIME_BUDGET_MS = 1500;

function buildDelta(dfa: Automaton): Map<string, Map<string, string>> {
  const delta = new Map<string, Map<string, string>>();
  for (const state of dfa.states) delta.set(state, new Map());
  for (const t of dfa.transitions) {
    if (!t.symbol || t.symbol === EPSILON) continue;
    const row = delta.get(t.from);
    // A DFA should have one target per (state, symbol); keep the first.
    if (row && !row.has(t.symbol)) row.set(t.symbol, t.to);
  }
  return delta;
}

function compileRule(rule: TokenRule): Compiled {
  const dfa = compileRegexToDfa(rule.name, rule.regex, { ignoreCase: rule.caseInsensitive });
  const delta = buildDelta(dfa);
  const alphabet = Array.from(new Set(dfa.transitions.map(t => t.symbol)))
    .filter(s => s && s !== EPSILON)
    .sort();
  return { rule, dfa, delta, alphabet, accepting: new Set(dfa.acceptingStates) };
}

/** Is there any accepting state reachable from the start state? */
function acceptsSomething(c: Compiled): boolean {
  const seen = new Set<string>([c.dfa.startState]);
  const queue = [c.dfa.startState];
  while (queue.length) {
    const state = queue.shift() as string;
    if (c.accepting.has(state)) return true;
    const row = c.delta.get(state);
    if (!row) continue;
    for (const next of row.values()) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

/**
 * Is L(a) a subset of L(b)?
 * BFS over (stateA, stateB|dead). Only symbols of A are explored: once A has no
 * transition, no accepting string of A can continue, so that branch is pruned.
 */
function subsetOf(a: Compiled, b: Compiled): Verdict {
  const startA = a.dfa.startState;
  const startB = b.dfa.startState;
  const seen = new Set<string>([`${startA}\u0000${startB}`]);
  const queue: Array<{ sa: string; sb: string | null }> = [{ sa: startA, sb: startB }];
  let expanded = 0;

  const witness = (sa: string, sb: string | null) =>
    a.accepting.has(sa) && (sb === null || !b.accepting.has(sb));

  if (witness(startA, startB)) return 'no';

  while (queue.length) {
    if (++expanded > PAIR_BUDGET) return 'unknown';
    const { sa, sb } = queue.shift() as { sa: string; sb: string | null };
    const rowA = a.delta.get(sa);
    if (!rowA) continue;
    for (const symbol of rowA.keys()) {
      const na = rowA.get(symbol) as string;
      const nb = sb === null ? null : (b.delta.get(sb)?.get(symbol) ?? null);
      if (witness(na, nb)) return 'no';
      const key = `${na}\u0000${nb ?? '\u0001'}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ sa: na, sb: nb }); }
    }
  }
  return 'yes';
}

/** Is L(a) ∩ L(b) non-empty? Only symbols present in both alphabets can extend a run. */
function intersects(a: Compiled, b: Compiled): Verdict {
  const inB = new Set(b.alphabet);
  const shared = a.alphabet.filter(s => inB.has(s));
  const startA = a.dfa.startState;
  const startB = b.dfa.startState;
  const seen = new Set<string>([`${startA}\u0000${startB}`]);
  const queue: Array<{ sa: string; sb: string }> = [{ sa: startA, sb: startB }];
  let expanded = 0;

  if (a.accepting.has(startA) && b.accepting.has(startB)) return 'yes';

  while (queue.length) {
    if (++expanded > PAIR_BUDGET) return 'unknown';
    const { sa, sb } = queue.shift() as { sa: string; sb: string };
    for (const symbol of shared) {
      const na = a.delta.get(sa)?.get(symbol);
      const nb = b.delta.get(sb)?.get(symbol);
      if (!na || !nb) continue;
      if (a.accepting.has(na) && b.accepting.has(nb)) return 'yes';
      const key = `${na}\u0000${nb}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ sa: na, sb: nb }); }
    }
  }
  return 'no';
}

/**
 * Analyse the enabled rules of a token specification.
 *
 * "Shadowed" means a rule can never produce a token: another rule with equal or
 * better priority matches every string it matches, and the scanner keeps the
 * earlier rule on ties. "Duplicate" is the special case where the two languages
 * are equal. "Tie" flags equal priorities whose languages overlap, because the
 * listed order then decides the outcome.
 */
export function analyzeRules(rules: TokenRule[]): RuleAnalysisResult {
  const issues: RuleIssue[] = [];
  const states: Record<string, number> = {};
  const compiled: Compiled[] = [];
  let complete = true;

  const enabled = rules.filter(r => r.enabled);
  if (enabled.length > MAX_RULES) {
    return { issues, states, pairs: 0, complete: false };
  }

  for (const rule of enabled) {
    try {
      const c = compileRule(rule);
      states[rule.name] = c.dfa.states.length;
      compiled.push(c);
    } catch (err) {
      complete = false;
      issues.push({
        kind: 'invalid',
        ruleName: rule.name,
        message: `Pattern cannot be compiled to a finite automaton: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  for (const c of compiled) {
    if (!acceptsSomething(c)) {
      issues.push({
        kind: 'empty',
        ruleName: c.rule.name,
        message: 'This pattern matches no string at all, so the rule can never produce a token.',
      });
    }
  }

  // Same order the scanner uses: priority ascending (stable), earlier wins ties.
  const ordered = compiled
    .map((c, index) => ({ c, index }))
    .sort((x, y) => (x.c.rule.priority - y.c.rule.priority) || (x.index - y.index))
    .map(x => x.c);

  const deadline = Date.now() + TIME_BUDGET_MS;
  let pairs = 0;

  for (let j = 0; j < ordered.length; j++) {
    for (let i = 0; i < j; i++) {
      if (Date.now() > deadline) { complete = false; break; }
      const earlier = ordered[i];
      const later = ordered[j];
      pairs++;

      const sub = subsetOf(later, earlier);
      if (sub === 'unknown') { complete = false; continue; }
      if (sub === 'yes') {
        const reverse = subsetOf(earlier, later);
        const sameLanguage = reverse === 'yes';
        if (reverse === 'unknown') complete = false;
        issues.push({
          kind: sameLanguage ? 'duplicate' : 'shadowed',
          ruleName: later.rule.name,
          otherRule: earlier.rule.name,
          message: sameLanguage
            ? `Same language as ${earlier.rule.name}, which is tried first — this rule can never win.`
            : `Every string this rule matches is also matched by ${earlier.rule.name}, which is tried first — this rule can never produce a token.`,
        });
        continue;
      }

      if (earlier.rule.priority === later.rule.priority) {
        const overlap = intersects(later, earlier);
        if (overlap === 'unknown') { complete = false; continue; }
        if (overlap === 'yes') {
          issues.push({
            kind: 'tie',
            ruleName: later.rule.name,
            otherRule: earlier.rule.name,
            message: `Same priority as ${earlier.rule.name} and the languages overlap; the listed order decides which token wins.`,
          });
        }
      }
    }
  }

  return { issues, states, pairs, complete };
}
