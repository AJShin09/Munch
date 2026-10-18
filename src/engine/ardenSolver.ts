// src/engine/ardenSolver.ts
import { Automaton, ArdenStep } from '../types';
import { EPSILON } from './automaton';

/**
 * Arden's Theorem / state-elimination solver.
 *
 * State equations are held structurally (never as strings) and the classic
 * state-elimination construction is used: eliminate a state q by rerouting
 * every remaining path  p ⇒ r  through  p ⇒ q · q* · q ⇒ r, which is exactly
 * the application of Arden's Theorem (X = q·X + B ⇒ X = q*·B) to the q-loop.
 * This avoids the substring corruption of the previous string-splicing
 * implementation (e.g. eliminating `s1` also rewriting `s10`).
 */
type Expr =
  | { k: 'sym'; c: string }
  | { k: 'eps' }
  | { k: 'empty' }
  | { k: 'alt'; xs: Expr[] }
  | { k: 'cat'; xs: Expr[] }
  | { k: 'star'; x: Expr };

const EPS: Expr = { k: 'eps' };
const EMPTY: Expr = { k: 'empty' };

function altOf(xs: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const x of xs) {
    if (x.k === 'empty') continue;
    if (x.k === 'alt') flat.push(...x.xs);
    else flat.push(x);
  }
  const seen = new Set<string>();
  const out: Expr[] = [];
  for (const x of flat) {
    const s = exprToString(x);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(x);
    }
  }
  if (out.length === 0) return EMPTY;
  if (out.length === 1) return out[0];
  return { k: 'alt', xs: out };
}

function catOf(xs: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const x of xs) {
    if (x.k === 'eps') continue;
    if (x.k === 'empty') return EMPTY;
    if (x.k === 'cat') flat.push(...x.xs);
    else flat.push(x);
  }
  if (flat.length === 0) return EPS;
  if (flat.length === 1) return flat[0];
  return { k: 'cat', xs: flat };
}

function starOf(x: Expr): Expr {
  if (x.k === 'empty' || x.k === 'eps') return EPS;
  if (x.k === 'star') return x;
  return { k: 'star', x };
}

const META_CHARS = new Set(['\\', '.', '+', '*', '?', '(', ')', '[', ']', '{', '}', '|', '^', '$', '/']);
const PREC = { alt: 1, cat: 2, star: 3, atom: 4 } as const;

function precOf(e: Expr): number {
  switch (e.k) {
    case 'alt': return PREC.alt;
    case 'cat': return PREC.cat;
    case 'star': return PREC.star;
    default: return PREC.atom;
  }
}

export function exprToString(e: Expr): string {
  return print(e, 0);
}

function print(e: Expr, minPrec: number): string {
  let s: string;
  let prec: number;
  switch (e.k) {
    case 'sym': {
      const c = e.c;
      if (c.length > 1) s = `(?:${c})`;
      else if (META_CHARS.has(c)) s = `\\${c}`;
      else if (c === ' ') s = '␣';
      else if (c === '\n') s = '\\n';
      else if (c === '\t') s = '\\t';
      else if (c === '\r') s = '\\r';
      else s = c;
      prec = PREC.atom;
      break;
    }
    case 'eps':
      s = 'ε';
      prec = PREC.atom;
      break;
    case 'empty':
      s = '∅';
      prec = PREC.atom;
      break;
    case 'alt':
      s = e.xs.map(x => print(x, PREC.alt)).join(' + ');
      prec = PREC.alt;
      break;
    case 'cat':
      s = e.xs.map(x => print(x, PREC.cat)).join('');
      prec = PREC.cat;
      break;
    case 'star': {
      const inner = print(e.x, PREC.star);
      s = precOf(e.x) >= PREC.star ? `${inner}*` : `(${inner})*`;
      prec = PREC.star;
      break;
    }
  }
  return prec < minPrec ? `(${s})` : s;
}

/** Symbolic Arden's Theorem Solver */
export class ArdenSolver {
  /** Solve a regular expression from an automaton using Arden's Theorem */
  public static solve(automaton: Automaton): { steps: ArdenStep[]; finalRegex: string } {
    const states = [...automaton.states];
    const acceptingSet = new Set(automaton.acceptingStates);
    const steps: ArdenStep[] = [];
    const n = states.length;
    const start = automaton.startState;
    const idxOf = new Map(states.map((s, i) => [s, i]));
    const startIdx = idxOf.get(start) ?? 0;

    // ── Step 1: Arden-style linear equations per state (educational view) ──
    const equations: Record<string, string> = {};
    for (const state of states) {
      const outgoing = automaton.transitions.filter(t => t.from === state);
      const byDest = new Map<string, string[]>();
      for (const t of outgoing) {
        const sym = t.symbol === EPSILON || t.symbol === '' ? 'ε' : t.symbol;
        if (!byDest.has(t.to)) byDest.set(t.to, []);
        byDest.get(t.to)!.push(sym);
      }
      const terms: string[] = [];
      byDest.forEach((syms, dest) => {
        const symStr = syms.length === 1 ? syms[0] : `(${syms.join(' + ')})`;
        terms.push(symStr === 'ε' ? dest : `${symStr}${dest}`);
      });
      if (acceptingSet.has(state)) terms.push('ε');
      equations[state] = terms.length > 0 ? terms.join(' + ') : '∅';
    }

    steps.push({
      stepNumber: 1,
      title: 'Initial State Equations',
      description: `Construct linear equations for all ${n} states based on transitions and accepting states. If state q ∈ F, append ε. Arden's Theorem: X = A·X + B (with ε ∉ L(A)) has the unique solution X = A*·B.`,
      equations,
    });

    // ── Path-elimination table: R[i][j] = regex of paths i ⇒ j ──
    const R: Expr[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => EMPTY));
    for (const t of automaton.transitions) {
      const i = idxOf.get(t.from);
      const j = idxOf.get(t.to);
      if (i === undefined || j === undefined) continue;
      const symExpr: Expr =
        t.symbol === EPSILON || t.symbol === '' ? EPS : { k: 'sym', c: t.symbol };
      R[i][j] = altOf([R[i][j], symExpr]);
    }

    const eliminated = new Set<number>();
    const snapshotPaths = (): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let j = 0; j < n; j++) {
        if (eliminated.has(j)) continue;
        out[`${start} ➜ ${states[j]}`] = exprToString(R[startIdx][j]);
      }
      out[`${start} loop (${start}*)`] = exprToString(starOf(R[startIdx][startIdx]));
      return out;
    };

    let stepNum = 2;
    for (let k = 0; k < n; k++) {
      if (k === startIdx) continue;
      const q = states[k];

      // R'(i, j) = R(i, j) + R(i, q) · q* · R(q, j)   for all remaining i, j
      for (let i = 0; i < n; i++) {
        if (eliminated.has(i) || i === k) continue;
        for (let j = 0; j < n; j++) {
          if (eliminated.has(j) || j === k) continue;
          const rerouted = catOf([R[i][k], starOf(R[k][k]), R[k][j]]);
          R[i][j] = altOf([R[i][j], rerouted]);
        }
      }
      eliminated.add(k);

      steps.push({
        stepNumber: stepNum++,
        title: `Eliminate state ${q} (Arden's Theorem on the ${q}-loop)`,
        description:
          `Every remaining path p ⇒ r that passed through ${q} is rerouted as ` +
          `p ⇒ ${q} · (${q})* · ${q} ⇒ r, which is the expansion of Arden's solution ` +
          `X = (${q})*·B for the loop equation ${q} = (${q})·${q} + B.`,
        equations: snapshotPaths(),
        appliedArdenOn: q,
      });
    }

    // ── Final result: L = Σ_{f ∈ F} start* · R(start, f) ──
    const startLoop = starOf(R[startIdx][startIdx]);
    const finalTerms: Expr[] = [];
    for (let f = 0; f < n; f++) {
      const fname = states[f];
      if (!acceptingSet.has(fname)) continue;
      finalTerms.push(catOf([startLoop, f === startIdx ? EPS : R[startIdx][f]]));
    }
    const finalExpr = altOf(finalTerms);
    const finalRegex = exprToString(finalExpr);

    steps.push({
      stepNumber: stepNum,
      title: 'Final Regular Expression Derived',
      description:
        `The language of the automaton is L = Σ_{f ∈ F} ${start}*·R(${start}, f). ` +
        `With all intermediate states eliminated, this yields the regular expression for L(M).`,
      equations: { 'L(M)': finalRegex },
      resultExpression: finalRegex,
    });

    return { steps, finalRegex };
  }
}
