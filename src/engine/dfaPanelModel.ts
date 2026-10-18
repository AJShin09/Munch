// src/engine/dfaPanelModel.ts
import { SimulationStep } from '../types';

/**
 * The single canonical model for the character-level DFA panel.
 *
 * Index semantics (exact, used everywhere in the panel):
 *  - `idx` = number of characters already consumed = index of the next
 *    character to process. `idx === 0` is the initial state; the simulation
 *    is complete exactly when `idx === chars.length`.
 *  - `steps[i]` (from `simulateAutomaton`) is the machine state after
 *    consuming characters `0..i-1`, so `current === steps[idx]` is the state
 *    the graph must highlight and `next === steps[idx + 1]` is the state
 *    reached after consuming `chars[idx]`.
 *  - `chars` is taken from the trace itself (`steps[i].symbol`), so the
 *    character strip, the counter, the transition readout and the graph can
 *    never disagree about the input or the position within it.
 */
export interface DfaPanelModel {
  /** Input characters as consumed by the simulation, one entry per step after the initial one. */
  chars: string[];
  /** Characters consumed == index of the next character to process. */
  idx: number;
  /** Machine state after consuming `idx` characters (undefined only when there is no simulation). */
  current: SimulationStep | undefined;
  /** Machine state after consuming `idx + 1` characters (undefined at end of input). */
  next: SimulationStep | undefined;
  /** The states the graph must highlight — identical to `current.activeStates`. */
  activeStates: Set<string>;
  /** The transition the graph must highlight for `chars[idx]` (null unless both sides are single states). */
  activeTransition: { from: string; to: string } | null;
  /** True when the whole lexeme has been consumed (a simulation exists and idx is at the end). */
  complete: boolean;
  /** Whether the DFA accepts the *entire* lexeme (final step), regardless of the current position. */
  accepted: boolean;
  /** True when the machine is stuck in a dead state before finishing the lexeme. */
  dead: boolean;
}

const EMPTY_STATES = new Set<string>();

/** Derive every DFA-panel readout from one trace and one index — pure and synchronous. */
export function deriveDfaPanelModel(steps: SimulationStep[], rawIdx: number): DfaPanelModel {
  const chars: string[] = [];
  for (let i = 1; i < steps.length; i++) chars.push(steps[i].symbol as string);

  const idx = steps.length > 0 ? Math.max(0, Math.min(rawIdx, steps.length - 1)) : 0;
  const current = steps.length > 0 ? steps[idx] : undefined;
  const next = steps[idx + 1];
  const final = steps.length > 0 ? steps[steps.length - 1] : undefined;

  let activeTransition: { from: string; to: string } | null = null;
  if (current && next && idx < chars.length && current.activeStates.size === 1 && next.activeStates.size === 1) {
    activeTransition = {
      from: Array.from(current.activeStates)[0],
      to: Array.from(next.activeStates)[0],
    };
  }

  return {
    chars,
    idx,
    current,
    next,
    activeStates: current ? current.activeStates : EMPTY_STATES,
    activeTransition,
    complete: steps.length > 0 && idx >= chars.length,
    accepted: Boolean(final?.isAccepted),
    dead: Boolean(current && current.activeStates.size === 0 && !(steps.length > 0 && idx >= chars.length)),
  };
}
