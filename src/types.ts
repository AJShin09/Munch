// src/types.ts
// Shared type definitions for Munch — The Lexical Analyzer Workbench

/** Position in the source code */
export interface SourcePos {
  /** Zero‑based line index */
  line: number;
  /** Zero‑based column index */
  column: number;
  /** Zero‑based absolute offset */
  offset: number;
}

/** Diagnostic emitted during lexical analysis */
export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  pos: SourcePos;
  endPos?: SourcePos;
  code?: string;
}

/** Token emitted by the lexer */
export interface Token {
  /** Token type name, e.g. "IDENTIFIER" */
  type: string;
  /** Exact lexeme text */
  lexeme: string;
  /** Starting position */
  start: SourcePos;
  /** End position (exclusive) */
  end: SourcePos;
  /** Name of the rule that matched */
  ruleName?: string;
  /** Rule priority */
  priority?: number;
  /** Matched automaton (if generated) */
  automaton?: Automaton;
  /** Diagnostic if this token represents an error or warning */
  diagnostic?: Diagnostic;
}

/** Single token rule */
export interface TokenRule {
  /** Human‑readable name, also used as token type */
  name: string;
  /** Regular expression in formal‑language syntax (e.g. (let|var|const)\b) */
  regex: string;
  /** Compile the rule's regex without case sensitivity */
  caseInsensitive?: boolean;
  /** Priority used when two rules match the same length (lower number = higher priority) */
  priority: number;
  /** Enable / disable the rule */
  enabled: boolean;
  /** Optional custom color for UI badge/highlighting */
  color?: string;
  /** Description or token category */
  category?: 'keyword' | 'identifier' | 'literal' | 'operator' | 'separator' | 'whitespace' | 'comment' | 'other';
  /** Compiled automaton representation */
  automaton?: Automaton;
}

/** Transition in a Finite Automaton */
export interface AutomatonTransition {
  from: string;
  symbol: string; // 'ε' or '' for epsilon
  to: string;
}

/** Finite Automaton (DFA, NFA, or ε-NFA) */
export interface Automaton {
  id: string;
  name: string;
  type: 'DFA' | 'NFA' | 'EPSILON_NFA';
  states: string[];
  alphabet: string[];
  transitions: AutomatonTransition[];
  startState: string;
  acceptingStates: string[];
  /** Optional 2D positions for visual layout */
  layout?: Record<string, { x: number; y: number }>;
}

/** Result of a single step of automaton simulation */
export interface SimulationStep {
  /** Current set of active states (state ids) */
  activeStates: Set<string>;
  /** Consumed character (or null for epsilon) */
  symbol: string | null;
  /** Input index after this step */
  inputIndex: number;
  /** Explanation of current step */
  explanation?: string;
  /** Whether the active states contain an accepting state */
  isAccepted?: boolean;
}

/** Step in lexical analysis execution trace */
export interface LexerTraceStep {
  stepIndex: number;
  pos: number;
  char: string;
  activeCandidateRules: { ruleName: string; matchedText: string; isBest: boolean }[];
  action: 'SCAN' | 'EVALUATE_RULES' | 'EMIT_TOKEN' | 'EMIT_UNKNOWN' | 'SKIP_WHITESPACE';
  tokenEmitted?: Token;
  explanation: string;
}

/** Regular Grammar Definition */
export interface RegularGrammar {
  id: string;
  name: string;
  nonTerminals: string[];
  terminals: string[];
  startSymbol: string;
  productions: Array<{
    id: string;
    lhs: string; // Single Non-Terminal (e.g. 'S')
    rhs: string[]; // e.g. ['a', 'A'] or ['a'] or ['ε']
  }>;
}

/** Derivation Step in a Regular Grammar */
export interface GrammarDerivationStep {
  step: number;
  sententialForm: string[];
  productionUsed?: string;
  explanation: string;
}

/** Step in Arden's Theorem Symbolic Solver */
export interface ArdenStep {
  stepNumber: number;
  title: string;
  description: string;
  equations: Record<string, string>; // State -> Expression (e.g. X0 = "a X1 + b X2 + ε")
  substitutedState?: string;
  appliedArdenOn?: string;
  resultExpression?: string;
}

/** Pumping Lemma Proof Case */
export interface PumpingLemmaLanguage {
  id: string;
  name: string;
  formula: string;
  description: string;
  alphabet: string[];
  isInLanguage: (w: string) => boolean;
  defaultP: number;
  defaultString: (p: number) => string;
  validateDecomposition: (
    s: string,
    p: number,
    x: string,
    y: string,
    z: string
  ) => { valid: boolean; error?: string };
  findPumpingFailure: (
    s: string,
    p: number,
    x: string,
    y: string,
    z: string,
    i: number
  ) => {
    valid: boolean;
    error?: string;
    pumpedString: string;
    inLanguage: boolean;
    contradictionExplanation: string;
    proofExponent?: number;
    proofPumpedString?: string;
  };
  proofWalkthrough: string[];
}

export type WorkbenchId =
  | 'lexer'
  | 'regex'
  | 'grammar'
  | 'automaton'
  | 'arden'
  | 'operations'
  | 'pumping'
  | 'equivalence';

/** Project file structure for Save/Load/Export */
export interface WorkbenchProject {
  version: string;
  name: string;
  sourceCode: string;
  rules: TokenRule[];
  savedAt: string;
}
