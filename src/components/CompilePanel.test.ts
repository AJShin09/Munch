// src/components/CompilePanel.test.ts
//
// The grammar view folds one production per alphabet symbol into a bracketed
// class. That fold is presentation only, so the test pins the two properties
// that keep it honest: a run of symbols becomes one range, and anything that
// would need escaping stays as a literal production.
import { productionLines } from './CompilePanel';

const p = (lhs: string, rhs: string[]) => ({ id: `${lhs}-${rhs.join('')}`, lhs, rhs });

describe('productionLines', () => {
  test('folds a run of single-symbol transitions into one ranged class', () => {
    const lines = productionLines([
      p('q0', ['a', 'q1']),
      p('q0', ['b', 'q1']),
      p('q0', ['c', 'q1']),
      p('q0', ['d', 'q1']),
      p('q1', ['ε']),
    ]);
    expect(lines).toContain('q0 → [a-d]q1');
    expect(lines).toContain('q1 → ε');
    expect(lines).toHaveLength(2);
  });

  test('keeps symbols that would need escaping as literal productions', () => {
    const lines = productionLines([
      p('q0', ['$', 'q1']),
      p('q0', [']', 'q1']),
      p('q0', ['a', 'q1']),
      p('q0', ['b', 'q1']),
    ]);
    expect(lines).toContain('q0 → $q1');
    expect(lines).toContain('q0 → ]q1');
    expect(lines).toContain('q0 → [ab]q1');
  });

  test('does not merge transitions that end in different states', () => {
    const lines = productionLines([
      p('q0', ['a', 'q1']),
      p('q0', ['b', 'q2']),
    ]);
    expect(lines).toEqual(['q0 → aq1', 'q0 → bq2']);
  });
});
