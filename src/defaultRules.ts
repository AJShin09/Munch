// src/defaultRules.ts
import { TokenRule } from './types';

/** Standard default rules tested by test suite */
export const defaultTokenRules: TokenRule[] = [
  // Keywords (let, var, const)
  { name: 'KEYWORD', regex: '(let|var|const)\\b', priority: 1, enabled: true, color: 'var(--ruby)', category: 'keyword' },
  // Identifier
  { name: 'IDENTIFIER', regex: '[A-Za-z_][A-Za-z0-9_]*', priority: 2, enabled: true, color: 'var(--sapphire)', category: 'identifier' },
  // Integer literal
  { name: 'INTEGER_LITERAL', regex: '\\d+', priority: 3, enabled: true, color: 'var(--topaz)', category: 'literal' },
  // Operators (>=, <=, ==, !=, +, -, *, /, =, ;)
  { name: 'OPERATOR', regex: '(>=|<=|==|!=|\\+|\\-|\\*|\\/|=|;)', priority: 4, enabled: true, color: 'var(--amethyst)', category: 'operator' },
  // Whitespace (skip but we emit for visibility)
  { name: 'WHITESPACE', regex: '\\s+', priority: 5, enabled: true, color: '#4d4d4d', category: 'whitespace' },
];

/** Full Rich JavaScript / TypeScript Tokenizer Rules */
export const RICH_JAVASCRIPT_RULES: TokenRule[] = [
  { name: 'LINE_COMMENT', regex: '\\/\\/.*', priority: 1, enabled: true, color: '#737373', category: 'comment' },
  { name: 'BLOCK_COMMENT', regex: '\\/\\*[\\s\\S]*?\\*\\/', priority: 2, enabled: true, color: '#737373', category: 'comment' },
  {
    name: 'KEYWORD',
    regex:
      '(abstract|as|break|case|catch|class|const|continue|debugger|default|delete|declare|do|else|enum|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|namespace|new|null|private|protected|public|readonly|return|static|super|switch|this|throw|true|try|type|typeof|var|void|while|with|yield)\\b',
    priority: 3, enabled: true, color: 'var(--ruby)', category: 'keyword',
  },
  {
    name: 'STRING_LITERAL',
    regex: '("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',
    priority: 4, enabled: true, color: 'var(--emerald)', category: 'literal',
  },
  {
    name: 'DECIMAL_LITERAL',
    regex: '(\\d+\\.\\d+|\\.\\d+)([eE][+-]?\\d+)?|\\d+[eE][+-]?\\d+',
    priority: 5, enabled: true, color: 'var(--topaz)', category: 'literal',
  },
  { name: 'INTEGER_LITERAL', regex: '(0[xX][0-9a-fA-F]+|\\d+)', priority: 6, enabled: true, color: 'var(--topaz)', category: 'literal' },
  { name: 'IDENTIFIER', regex: '[A-Za-z_$][A-Za-z0-9_$]*', priority: 7, enabled: true, color: 'var(--sapphire)', category: 'identifier' },
  { name: 'COMPARISON_OPERATOR', regex: '(===|!==|==|!=|<=|>=|<|>)', priority: 8, enabled: true, color: 'var(--amethyst)', category: 'operator' },
  { name: 'LOGICAL_OPERATOR', regex: '(&&|\\|\\||\\?\\?|\\?\\.|\\?)', priority: 9, enabled: true, color: 'var(--amethyst)', category: 'operator' },
  { name: 'ASSIGNMENT_OPERATOR', regex: '(\\+=|-=|\\*=|\\/=|%=|=>|=)', priority: 10, enabled: true, color: 'var(--amethyst)', category: 'operator' },
  { name: 'ARITHMETIC_OPERATOR', regex: '(\\+\\+|--|\\+|\\-|\\*|\\/|%)', priority: 11, enabled: true, color: 'var(--amethyst)', category: 'operator' },
  { name: 'DOT', regex: '\\.{1,3}', priority: 12, enabled: true, color: '#808080', category: 'separator' },
  { name: 'COLON', regex: ':', priority: 13, enabled: true, color: '#808080', category: 'separator' },
  { name: 'SEMICOLON', regex: ';', priority: 14, enabled: true, color: '#808080', category: 'separator' },
  { name: 'COMMA', regex: ',', priority: 15, enabled: true, color: '#808080', category: 'separator' },
  { name: 'PARENTHESIS', regex: '(\\(|\\))', priority: 16, enabled: true, color: 'var(--sapphire)', category: 'separator' },
  { name: 'BRACE', regex: '(\\{|\\})', priority: 17, enabled: true, color: 'var(--amethyst)', category: 'separator' },
  { name: 'BRACKET', regex: '(\\[|\\])', priority: 18, enabled: true, color: 'var(--amethyst)', category: 'separator' },
  { name: 'WHITESPACE', regex: '\\s+', priority: 19, enabled: true, color: '#4d4d4d', category: 'whitespace' },
];

/** Presets for multiple programming languages */
export const LANGUAGE_PRESETS: Record<string, { name: string; rules: TokenRule[]; sampleSource: string }> = {
  default_simple: {
    name: 'Starter (5 Classic Rules)',
    rules: defaultTokenRules,
    sampleSource: `let total = 25 + count;`,
  },
  javascript: {
    name: 'JavaScript / TypeScript',
    rules: RICH_JAVASCRIPT_RULES,
    sampleSource: `// Interactive Lexical Analyzer Demo
function calculateTotal(items, taxRate) {
  let subtotal = 0.0;
  for (let i = 0; i < items.length; i++) {
    subtotal += items[i].price;
  }
  const tax = subtotal * taxRate;
  return subtotal + tax; // Final sum
}

let result = calculateTotal([{ price: 49.99 }], 0.08);
`,
  },
  c_language: {
    name: 'C / C++',
    rules: [
      { name: 'PREPROCESSOR', regex: '#[a-zA-Z]+(\\s+[^\\n]*)?', priority: 1, enabled: true, color: 'var(--ruby)', category: 'keyword' },
      { name: 'COMMENT', regex: '(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)', priority: 2, enabled: true, color: '#737373', category: 'comment' },
      { name: 'KEYWORD', regex: '(int|float|char|void|if|else|while|for|return|struct|typedef|sizeof)\\b', priority: 3, enabled: true, color: 'var(--ruby)', category: 'keyword' },
      { name: 'STRING_LITERAL', regex: '"(?:[^"\\\\\\n]|\\\\.)*"', priority: 4, enabled: true, color: 'var(--emerald)', category: 'literal' },
      { name: 'INTEGER_LITERAL', regex: '\\d+', priority: 5, enabled: true, color: 'var(--topaz)', category: 'literal' },
      { name: 'IDENTIFIER', regex: '[A-Za-z_][A-Za-z0-9_]*', priority: 6, enabled: true, color: 'var(--sapphire)', category: 'identifier' },
      { name: 'OPERATOR', regex: '(->|\\+\\+|--|==|!=|<=|>=|&&|\\|\\||\\+|-|\\*|\\/|=|<|>|;|,|\\(|\\)|\\{|\\}|\\[|\\])', priority: 7, enabled: true, color: 'var(--amethyst)', category: 'operator' },
      { name: 'WHITESPACE', regex: '\\s+', priority: 8, enabled: true, color: '#4d4d4d', category: 'whitespace' },
    ],
    sampleSource: `#include <stdio.h>

int main() {
    int counter = 10;
    while (counter > 0) {
        counter--;
    }
    return 0;
}`,
  },
  python: {
    name: 'Python',
    rules: [
      { name: 'COMMENT', regex: '#.*', priority: 1, enabled: true, color: '#737373', category: 'comment' },
      { name: 'KEYWORD', regex: '(def|class|if|elif|else|while|for|in|return|import|from|as|True|False|None|and|or|not)\\b', priority: 2, enabled: true, color: 'var(--ruby)', category: 'keyword' },
      { name: 'STRING_LITERAL', regex: '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')', priority: 3, enabled: true, color: 'var(--emerald)', category: 'literal' },
      { name: 'FLOAT_LITERAL', regex: '\\d+\\.\\d+', priority: 4, enabled: true, color: 'var(--topaz)', category: 'literal' },
      { name: 'INTEGER_LITERAL', regex: '\\d+', priority: 5, enabled: true, color: 'var(--topaz)', category: 'literal' },
      { name: 'IDENTIFIER', regex: '[A-Za-z_][A-Za-z0-9_]*', priority: 6, enabled: true, color: 'var(--sapphire)', category: 'identifier' },
      { name: 'OPERATOR', regex: '(\\+=|-=|\\*\\*|\\/\\/|==|!=|<=|>=|<|>|\\+|-|\\*|\\/|=|:|,|\\(|\\)|\\[|\\]|\\{|\\})', priority: 7, enabled: true, color: 'var(--amethyst)', category: 'operator' },
      { name: 'WHITESPACE', regex: '[ \\t\\r\\n]+', priority: 8, enabled: true, color: '#4d4d4d', category: 'whitespace' },
    ],
    sampleSource: `# Python sample scanner
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print("Fibonacci(10):", fibonacci(10))`,
  },
  sql: {
    name: 'SQL',
    rules: [
      { name: 'COMMENT', regex: '(--.*|\\/\\*[\\s\\S]*?\\*\\/)', priority: 1, enabled: true, color: '#737373', category: 'comment' },
      {
        name: 'KEYWORD',
        regex: '(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|ON|GROUP|BY|ORDER|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|AND|OR|NOT|AS)\\b',
        priority: 2, enabled: true, color: 'var(--ruby)', category: 'keyword',
        // JavaScript RegExp has no inline (?i) flag – use the rule-level flag instead
        caseInsensitive: true,
      },
      { name: 'STRING_LITERAL', regex: '\'(?:[^\'\\\\]|\\\\.)*\'', priority: 3, enabled: true, color: 'var(--emerald)', category: 'literal' },
      { name: 'NUMBER', regex: '\\d+(\\.\\d+)?', priority: 4, enabled: true, color: 'var(--topaz)', category: 'literal' },
      { name: 'IDENTIFIER', regex: '[A-Za-z_][A-Za-z0-9_]*', priority: 5, enabled: true, color: 'var(--sapphire)', category: 'identifier' },
      { name: 'OPERATOR', regex: '(=|!=|<>|<=|>=|<|>|\\+|-|\\*|\\/|\\.|,|\\(|\\)|;)', priority: 6, enabled: true, color: 'var(--amethyst)', category: 'operator' },
      { name: 'WHITESPACE', regex: '\\s+', priority: 7, enabled: true, color: '#4d4d4d', category: 'whitespace' },
    ],
    sampleSource: `-- Query active user accounts
SELECT u.id, u.username, COUNT(o.id) AS total_orders
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'ACTIVE'
GROUP BY u.id, u.username
ORDER BY total_orders DESC;`,
  },
};
