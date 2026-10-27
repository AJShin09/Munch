# Munch: An Interactive Workbench for Lexical Analysis and the Theory of Regular Languages

**Project paper** · Version 1.0 · 27 October 2026
**System:** Munch — The Lexical Analyzer Workbench
**Stack:** React 18, TypeScript, Vite, Jest

---

## Abstract

Munch is a browser-based workbench that makes the theory of regular languages executable. It combines a practical lexical analyzer — a source editor, an ordered set of token rules, a live token stream, a per-character DFA trace, and diagnostics — with seven linked theory workbenches for regular expressions, regular grammars, finite automata, Arden's theorem, language closure operations, the pumping lemma, and equivalence checking. Every construction is visible: a regular expression is parsed into an AST, compiled by Thompson's construction into an ε-NFA, determinized by the subset construction, minimized by partition refinement, and then either simulated or converted back into a grammar or a regular expression. This paper explains the formal ideas behind each panel, the exact constructions used in the implementation, the worked examples a user can reproduce, and the honest limits of the approach. It also explains why these ideas matter outside the classroom: the same regular-language machinery underpins compiler front ends, editor highlighting, log and protocol parsing, input validation, and domain-specific languages. Munch is intended both as a teaching instrument and as a practical scratchpad for reasoning about token specifications before they are turned into code.

**Keywords:** regular languages, regular expressions, finite automata, Thompson construction, subset construction, DFA minimization, regular grammar, Arden's theorem, closure properties, pumping lemma, lexical analysis.

---

## 1. Introduction

A compiler front end turns characters into tokens before it can parse anything. That first phase, lexical analysis, is one of the most successful applications of regular-language theory: each token class is described by a regular expression, the expressions are compiled into finite automata, and the automata recognize the token language in time proportional to the input. Students usually meet the same objects in a formal-languages course — DFAs, NFAs, regular grammars, Arden's theorem, closure properties, the pumping lemma — but as separate exercises. The connection between the two courses is often left implicit.

Munch makes the connection explicit. It is a single application with eight workbenches that share a common data model:

1. **Lexer Workbench** — tokenize source code with ordered regular-expression rules, inspect the maximal-munch decision at every step, and see the DFA of the selected rule.
2. **Regex Lab** — parse a regular expression, inspect its AST, and compare the Thompson ε-NFA, the powerset DFA, and the minimized DFA on the same test strings.
3. **Grammar Workbench** — edit a right-linear regular grammar, generate derivations, and convert the grammar to an equivalent NFA.
4. **Automaton Designer** — build a DFA or NFA by hand, convert an NFA to a DFA, minimize a DFA, and simulate an input step by step.
5. **Arden's Theorem** — solve a system of state equations symbolically and derive a regular expression from a DFA.
6. **Language Operations** — apply union, intersection, difference, complement, concatenation, and Kleene star to languages given by regular expressions.
7. **Pumping Lemma** — explore the adversary game for four non-regular languages, validate a witness and decomposition, and see exactly where the contradiction arises.
8. **Equivalence Checker** — compare two regular expressions through their DFAs and obtain a shortest counterexample when they differ.

The rest of this paper is organized around those ideas. Section 2 describes the architecture. Sections 3–8 develop the theory and map each construction to the code. Section 9 covers equivalence and minimization, which tie the other tools together. Section 10 walks a single example through six views. Sections 11–12 discuss practical value and limitations.

### 1.1 Design principles

Three principles shaped the implementation.

- **No hidden answers.** Every result is accompanied by the intermediate objects that produced it: the AST, the ε-NFA, the subset-construction states, the Arden elimination steps, the product automaton, or the pumping decomposition.
- **Constructive proofs.** Closure properties and Arden's theorem are not stated as facts to memorize. The application builds the resulting automaton or expression, so the user can test it.
- **Honest boundaries.** The workbench distinguishes what a finite automaton can decide from what requires a pushdown automaton or a parser. It also documents where the visual model deliberately approximates JavaScript regular-expression behaviour.

---

## 2. The system at a glance

### 2.1 Architecture

Munch is a client-side React application. The engine is plain TypeScript with no DOM dependencies, which is why it can be tested with Jest in a Node environment. The main layers are:

| Layer | Responsibility | Representative files |
| --- | --- | --- |
| Views | Panels, graphs, editors, step controls | `src/components/*.tsx` |
| Lexical engine | Sticky-regex matching, maximal munch, trace, diagnostics | `src/lexer.ts`, `src/engine/steppedLexer.ts` |
| Automata engine | ε-closure, simulation, subset construction, minimization, layout | `src/engine/automaton.ts` |
| Regex engine | Parser, AST, Thompson construction, DFA cache | `src/engine/regexToAutomaton.ts` |
| Theory tools | Grammars, Arden, closure operations, pumping, equivalence | `src/engine/{grammarEngine,ardenSolver,languageOperations,pumpingLemma,equivalenceChecker}.ts` |
| Shared model | `Automaton`, `RegularGrammar`, `Token`, `TokenRule`, diagnostics | `src/types.ts` |

The central pipeline is:

```text
regular expression text
        │  RegexParser
        ▼
      AST
        │  ThompsonBuilder
        ▼
   ε-NFA  ── subset construction ──▶  DFA  ── partition refinement ──▶  minimized DFA
        │                                                                     │
        │                                                                     ├── simulate / graph
        │                                                                     ├── Arden solver → regex
        │                                                                     ├── grammar conversion
        │                                                                     └── closure / equivalence
```

The lexical pipeline is deliberately separate:

```text
source text + ordered token rules
        │  one sticky JavaScript RegExp per enabled rule
        ▼
candidate matches at the current offset
        │  longest match; priority breaks ties
        ▼
token emitted (or UNKNOWN + diagnostic)  ──▶  execution-trace step
        │
        └── the rule's DFA is attached for visualization and per-character tracing
```

That separation is important. The **tokenizer** uses native sticky regular expressions so that it accepts exactly the syntax a JavaScript engine accepts. The **DFA** is a formal model of the same rule, used for explanation, simulation, and conversion. The two agree for the supported rule syntax, with the documented exceptions in Section 12.

### 2.2 Shared data model

An automaton is a five-tuple plus presentation metadata:

```ts
interface Automaton {
  id: string;
  name: string;
  type: 'DFA' | 'NFA' | 'EPSILON_NFA';
  states: string[];
  alphabet: string[];
  transitions: { from: string; symbol: string; to: string }[];
  startState: string;
  acceptingStates: string[];
  layout?: Record<string, { x: number; y: number }>;
}
```

The empty string is represented by the constant `EPSILON` (`ε`). A `RegularGrammar` stores non-terminals, terminals, a start symbol, and productions whose right-hand side is an array such as `['a', 'B']`. A `TokenRule` stores a name, a regular expression, a priority, an enabled flag, and a category; the rule name doubles as the token type. Tokens carry zero-based `start` and `end` positions, with `end` exclusive, and an optional diagnostic.

---

## 3. Regular languages and regular expressions

### 3.1 Alphabets, strings, and languages

An **alphabet** Σ is a finite, non-empty set of symbols. A **string** is a finite sequence of symbols; ε denotes the empty string. Σ* is the set of all finite strings over Σ, and a **language** is any subset of Σ*. Operations on languages include union, intersection, complement (relative to Σ*), concatenation, and Kleene star.

A language is **regular** if it is recognized by a finite automaton, generated by a regular grammar, or denoted by a regular expression. These three characterizations are equivalent — a result usually attributed to Kleene (1956) and McNaughton and Yamada (1960). Munch demonstrates the equivalence rather than merely asserting it: the Regex Lab goes from expression to automaton, the Grammar Workbench goes from grammar to automaton, and Arden's theorem goes from automaton back to expression.

### 3.2 Syntax and semantics of regular expressions

The parser in `src/engine/regexToAutomaton.ts` implements the following core syntax.

| Form | Meaning | Example |
| --- | --- | --- |
| `a` | the literal symbol `a` | `abc` |
| `ε` / empty pattern | the empty string | `(a)` |
| `r1 r2` | concatenation | `ab` |
| `r1 \| r2` | union (alternation) | `a\|b` |
| `r*` | Kleene star: zero or more repetitions | `(ab)*` |
| `r+` | one or more repetitions | `a+` |
| `r?` | zero or one occurrence | `a?` |
| `r{n}`, `r{n,}`, `r{n,m}` | bounded repetition (bounds up to 100) | `a{2,4}` |
| `(r)` | grouping | `(a\|b)*` |
| `[abc]`, `[a-z]`, `[^abc]` | character classes and negated classes | `[A-Za-z_]` |
| `\d`, `\w`, `\s` | digit, word, whitespace classes | `\d+` |
| `\D`, `\W`, `\S` | their complements | `\S+` |
| `\n`, `\t`, `\r`, `\f`, `\v`, `\0` | control-character escapes | `\n` |
| `.` | any character in the finite universe | `.*` |

Precedence is the usual one: star (and the other postfix operators) bind tighter than concatenation, which binds tighter than union. Thus `ab|c*` means `(ab) | (c*)`. The parser strips a leading `^` and a trailing `$`; these anchors add no information to a whole-string automaton, because acceptance is already defined at the end of the input. Word boundaries (`\b`) are treated as ε for automaton construction; this is discussed in Section 12.

The parser also reports useful syntax errors: an unclosed group, an unexpected quantifier, an unclosed character class, and an unsupported lookahead assertion. The error is displayed in the Regex Lab instead of a broken graph.

### 3.3 What regular expressions cannot do

A finite automaton has a fixed, finite amount of memory. It cannot count an unbounded number of symbols or match arbitrarily nested structure. Consequently, the following languages are not regular:

- `{ aⁿ bⁿ | n ≥ 0 }` — equal numbers of two symbols.
- `{ w wᴿ | w ∈ {0,1}* }` — even-length palindromes.
- `{ 0^(n²) | n ≥ 0 }` — perfect-square lengths.
- `{ aᵖ | p is prime }` — prime lengths.
- Balanced parentheses, nested JSON objects, and C expression nesting.

These are exactly the four examples in the Pumping Lemma workbench. The practical consequence is that a lexer can recognize an opening brace and a closing brace, but it cannot check that they balance; that job belongs to a parser with a stack.

---

## 4. Finite automata: the machine behind a token rule

### 4.1 DFA, NFA, and ε-NFA

A **deterministic finite automaton** is a tuple M = (Q, Σ, δ, q₀, F), where Q is a finite set of states, Σ is the alphabet, δ : Q × Σ → Q is the transition function, q₀ is the start state, and F ⊆ Q is the set of accepting states. The extended transition function δ* maps a state and a string to a state. The language of M is

```text
L(M) = { w ∈ Σ* | δ*(q₀, w) ∈ F }.
```

A **non-deterministic finite automaton** replaces δ with a relation δ ⊆ Q × Σ × Q; several moves may be possible for one symbol. An **ε-NFA** additionally allows moves that consume no input. Acceptance for an NFA is defined by whether *some* path ends in an accepting state. The ε-closure of a set of states is the set itself plus every state reachable by ε-transitions.

Munch's `automaton.ts` implements:

- `epsilonClosure(automaton, states)` — transitive closure over ε-edges;
- `stepAutomaton(automaton, states, symbol)` — the set of successor states;
- `simulateAutomaton(automaton, input)` — a step-by-step trace that records the active state set, the consumed symbol, the input index, and whether the set contains an accepting state;
- `convertNfaToDfa(nfa)` — the subset construction;
- `minimizeDfa(dfa)` — reachability pruning followed by iterative partition refinement.

### 4.2 Three constructions

**Thompson's construction.** Each regular expression operator has a small ε-NFA fragment. A literal `a` is two states joined by an `a`-edge. Concatenation connects the accepting state of the first fragment to the start of the second with ε. Union adds a new start with ε-edges to both branches and a new accepting state with ε-edges from both. Star adds a new start and accepting state, an ε-edge that skips the body, and an ε-edge from the body's accept back to its start. The result has O(m) states for an expression of length m. Munch's `ThompsonBuilder` implements exactly this shape.

**Subset construction.** The determinized state is a set of NFA states. The start set is the ε-closure of the NFA start. For each symbol, the successor set is the ε-closure of all NFA successors of the current set. Only reachable sets are materialized. The worst case is exponential in the number of NFA states, although typical token rules produce small DFAs; Munch's Regex Lab shows both the powerset DFA and the minimized DFA so the blow-up is visible.

**Minimization.** Munch removes unreachable states, partitions the remainder into accepting and non-accepting states, and repeatedly splits a partition when its states disagree on the destination partition for some symbol. The implementation is the classic iterative refinement (Moore-style) algorithm; the source comment calls it Hopcroft's algorithm, but the signature-based refinement is the straightforward polynomial version. Once the partition is stable, each block becomes one state, transitions are projected onto blocks, and the start block is marked. The minimized DFA accepts the same language and has the fewest possible states.

### 4.3 Worked example: `(a|b)*abb`

The canonical example is the language of strings over `{a,b}` that end in `abb`. Its minimal DFA has four states:

| State | on `a` | on `b` | Accepting |
| --- | --- | --- | --- |
| q0 (start) | q1 | q0 | no |
| q1 | q1 | q2 | no |
| q2 | q1 | q3 | no |
| q3 | q1 | q0 | yes |

`abb`: q0 → q1 → q2 → q3, accepted. `ab`: q0 → q1 → q2, rejected. `babb`: q0 → q0 → q1 → q2 → q3, accepted. The Regex Lab's default preset is this expression, and its test suite lists accepted and rejected strings side by side.

### 4.4 How Munch compiles a rule

For each enabled token rule, the Lexer builds a sticky regular expression:

```ts
new RegExp(`(?:${rule.regex})`, (rule.caseInsensitive ? 'i' : '') + 'y')
```

The `y` flag anchors the match at `regex.lastIndex`, which the scanner sets to the current offset. This avoids copying the remaining source at every position. The non-capturing wrapper keeps top-level alternations anchored. At each token boundary the scanner tests every enabled rule, keeps the longest match, and breaks equal-length ties by the lower `priority` number (and then by rule order). Zero-length matches are ignored so the scanner cannot stall.

The same rule is also compiled to a DFA through `compileRegexToDfa`, which is memoized by rule name, flags, and pattern (with a 256-entry bound). The DFA is attached to the emitted token and drives the per-character panel. If a rule uses a construct the formal parser cannot model, the tokenizer still works, and the UI reports a warning (`LEX_UNSUPPORTED_RULE_AUTOMATON`) rather than pretending a graph exists.

### 4.5 Maximal munch and priority

The rule is simple and must be stated precisely because it explains several counter-intuitive results:

> At the current offset, choose the rule whose match is longest. If several rules match the same longest text, choose the one with the smallest priority number. If the priority numbers are equal, choose the rule that appears first.

Two examples from the shipped JavaScript rule set:

- `functionality` is a single `IDENTIFIER`, not `KEYWORD("function")` followed by an identifier. The keyword pattern matches eight characters; the identifier pattern matches thirteen. Maximal munch selects the longer match. The keyword's word boundary also prevents the native regex from matching inside the word, so the two mechanisms agree here.
- `2items` is `INTEGER_LITERAL("2")` followed by `IDENTIFIER("items")`. An identifier cannot start with a digit, so only the integer rule matches at offset 0. At offset 1, `items` is an identifier. The lexer does not “repair” the input by merging them.

Operators are the other common case: `===` is one `COMPARISON_OPERATOR`, not three assignments or two comparisons, because the three-character match is longest. `1.` is `INTEGER_LITERAL("1")` followed by `DOT(".")`, because the decimal rule requires at least one digit after the dot; `1.5` is a single `DECIMAL_LITERAL`.

### 4.6 A worked lexical trace

Consider the source `2items = 42;` under the JavaScript preset. The tokens are:

| # | Lexeme | Type | Start | End |
| --- | --- | --- | --- | --- |
| 1 | `2` | `INTEGER_LITERAL` | 0 | 1 |
| 2 | `items` | `IDENTIFIER` | 1 | 6 |
| 3 | ` ` | `WHITESPACE` | 6 | 7 |
| 4 | `=` | `ASSIGNMENT_OPERATOR` | 7 | 8 |
| 5 | ` ` | `WHITESPACE` | 8 | 9 |
| 6 | `42` | `INTEGER_LITERAL` | 9 | 11 |
| 7 | `;` | `SEMICOLON` | 11 | 12 |

Offsets are zero-based and the end is exclusive, so the token occupies `[start, end)`. The Execution Trace panel shows, for each row, the rule candidates that matched at that offset, which one was selected, how many characters it consumed, and the resulting token. Clicking a token card moves the trace to the step that emitted it and switches the DFA panel to that rule, so the token stream, the highlighted trace row, and the automaton always describe the same event.

### 4.7 Diagnostics and positions

The scanner never silently drops a character. If no rule matches, it emits an `UNKNOWN` token for one Unicode code point and a `LEX_UNRECOGNIZED_CHAR` diagnostic containing the character and its code point. If a quote has no closing partner before the end of the input, the diagnostic is `LEX_UNTERMINATED_STRING`; the quote is consumed as `UNKNOWN` and scanning resumes after it. An unterminated block comment produces `LEX_UNTERMINATED_BLOCK_COMMENT` while still tokenizing the `/` and `*` normally. A numeric literal immediately followed by an exponent marker with no digits, such as `1e`, produces `LEX_INVALID_NUMBER`.

Positions are computed with a precomputed line-start index (`buildSourcePositionIndex`) and a binary search (`offsetToSourcePos`), so the per-token cost does not grow with file length. The engine stores zero-based lines and columns; the UI displays one-based `L…:C…` labels. A tab counts as one column, and `\r\n` is one line break.

### 4.8 Complexity notes

Thompson's construction is linear in the pattern. Subset construction is exponential in the worst case; minimization is polynomial but can be quadratic in the number of states with the straightforward refinement. The scanner performs one native regex test per enabled rule per token, so its cost is proportional to the number of rules and the matched text, with the usual caveat that pathological user-supplied patterns can backtrack. The workbench is a modelling and teaching tool, not a claim that every rule set is linear-time in practice. Production lexers usually combine all rules into one DFA or use a guaranteed-linear matcher such as RE2; Munch shows the underlying automata and leaves that engineering step visible.

---

## 5. Regular grammar

### 5.1 Right-linear grammars

A **regular grammar** (in the right-linear form used here) has productions of the form

```text
A → a B
A → a
A → ε
```

where A and B are non-terminals and a is a terminal. At most one non-terminal appears on the right-hand side, and it must be the rightmost symbol. Left-linear grammars, where the non-terminal is leftmost, are equivalent; Munch's editor accepts the right-linear form because it maps directly to an NFA with the start symbol as the start state.

### 5.2 Grammar to automaton and back

`grammarToAutomaton` applies the standard construction:

- a production `A → a B` becomes a transition from A to B on `a`;
- a production `A → a` becomes a transition from A to a fresh accepting state on `a`;
- a production `A → ε` makes A accepting;
- the start symbol is the start state.

`automatonToGrammar` reverses the process: every transition `A --a--> B` becomes `A → a B`, and every accepting state A gets `A → ε`. Epsilon transitions become unit productions. The resulting grammar generates exactly the language of the automaton.

### 5.3 Derivations in Munch

The Grammar Workbench generates short strings by breadth-first expansion. It starts from the start symbol, repeatedly expands the first non-terminal in the sentential form using every applicable production, and records each step. It stops after a configurable number of strings or steps, deduplicates terminal strings, and displays the derivation tree as a sequence of sentential forms with the production used at each step. This is a direct, executable view of the `⇒*` relation.

### 5.4 Worked example

The grammar

```text
S → a S | b S | a A
A → b B
B → b
```

generates the same language as `(a|b)*abb`. A derivation of `babb` is:

```text
S ⇒ b S ⇒ b a A ⇒ b a b B ⇒ b a b b
```

The first two steps consume the prefix `ba`; the last two spell the required suffix `abb`. The Grammar Workbench also shows the equivalent NFA, so the user can compare the derivation with the automaton paths.

### 5.5 Why this matters

Regular grammars are the third leg of the equivalence stool. They are useful when a language is easier to describe recursively than by a regular expression, and they make the “finite memory” limitation vivid: a production can carry only one non-terminal forward, which is exactly one state of memory. Adding a second non-terminal to the right-hand side moves the grammar out of the regular class and toward context-free grammars.

---

## 6. Arden's theorem

### 6.1 Statement

Arden's theorem (Arden, 1961) gives the solution of a linear language equation. In the form used by the solver:

> If P and Q are regular expressions and ε ∉ L(P), then the equation `R = Q + R·P` has the unique solution `R = Q·P*`.

The mirror form is equally useful:

> `R = P·R + Q` has the unique solution `R = P*·Q`.

The condition ε ∉ L(P) matters: without it, the equation can have several solutions, and the “star” solution is the least fixed point rather than the only one. For the systems produced by a DFA, the condition is exactly what makes the state-elimination algorithm well-defined.

**Proof sketch.** Substitute `R = Q·P*` into `R = Q + R·P`:

```text
Q + (Q·P*)·P = Q·(ε + P*·P) = Q·P*.
```

So it is a solution. For uniqueness, let R be any solution. Repeated substitution gives

```text
R = Q + Q·P + Q·P² + Q·P³ + …
```

which is contained in `Q·P*`; conversely, every `Q·Pⁿ` can be obtained by unfolding the equation n times. Hence R = Q·P*. The argument is the language-level version of solving a linear recurrence; the star is the reflexive-transitive closure of the loop.

### 6.2 From state equations to a regular expression

For a DFA with states q₀ … qₙ, write one equation per state:

```text
X_i = Σ over transitions q_i --a--> q_j of a·X_j  +  (ε if q_i ∈ F else ∅)
```

Eliminate states one at a time. If q is being eliminated and the current path expression from i to j is R(i,j), then every path that used q is rerouted as

```text
R'(i,j) = R(i,j) + R(i,q)·R(q,q)*·R(q,j).
```

That is Arden's theorem applied to the loop at q. After all states except the start have been eliminated, the language is the sum over accepting states f of

```text
L(M) = (R(start,start))* · R(start,f).
```

The leading star accounts for loops at the start state. The order of elimination affects the size of the resulting expression but not its language.

### 6.3 Worked example

Take the DFA with q0 (start), q1 (accepting), `q0 --a--> q0`, and `q0 --b--> q1`. The equations are:

```text
X0 = a·X0 + b·X1
X1 = ε
```

Substitute X1 and apply Arden with P = a, Q = b:

```text
X0 = a·X0 + b  ⇒  X0 = a*·b
```

The same result through state elimination:

| Current expression | Value |
| --- | --- |
| R(q0,q0) | `a` |
| R(q0,q1) | `b` |
| R(q1,q1) | `ε` |
| Eliminate q1 | `R'(q0,q0) = a + b·ε*·∅ = a` |
| Final | `(a)*·b = a*b` |

### 6.4 In Munch

The Arden panel compiles one of four preset automata, displays the initial equations, and then walks through the elimination one state at a time. Each step shows the current path expressions and explains which loop was solved. The final step prints the regular expression for the whole automaton.

The implementation deliberately keeps expressions as a small AST (`sym`, `eps`, `empty`, `alt`, `cat`, `star`) rather than splicing strings. The comment in `ardenSolver.ts` records the reason: an earlier string-based version that eliminated `s1` could also rewrite the text of `s10`. The AST also lets the pretty-printer add parentheses only where needed and escape metacharacters in symbols. Duplicate alternatives are removed, concatenations are flattened, and `∅` and `ε` are simplified. The result is still a regular expression, not necessarily the shortest one; Arden's method is a construction, not a minimizer.

### 6.5 Practical value

Arden's theorem is the standard bridge from an automaton back to a specification. That direction is useful for reverse-engineering a protocol, simplifying a machine, documenting a hand-built DFA, or checking that two designs describe the same language. In Munch, it closes the loop: Regex Lab goes from expression to automaton, and Arden goes from automaton back to expression. The Equivalence Checker can then compare the round-tripped expression with the original.

---

## 7. Closure properties

### 7.1 The six operations

Regular languages are closed under a wide range of operations. Munch implements six of them constructively.

| Operation | Definition | Construction used in Munch |
| --- | --- | --- |
| Union | L1 ∪ L2 | Complete both DFAs over the common alphabet; product states; accept if either component accepts. |
| Intersection | L1 ∩ L2 | Same product; accept if both components accept. |
| Difference | L1 \ L2 | Same product; accept if the first accepts and the second does not. |
| Complement | Σ* \ L | Complete the DFA with a sink state, then flip accepting and non-accepting states. |
| Concatenation | L1 · L2 | Add ε-transitions from every accepting state of M1 to the start of M2; the accepting states are those of M2; determinize. |
| Kleene star | L* | Add a new start and a new accepting state; ε to the old start and to the new accept; ε from each old accept back to the old start and to the new accept; determinize. |

The UI exposes these as six buttons in the Language Operations panel, with two regular-expression inputs, the resulting automaton graph, and a live string tester.

### 7.2 Product construction

The Boolean operations share one construction. Let M1 = (Q1, Σ, δ1, q1, F1) and M2 = (Q2, Σ, δ2, q2, F2). First complete each DFA over the union alphabet by adding a sink state for missing transitions. Then build the product automaton whose states are pairs `(p, q)`, whose start is `(q1, q2)`, and whose transition on a is `(δ1(p,a), δ2(q,a))`. The accepting condition is the Boolean operation:

- intersection: `p ∈ F1 and q ∈ F2`;
- union: `p ∈ F1 or q ∈ F2`;
- difference: `p ∈ F1 and q ∉ F2`.

Only reachable pairs are generated, so the result can be much smaller than |Q1| × |Q2|. Munch minimizes the product before displaying it. Completing the DFAs first is essential: a partial DFA treats a missing transition as “reject”, but the product must continue tracking the other component, and complement in particular would otherwise accept incorrectly.

### 7.3 Complement, concatenation, and star

Complement is the simplest operation conceptually and the easiest to get wrong. A DFA is completed with a sink state `q_sink` that loops on every symbol; then every accepting state becomes non-accepting and every non-accepting state becomes accepting. The language is exactly Σ* \ L(M).

Concatenation is an ε-NFA construction. If M1 accepts a string and M2 accepts another, the combined machine can move from the accepting state of M1 to the start of M2 without consuming input. The accepting states of the result are the accepting states of M2. The resulting ε-NFA is determinized by the subset construction, which is where a state blow-up can appear.

Star adds a new start state that can either skip the body (accept ε) or enter it, and a new accepting state reachable from every old accepting state. Each old accepting state also has an ε-edge back to the old start, which is what permits repetition. The new start can reach the new accept directly, so ε ∈ L*. If the body accepts ε, the construction still works; the ε-loops merely add no new strings.

### 7.4 Why closure matters

Closure properties are not bookkeeping. They let us build complex specifications from simple ones and reason about them without constructing an automaton by hand:

- **Union** turns alternative token rules into one language; a lexer's set of keywords is a finite union of literal languages.
- **Intersection** expresses “matches both constraints”, such as “a valid identifier and not a reserved word”.
- **Difference** expresses exclusion, such as “all identifiers except keywords”.
- **Complement** expresses “does not match”, which is the basis of negative validation.
- **Concatenation and star** build repetition and sequencing, which are the operations behind most real patterns.
- **Equivalence** follows from the Boolean operations: L1 = L2 exactly when the symmetric difference is empty.

Munch makes the constructive nature tangible: every operation returns a graph that can be simulated, so a claim such as “the complement of this language accepts that string” can be checked immediately.

### 7.5 In Munch

The Language Operations panel takes two regular expressions (for example, `a(a|b)*` and `(a|b)*a`), builds minimal DFAs, applies the chosen operation, and displays the result. A test-string field evaluates the result with the same simulation engine used everywhere else. The product construction is also the engine behind the Equivalence Checker, where the accepting condition is “exactly one side accepts”.

---

## 8. The pumping lemma

### 8.1 Statement

The pumping lemma for regular languages is a necessary condition:

> If L is regular, then there exists a pumping length p ≥ 1 such that every string s ∈ L with |s| ≥ p can be written as s = xyz, where |xy| ≤ p, |y| ≥ 1, and for every i ≥ 0, x yⁱ z ∈ L.

The intuition is finite memory. A DFA with p states, reading a string of length at least p, must visit some state twice in its first p steps. The substring between the two visits is a loop; removing it or repeating it leaves the machine in the same state, so the string stays in the language. The constraint |xy| ≤ p keeps the loop inside the first p characters, which is what makes the lemma useful for proving non-regularity.

### 8.2 The adversary game

The lemma is naturally read as a game:

| Step | Player | Choice |
| --- | --- | --- |
| 1 | The lemma (for a regular L) | gives a pumping length p |
| 2 | The adversary | chooses a witness s ∈ L with \|s\| ≥ p |
| 3 | The lemma | gives a decomposition s = xyz with \|xy\| ≤ p and \|y\| ≥ 1 |
| 4 | The adversary | chooses an exponent i ≥ 0 |

To prove that L is **not** regular, you assume it is regular, receive p, choose a witness s that exposes the counting, and show that *every* legal decomposition can be pumped to a string outside L. The app lets the user play the adversary role: choose p, enter s, split it into x, y, z, choose i, and inspect the result. It validates every condition and explains why the pumped string is or is not in the language.

### 8.3 Proof template: `aⁿbⁿ`

Assume L = `{ aⁿ bⁿ | n ≥ 0 }` is regular and let p be its pumping length. Choose s = `aᵖbᵖ`. Since |s| = 2p ≥ p, the lemma gives s = xyz with |xy| ≤ p and |y| ≥ 1. Because the first p characters are all `a`, both x and y lie inside the initial block; y = `aᵏ` for some k ≥ 1. Pump with i = 0:

```text
x y⁰ z = a^(p−k) b^p.
```

The number of `a`s is now p − k, while the number of `b`s is still p. Since k ≥ 1, the string is not in L. This contradicts the lemma, so L is not regular.

The same argument with i = 2 gives a string with p + k `a`s, which is also outside L. Either exponent works; the app lets the user pick.

### 8.4 The other built-in languages

- **Even-length palindromes** `{ w wᴿ | w ∈ {0,1}* }`: choose `0ᵖ 11 0ᵖ`; the loop lies in the leading zeros, so pumping makes the two halves unequal.
- **Square lengths** `{ 0^(n²) | n ≥ 0 }`: choose `0^(p²)`; pumping adds between 1 and p zeros, landing strictly between p² and (p+1)², which cannot be a square.
- **Prime lengths** `{ aᵖ | p prime }`: choose a prime m > p; the loop is y = `aᵏ`; pumping with i = m + 1 produces length m + mk = m(k+1), a composite number.

Each language is represented by an exact membership predicate over its stated alphabet, so the explorer does not approximate membership.

### 8.5 The prime-length case

Prime lengths deserve a note because the “obvious” choice of i can fail. If the user pumps with i = 2, the new length is m + k, which may itself be prime. The implementation therefore computes a **guaranteed** contradiction exponent independently of the user's choice:

```text
i = m + 1,  where m = |s|.
|xyⁱz| = |x| + (m+1)·k + |z| = m + m·k = m·(k+1).
```

Both factors exceed 1, so the length is composite and the string is outside L. The panel shows this guaranteed pump alongside the user-selected one and explains why one may be inconclusive while the other is a proof. This is a small but important example of the tool teaching the difference between “I found a counterexample for this choice” and “this choice always yields a counterexample”.

### 8.6 What the lemma does not do

The pumping lemma is necessary but not sufficient. There exist non-regular languages that satisfy its conclusion, so failing to find a contradiction does **not** prove that a language is regular. The lemma is a one-way tool: it can refute regularity, not establish it. Establishing regularity is done constructively — give a DFA, a regular expression, or a regular grammar — which is exactly what the other seven workbenches do. Munch's pumping panel is a guided explorer for the four classic refutations, not a general decision procedure.

### 8.7 In Munch

The Pumping Lemma workbench provides the four languages, a pumping length, a witness, editable x/y/z fields, an exponent, and a proof walkthrough. `validateDecomposition` enforces the formal conditions: p is a positive integer, s belongs to L, |s| ≥ p, x + y + z = s, |y| > 0, and |xy| ≤ p. `findPumpingFailure` then computes the pumped string and its membership. Invalid inputs are reported with the specific violated condition rather than silently producing a wrong answer. For the prime language, the result also includes the proof exponent and the guaranteed pumped string.

---

## 9. Equivalence and minimization

### 9.1 Symmetric difference

Two languages are equal exactly when their symmetric difference is empty:

```text
L1 = L2  ⇔  (L1 \ L2) ∪ (L2 \ L1) = ∅.
```

The Equivalence Checker completes the two DFAs over the common alphabet, builds their product, marks a product state as accepting when exactly one component accepts, and searches the reachable product graph. If no accepting pair is reachable, the languages are equivalent. If one is reachable, the path to it is a counterexample.

### 9.2 Shortest counterexample

The search is breadth-first, so the first accepting pair reached is at the smallest depth. Parent pointers reconstruct the word that leads to it. For `a*` versus `(aa)*`, the shortest counterexample is `a`; for `(a|b)*` versus `(b|a)*`, no counterexample exists. The shortest word is more useful than an arbitrary one because it isolates the smallest input on which the specifications disagree.

### 9.3 In Munch

The Equivalence Checker accepts two regular expressions, compiles both through the same Regex Lab pipeline, minimizes the DFAs, and displays either “languages are equivalent” or the shortest counterexample with its accepting/rejecting status on each side. It is the natural final check after an Arden round trip: compile the original expression, derive a new expression with Arden, compile that, and compare.

---

## 10. Putting it together: one language, six views

The language of JavaScript identifiers, `[A-Za-z_][A-Za-z0-9_]*`, is small enough to follow through every tool.

| Question | Workbench | What the user sees |
| --- | --- | --- |
| What tokens does `2items = 42;` produce? | Lexer | INTEGER, IDENTIFIER, whitespace, assignment, integer, semicolon; maximal munch explained per step. |
| What automaton accepts an identifier? | Regex Lab | Thompson ε-NFA, powerset DFA, minimized DFA, and accept/reject results for `taxRate`, `_counter`, `item2`, `2items`. |
| What grammar generates the same language? | Grammar Workbench | `S → a S`, `S → b S`, …, with derivations of short identifiers and an equivalent NFA. |
| What regular expression describes the DFA? | Arden's Theorem | State equations, elimination steps, and a final expression. |
| Is “keyword or identifier” regular? | Language Operations | The union of the finite keyword language and the identifier language. |
| Can `aⁿbⁿ` be a token class? | Pumping Lemma | A witness, a decomposition, and the pumped string that leaves the language. |
| Are two identifier patterns equivalent? | Equivalence Checker | Either a proof of equality or a shortest disagreeing string. |

The thread also exposes the boundaries. A lexer can recognize an identifier, but it cannot check that the identifier is declared, that parentheses balance, or that a type is valid. Those are context-free or semantic questions. The workbench deliberately stops at the regular boundary and makes that boundary visible.

---

## 11. What the system is for

### 11.1 Learning

Munch is designed for a formal-languages or compiler-design course. It lets a student:

- see the AST behind a regular expression instead of treating the syntax as magic;
- compare an ε-NFA, a powerset DFA, and a minimized DFA for the same language;
- step through an NFA simulation and watch the active state set grow and shrink;
- convert a grammar to an automaton and a derivation to a path;
- solve state equations with Arden's theorem one elimination at a time;
- build a product automaton and see why complement requires a complete DFA;
- test a pumping decomposition and discover why the choice of y matters;
- compare two specifications and get a concrete counterexample.

The key pedagogical choice is that the tool shows the *construction*, not just the answer. A student who has clicked through an elimination can reproduce it on paper.

### 11.2 Practical use

The same views are useful outside a classroom:

- **Rule prototyping.** Before writing a lexer generator specification, test the interaction between keywords, identifiers, numbers, comments, and strings. The maximal-munch trace catches the classic “keyword prefix” bugs.
- **Specification debugging.** If two engineers disagree about a token pattern, compile both and ask the equivalence checker for a counterexample.
- **Documentation.** The generated automata and Arden expressions can be exported visually or reproduced in design documents.
- **Review.** A reviewer can see which characters are unrecognized, where a string is unterminated, and which rule won a tie, instead of guessing from a terse parser error.
- **Teaching and interviews.** The workbench is a compact way to demonstrate that regular languages are closed under complement, that Arden's theorem works, and that a finite automaton cannot count.

### 11.3 Real-world scenarios

| Domain | How the theory is used | What Munch demonstrates |
| --- | --- | --- |
| Compilers and interpreters | The scanner turns characters into tokens; rules are regular expressions compiled to automata (lex/flex, ANTLR lexers, `logos` in Rust, hand-written scanners). | Lexer rules, maximal munch, token positions, DFA simulation. |
| IDEs and editors | Syntax highlighting, incremental lexing, search, and token-based refactoring. | The same rules drive the token stream and the highlighter. |
| Configuration and DSLs | SQL, GraphQL, HCL, PromQL, and protocol message formats all begin with a token grammar. | Regex Lab and Grammar Workbench for rapid language sketches. |
| Log and data pipelines | Parsing nginx/Apache logs, CSV, telemetry payloads, and semi-structured records. | Comment/string/whitespace rules and diagnostics. |
| Input validation | Format checks for identifiers, numbers, dates, and URLs; rejecting malformed input early. | Complement and intersection of regular languages. |
| Security tooling | Signature matching, token-level filtering, and protocol anomaly checks. DFA-based matchers offer predictable time; backtracking engines can be abused. | The finite-automaton model and its complexity boundary. |
| Bioinformatics | DNA and protein motif patterns are regular; nested RNA structure is not. | Regular vs non-regular examples. |
| Hardware and firmware | Command parsers and telemetry field decoders often use small state machines. | Automaton Designer and DFA simulation. |
| Education and research | Automata construction, equivalence, minimization, and proof exploration. | All eight workbenches. |

The important caveat is that a lexer is not a parser. A regular language can describe the shape of a token, but not the nested structure of an expression, a JSON document, or a program. Real systems pair a regular lexer with a context-free or recursive-descent parser. Munch stops at the lexer and says so.

### 11.4 Where the approach stops

The regular world is characterized by finite memory. It cannot:

- count arbitrarily (matching `aⁿ` with `bⁿ`);
- match arbitrary nesting (balanced parentheses, nested objects);
- enforce semantic constraints (a variable is declared before use, types agree);
- recognize palindromes of arbitrary length.

Those require a stack, a parser, or a semantic analysis. The pumping lemma is the formal proof that no finite automaton can do the first two, and the workbench's examples make the proof concrete.

---

## 12. Limitations and honest scope

Munch is a teaching and prototyping tool, and its documentation should be as precise as its code. The following limitations are deliberate or known.

1. **Regular languages only.** There is no parser, no pushdown automaton, and no context-free grammar. Balanced constructs and counting languages are out of scope, by design.
2. **Finite universe for `.` and negated classes.** A DFA over an infinite alphabet cannot enumerate every character. `computeUniverse` uses printable ASCII, common whitespace, and every character mentioned in the pattern. The automaton is exact for that universe; native JavaScript regexes may accept characters outside it.
3. **Word boundaries are ε in the automaton.** The tokenizer's native regex enforces `\b`, but the formal DFA treats it as an epsilon transition. A keyword DFA can therefore accept a prefix that the tokenizer would not classify as a keyword on its own. This is a visualization limitation, not a tokenization bug, and it is documented here rather than hidden.
4. **Anchors and lookaround.** A leading `^` and trailing `$` are stripped; lookahead and lookbehind are rejected with an error; backreferences are outside the regular class and are not supported. Case-insensitive compilation expands ASCII letters only.
5. **Scanner vs model.** The scanner uses native sticky `RegExp` objects; the DFA is a model used for simulation and teaching. The two are kept consistent for the supported syntax, but they are not the same execution path. A production lexer generator would normally execute a combined DFA or a guaranteed-linear matcher.
6. **Preset-driven theory panels.** Arden's theorem uses four preset automata; the pumping lemma covers four built-in languages; the operations and equivalence panels take regular-expression pairs. The engine functions are general, but the UI is intentionally focused.
7. **No visual rule editor in the Lexer workbench.** Rules come from the language presets or an imported project. The token rules are displayed and used, but editing them is a code-level or project-file operation.
8. **State and expression growth.** Subset construction can be exponential; Arden expressions can grow quickly; minimization reduces but does not eliminate the cost. The UI shows sizes so the growth is visible.
9. **Responsive scope.** The phone layout has been tuned for the Lexer workbench. The theory panels use fixed desktop-height canvases and are best used at tablet or desktop widths.
10. **Project hygiene.** The repository tracks some build output under `dist/` even though `dist/` is listed in `.gitignore`; this is a packaging choice to review before publishing. There is no CI pipeline; the verification commands are run locally.

None of these limitations undermines the central claim: for the regular fragment, the workbench's constructions are exact, executable, and testable.

---

## 13. Conclusion

Munch turns a set of formal-language definitions into a connected, inspectable tool. A regular expression becomes an AST, an ε-NFA, a DFA, and a minimized DFA. The same language can be written as a right-linear grammar, solved back into an expression with Arden's theorem, combined with other languages through closure constructions, compared for equivalence, and tested against the pumping lemma's limits. The lexical workbench grounds all of this in a real task: turning source text into tokens with maximal munch, precise offsets, and actionable diagnostics.

The system is useful for two audiences at once. Students can see *why* the constructions work and where they fail; practitioners can prototype and debug token specifications before committing them to a lexer generator. The boundary between regular and non-regular is not a footnote in Munch — it is a visible, testable part of the interface.

---

## References

Arden, D. N. (1961). Delayed logic and finite state machines. In *Theory of Computing Machine Design* (pp. 1–35). University of Michigan Press.

Aho, A. V., Lam, M. S., Sethi, R., & Ullman, J. D. (2006). *Compilers: Principles, Techniques, and Tools* (2nd ed.). Pearson.

Bar-Hillel, Y., Perles, M., & Shamir, E. (1961). On formal properties of simple phrase structure grammars. *Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung, 14*, 143–172.

Cox, R. (2007). *Regular expression matching can be simple and fast*. https://swtch.com/~rsc/regexp/regexp1.html

Hopcroft, J. E. (1971). An n log n algorithm for minimizing states in a finite automaton. In *Theory of Machines and Computations* (pp. 189–196). Academic Press.

Hopcroft, J. E., Motwani, R., & Ullman, J. D. (2006). *Introduction to Automata Theory, Languages, and Computation* (3rd ed.). Pearson.

Kleene, S. C. (1956). Representation of events in nerve nets and finite automata. In *Automata Studies* (pp. 3–41). Princeton University Press.

McNaughton, R., & Yamada, H. (1960). Regular expressions and state graphs for automata. *IRE Transactions on Electronic Computers, 9*(1), 39–47.

Sipser, M. (2012). *Introduction to the Theory of Computation* (3rd ed.). Cengage Learning.

Thompson, K. (1968). Regular expression search algorithm. *Communications of the ACM, 11*(6), 419–422.

---

## Appendix A: Source map

| File | Contents |
| --- | --- |
| `src/types.ts` | Shared `Automaton`, `RegularGrammar`, `Token`, `TokenRule`, `Diagnostic`, and workbench types. |
| `src/engine/regexToAutomaton.ts` | Regex parser, AST, finite universe, Thompson construction, DFA compilation and cache. |
| `src/engine/automaton.ts` | ε-closure, simulation, subset construction, minimization, default layout. |
| `src/engine/steppedLexer.ts` | Analysis result, rule diagnostics, maximal-munch trace, UNKNOWN recovery. |
| `src/lexer.ts` | Sticky-regex compiler and the plain tokenizer used by tests and tools. |
| `src/engine/grammarEngine.ts` | Right-linear grammar to NFA, NFA to grammar, derivation generation. |
| `src/engine/ardenSolver.ts` | Symbolic state equations, state elimination, expression AST and printer. |
| `src/engine/languageOperations.ts` | Completion, product construction, complement, concatenation, Kleene star. |
| `src/engine/pumpingLemma.ts` | Four non-regular languages, decomposition validation, guaranteed prime pump. |
| `src/engine/equivalenceChecker.ts` | Product/symmetric-difference search and shortest counterexample. |
| `src/engine/sourcePosition.ts` | Line-start index and offset-to-position lookup. |
| `src/engine/syntaxHighlight.ts` | Highlight segments derived from the token stream. |
| `src/components/*.tsx` | Lexer, Regex Lab, Grammar, Automaton, Arden, Operations, Pumping, Equivalence views. |

## Appendix B: Running and verifying

```bash
npm install
npm run dev      # development server on http://localhost:3000
npm test         # Jest suite
npm run build    # production bundle in dist/
```

At the time of writing the project passes:

- `node node_modules/typescript/bin/tsc --noEmit` — exit 0.
- `npx jest --runInBand` — 8 suites, 217 tests.
- `npm run build` — success (about 266.7 kB of JavaScript and 13.1 kB of CSS before gzip).

The test suite covers the regex parser and its error messages, Thompson/subset/minimization, identifier acceptance and rejection, maximal munch and priority, comments and strings, CRLF and offset handling, unknown and unterminated input, trace consistency, regular-grammar conversion, Arden expressions, closure operations, pumping witness validation, equivalence counterexamples, and project-import validation.
