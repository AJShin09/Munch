// src/components/Navbar.test.ts
// Project import is the only entry point for arbitrary JSON into the workbench,
// so its structural validation gets direct coverage (no DOM needed).
import { isValidProject } from './Navbar';
import { LANGUAGE_PRESETS } from '../defaultRules';

const validProject = {
  version: '1.0',
  name: 'My Lexer',
  sourceCode: 'let x = 1;',
  rules: LANGUAGE_PRESETS.default_simple.rules,
  savedAt: '2026-01-01T00:00:00.000Z',
};

describe('isValidProject', () => {
  test('accepts a project exported by this app', () => {
    expect(isValidProject(validProject)).toBe(true);
    expect(isValidProject({ ...validProject, name: undefined })).toBe(true);
  });

  test('rejects non-objects and JSON primitives', () => {
    for (const value of [null, undefined, 0, 'project', [], true]) {
      expect(isValidProject(value)).toBe(false);
    }
  });

  test('requires a string sourceCode', () => {
    expect(isValidProject({ ...validProject, sourceCode: undefined })).toBe(false);
    expect(isValidProject({ ...validProject, sourceCode: 42 })).toBe(false);
  });

  test('requires a non-empty rules array', () => {
    expect(isValidProject({ ...validProject, rules: undefined })).toBe(false);
    expect(isValidProject({ ...validProject, rules: 'rules' })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [] })).toBe(false);
  });

  test('rejects rules that the lexer cannot consume', () => {
    const rule = validProject.rules[0];
    expect(isValidProject({ ...validProject, rules: [null] })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [{ ...rule, name: '' }] })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [{ ...rule, regex: 7 }] })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [{ ...rule, priority: 'high' }] })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [{ ...rule, priority: Number.NaN }] })).toBe(false);
    expect(isValidProject({ ...validProject, rules: [{ ...rule, enabled: 'yes' }] })).toBe(false);
  });
});
