/**
 * Seed script — creates test users, wiki articles, Q&A, marketplace resources, and posts.
 * Run with:
 *   node seed.js                    -- seed everything (calls OpenAI for embeddings)
 *   node seed.js --skip-embeddings  -- seed without calling OpenAI/Ollama
 *   node seed.js --content-only     -- skip users, seed only content tables
 *
 * After seeding without embeddings, hit POST /ai/reindex while the server is running.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const bcrypt = require('bcrypt');
const db = require('./models');
const { WikiArticles, Questions, Answers, Resources, Posts } = db;

const SKIP_EMBEDDINGS = process.argv.includes('--skip-embeddings');
const CONTENT_ONLY    = process.argv.includes('--content-only');

let indexContent = async () => {};
if (!SKIP_EMBEDDINGS) {
    try {
        indexContent = require('./services/embeddingSync').indexContent;
    } catch (e) {
        console.warn('Warning: could not load embeddingSync:', e.message);
        console.warn('Proceeding without embeddings. Run POST /ai/reindex later.\n');
    }
}

async function safeIndex(type, id) {
    try { await indexContent(type, id); } catch (e) {
        // silently skip — missing API key is common in dev
    }
}

const USERS = [
    // ── Students ──────────────────────────────────────────────
    {
        name: 'Alex Kim',
        email: 'student1@test.com',
        username: 'alexkim',
        password: 'password123',
        role: 'student',
        curriculum: 'IB',
        subject: 'Mathematics',
        targetUniversity: 'MIT',
        major: 'Computer Science',
        gradeLevel: '12',
        isPublic: true,
        xp: 340,
        level: 4,
        currentStreak: 5,
        longestStreak: 12,
        totalStudyMinutes: 480,
        totalSessions: 8,
    },
    {
        name: 'Sara Mendez',
        email: 'student2@test.com',
        username: 'saramen',
        password: 'password123',
        role: 'student',
        curriculum: 'AP',
        subject: 'Biology',
        targetUniversity: 'Johns Hopkins',
        major: 'Pre-Med',
        gradeLevel: '11',
        isPublic: true,
        xp: 120,
        level: 2,
        currentStreak: 2,
        longestStreak: 7,
        totalStudyMinutes: 200,
        totalSessions: 3,
    },
    {
        name: 'James Park',
        email: 'student3@test.com',
        username: 'jamespark',
        password: 'password123',
        role: 'student',
        curriculum: 'A-Level',
        subject: 'Physics',
        targetUniversity: 'Caltech',
        major: 'Physics',
        gradeLevel: '12',
        isPublic: false,
        xp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        totalStudyMinutes: 0,
        totalSessions: 0,
    },

    // ── Alumni ────────────────────────────────────────────────
    {
        name: 'Arjun Kumar',
        email: 'alumni1@test.com',
        username: 'arjunkumar',
        password: 'password123',
        role: 'alumni',
        curriculum: 'IB',
        subject: 'Computer Science',
        major: 'Computer Science',
        university: 'MIT',
        gradeLevel: 'Graduate',
        openHours: 'Mon-Wed 4-7pm',
        isPublic: true,
        xp: 1200,
        level: 13,
        currentStreak: 14,
        longestStreak: 31,
        totalStudyMinutes: 2400,
        totalSessions: 40,
        trustScore: 95,
    },
    {
        name: 'Sofia Martinez',
        email: 'alumni2@test.com',
        username: 'sofiamartinez',
        password: 'password123',
        role: 'alumni',
        curriculum: 'AP',
        subject: 'Biology',
        major: 'Pre-Med',
        university: 'Johns Hopkins',
        gradeLevel: 'Graduate',
        openHours: 'Tue-Thu 3-6pm',
        isPublic: true,
        xp: 980,
        level: 10,
        currentStreak: 31,
        longestStreak: 45,
        totalStudyMinutes: 3600,
        totalSessions: 60,
        trustScore: 98,
    },
    {
        name: 'David Chen',
        email: 'alumni3@test.com',
        username: 'davidchen',
        password: 'password123',
        role: 'alumni',
        curriculum: 'A-Level',
        subject: 'Mathematics',
        major: 'Mathematics',
        university: 'Stanford',
        gradeLevel: 'Graduate',
        openHours: 'Weekends 10am-2pm',
        isPublic: true,
        xp: 760,
        level: 8,
        currentStreak: 8,
        longestStreak: 22,
        totalStudyMinutes: 1800,
        totalSessions: 30,
        trustScore: 90,
    },

    // ── Admin ─────────────────────────────────────────────────
    {
        name: 'Admin User',
        email: 'admin@test.com',
        username: 'admin',
        password: 'admin123',
        role: 'student',
        isPublic: false,
        isAdmin: true,
        xp: 0,
        level: 1,
    },
];

// ─── Content Seed Data ────────────────────────────────────────────────────────
// authorKey references a username from the USERS array above.

const WIKI_ARTICLES = [
    {
        authorKey: 'alexkim',
        title: 'Big-O Notation: A Practical Guide',
        subject: 'Computer Science',
        tags: 'algorithms,complexity,big-o,fundamentals',
        content: `# Big-O Notation: A Practical Guide

Big-O notation describes how an algorithm's time or space requirements grow as the input size grows. It focuses on the dominant term and ignores constants, giving us a language to compare algorithms independently of hardware.

## Why It Matters

When choosing between two sorting algorithms for 10 items the difference is negligible. For 10 million items, an O(n log n) algorithm finishing in seconds versus an O(n^2) one taking hours is mission-critical.

## Common Complexity Classes

- O(1)       Constant      — Array index lookup
- O(log n)   Logarithmic   — Binary search
- O(n)       Linear        — Linear scan
- O(n log n) Linearithmic  — Merge sort, heap sort
- O(n^2)     Quadratic     — Bubble sort, nested loops
- O(2^n)     Exponential   — Recursive Fibonacci, power set
- O(n!)      Factorial     — Brute-force TSP

## How to Analyse an Algorithm

Step 1: Count operations — how many times each statement runs relative to input size n.
Step 2: Keep the dominant term. 3n^2 + 5n + 12 becomes O(n^2).
Step 3: Consider worst case unless stated otherwise.

## Example: Two-Sum

Brute force O(n^2): nested loops checking every pair.

Hash map O(n): store each number in a dict, check for the complement in O(1).
  seen = {}
  for i, num in enumerate(nums):
    complement = target - num
    if complement in seen: return [seen[complement], i]
    seen[num] = i

The hash map version trades O(n) extra space for linear time — a classic space-time tradeoff.

## Space Complexity

Counts auxiliary memory allocated. Recursive algorithms have O(depth) call-stack space. Iterative replacements often reduce space complexity significantly.

## Common Pitfalls

- String concatenation in a loop is O(n^2) — each concat copies the whole string.
- "in" on a Python list is O(n); "in" on a set is O(1). Know your data structure operations.
- Big-O drops log bases: log_2(n) and log_10(n) differ by only a constant factor.

## Amortized Analysis

Dynamic array appends are O(1) amortized even though occasional resizes are O(n), because resizing doubles capacity each time and the cost is spread across all appends.

## Summary

O(1) < O(log n) < O(n) < O(n log n) < O(n^2) < O(2^n). When optimising, ask: can I trade space for time? Can I sort first to enable binary search?`,
    },
    {
        authorKey: 'arjunkumar',
        title: 'Dynamic Programming: From Memoisation to Tabulation',
        subject: 'Computer Science',
        tags: 'dynamic-programming,algorithms,recursion,optimisation',
        content: `# Dynamic Programming: From Memoisation to Tabulation

Dynamic Programming (DP) solves problems by breaking them into overlapping subproblems, solving each once, and storing the result. The two prerequisites are optimal substructure (optimal solution built from optimal subsolutions) and overlapping subproblems (same subproblem solved multiple times).

## Recognising DP Problems

Ask: "Given some state, what is the optimal/total/possible result?" Common patterns:
- Counting paths or ways
- Min/max cost to reach a goal
- Longest/shortest subsequence
- Partition/subset problems

## Top-Down: Memoisation

Start with naive recursion, then cache results.

  from functools import lru_cache

  @lru_cache(maxsize=None)
  def fib(n):
      if n <= 1: return n
      return fib(n-1) + fib(n-2)

Naive O(2^n) becomes O(n) — each subproblem computed exactly once.

## Bottom-Up: Tabulation

Build a table from base cases upward. No recursion overhead, better cache locality.

  def fib_opt(n):
      a, b = 0, 1
      for _ in range(n): a, b = b, a + b
      return a

## Classic: 0/1 Knapsack

Given n items with weights and values, capacity W, maximise value.

  def knapsack(weights, values, W):
      n = len(weights)
      dp = [[0] * (W + 1) for _ in range(n + 1)]
      for i in range(1, n + 1):
          for w in range(W + 1):
              dp[i][w] = dp[i-1][w]
              if weights[i-1] <= w:
                  dp[i][w] = max(dp[i][w], dp[i-1][w - weights[i-1]] + values[i-1])
      return dp[n][W]

Time O(nW). Space O(nW), reducible to O(W) by reusing a single row.

## State Design: The Key Skill

"What is the minimum information needed to describe where I am in the problem?"
- Longest Common Subsequence: state (i,j) = LCS of s1[:i] and s2[:j]
- Edit Distance: state (i,j) = min edits to transform s1[:i] into s2[:j]
- Coin Change: state = amount remaining

## Common Mistakes

1. Off-by-one errors — draw the table on paper first.
2. Wrong base cases — what is the answer for empty input?
3. Missing transitions — enumerate every way to reach each state.

## Practice Ladder (LeetCode)

LC 70 Climbing Stairs, LC 198 House Robber, LC 62 Unique Paths, LC 1143 Longest Common Subsequence, LC 322 Coin Change.`,
    },
    {
        authorKey: 'davidchen',
        title: 'Understanding Epsilon-Delta Proofs in Real Analysis',
        subject: 'Mathematics',
        tags: 'analysis,limits,epsilon-delta,proof-writing',
        content: `# Understanding Epsilon-Delta Proofs in Real Analysis

The epsilon-delta definition of a limit is the rigorous foundation of calculus. This guide builds intuition before mechanics.

## The Intuition

We say lim_{x->a} f(x) = L if we can make f(x) as close to L as we wish by taking x sufficiently close to a.

"As close as we wish" is formalised as: for any epsilon > 0 (error tolerance around L), there exists delta > 0 (a distance around a) such that whenever 0 < |x - a| < delta we have |f(x) - L| < epsilon.

Think of it as a game: your opponent picks epsilon (any positive number, possibly tiny), and you must respond with a delta that works.

## Formal Definition

lim_{x->a} f(x) = L means:
  for all epsilon > 0, there exists delta > 0 such that 0 < |x-a| < delta implies |f(x)-L| < epsilon.

Note: 0 < |x-a| excludes x = a. The value of f at a is irrelevant to the limit.

## Worked Example 1: Linear

Claim: lim_{x->3} (2x-1) = 5.

Scratchwork: |(2x-1)-5| = 2|x-3| < epsilon when |x-3| < epsilon/2. Choose delta = epsilon/2.

Proof: Let epsilon > 0. Choose delta = epsilon/2. If 0 < |x-3| < delta then |(2x-1)-5| = 2|x-3| < 2*delta = epsilon. QED

## Worked Example 2: Quadratic

Claim: lim_{x->2} x^2 = 4.

Scratchwork: |x^2-4| = |x-2||x+2|. Assume |x-2| < 1, so |x+2| < 5. Then |x^2-4| < 5|x-2|.
Need |x-2| < epsilon/5. Choose delta = min(1, epsilon/5).

Proof: Let epsilon > 0, delta = min(1, epsilon/5). If 0 < |x-2| < delta, then |x+2| < 5 and |x^2-4| = |x-2||x+2| < delta*5 <= epsilon. QED

## The Preliminary Constraint Pattern

For non-linear f: introduce a preliminary bound (e.g. |x-a| < 1), bound the extra factor, then use delta = min(1, epsilon/bound). This is the standard technique, not a trick.

## Common Errors

- Circular reasoning: do not use limit laws inside the proof you are building.
- delta must be expressed in terms of epsilon.
- Forgetting 0 < |x-a|.
- Writing scratchwork as the proof — they are separate documents.

## Practice

1. Prove lim_{x->1} (3x+2) = 5.
2. Prove lim_{x->0} x^2 = 0.
3. Prove lim_{x->2} (x^2+x) = 6.
4. Prove lim_{x->4} sqrt(x) = 2. (Hint: rationalise the numerator.)`,
    },
    {
        authorKey: 'davidchen',
        title: 'Linear Algebra: Eigenvalues and Eigenvectors Explained',
        subject: 'Mathematics',
        tags: 'linear-algebra,eigenvalues,eigenvectors,matrix',
        content: `# Linear Algebra: Eigenvalues and Eigenvectors Explained

Eigenvalues and eigenvectors underpin quantum mechanics, Google PageRank, PCA in machine learning, and stability analysis of differential equations.

## The Core Idea

A matrix A acts on vectors by stretching, rotating, or reflecting. An eigenvector of A is a non-zero vector v that only gets scaled when A acts on it: A*v = lambda*v.
lambda is the eigenvalue (the scaling factor). The direction of v is preserved.

## Finding Eigenvalues

Rewrite as (A - lambda*I)*v = 0. For a non-zero solution, A - lambda*I must be singular:
  det(A - lambda*I) = 0  (the characteristic equation)

Example — A = [[3,1],[0,2]]:
  det([[3-lambda,1],[0,2-lambda]]) = (3-lambda)(2-lambda) = 0
  => lambda_1 = 2, lambda_2 = 3

## Finding Eigenvectors

For lambda_1 = 2: solve (A-2I)v = 0. [[1,1],[0,0]]v = 0 => v_1 = [-1,1].
For lambda_2 = 3: solve (A-3I)v = 0. [[0,1],[0,-1]]v = 0 => v_2 = [1,0].

## Geometric Interpretation

lambda > 1: stretch. 0 < lambda < 1: compress. lambda = -1: reflect through origin.
lambda = 0: maps to zero; A is singular, v is in the null space.
Complex lambda: occurs for rotation matrices; no real eigenvectors.

## Diagonalisation

If A has n linearly independent eigenvectors: A = P*D*P^{-1}
where P has eigenvectors as columns and D = diag(lambda_1,...,lambda_n).
Powerful: A^k = P * D^k * P^{-1}, and D^k just raises each diagonal entry to the kth power.

## Spectral Theorem (Symmetric Matrices)

For A = A^T: all eigenvalues are real, eigenvectors for distinct eigenvalues are orthogonal, and A is always diagonalisable. This is why covariance matrices and Hamiltonians are symmetric.

## Applications

PCA: eigenvectors of the covariance matrix are principal components. Largest eigenvalue = direction of greatest variance.
PageRank: dominant eigenvector (lambda=1) of the web link matrix.
ODEs: for x' = Ax, general solution involves e^{lambda_i*t}*v_i. Stability depends on sign of Re(lambda).

## Common Mistakes

1. Eigenvectors must be non-zero — v=0 is never an eigenvector.
2. There is an eigenspace (whole subspace), not just one vector, per eigenvalue.
3. Not all matrices are diagonalisable — defective matrices have eigenspaces too small to span R^n.`,
    },
    {
        authorKey: 'jamespark',
        title: "Newton's Laws: Beyond the Textbook Definitions",
        subject: 'Physics',
        tags: 'mechanics,newtons-laws,classical-physics,forces',
        content: `# Newton's Laws: Beyond the Textbook Definitions

Most students can recite Newton's Three Laws, but real exam questions test whether you understand their implications.

## First Law: Inertia

"An object at rest stays at rest, and an object in motion stays in motion at constant velocity, unless acted upon by a net external force."

Key word: NET. If multiple forces sum to zero, the object does not accelerate. This is static equilibrium (at rest) or dynamic equilibrium (constant velocity).

Common misconception: a moving object does not need a force to keep moving. Forces change velocity, not maintain it. Inertia is a property of mass, not a force.

## Second Law: F = ma

This is a vector equation — force and acceleration point in the same direction.

Free body diagram checklist:
1. Isolate the object.
2. Draw every force acting ON it (not forces it exerts on others).
3. Choose axes aligned with the motion.
4. Write sum(F_x) = m*a_x and sum(F_y) = m*a_y separately.

Example — block on frictionless incline at angle theta:
  Along incline: m*g*sin(theta) = m*a  =>  a = g*sin(theta)  (independent of mass!)
  Perpendicular:  N = m*g*cos(theta)

## Third Law: Action and Reaction

"For every action there is an equal and opposite reaction."

F and -F act on DIFFERENT objects — they never cancel each other. The book pushes down on the table; the table pushes up on the book. These are the action-reaction pair for the contact force. The book's weight (gravity pulling down) and the normal force (table pushing up) are NOT an action-reaction pair — they both act on the book and happen to be equal only in equilibrium.

## Friction

Static: f_s <= mu_s * N. Adjusts up to its maximum to prevent motion.
Kinetic: f_k = mu_k * N. Constant once sliding starts. mu_k < mu_s always.

## Problem-Solving Steps

1. Draw free body diagrams for each object.
2. Choose coordinate axes.
3. Write F = ma for each axis and object.
4. For connected objects use constraint equations (e.g. |a_1| = |a_2| for inextensible string).
5. Solve and check signs.`,
    },
    {
        authorKey: 'arjunkumar',
        title: "How to Ace Technical Interviews: A CS Graduate's Guide",
        subject: 'Computer Science',
        tags: 'career,interviews,technical,leetcode,advice',
        content: `# How to Ace Technical Interviews: A CS Graduate's Guide

I went through 12 technical interviews before landing my first role. Here is everything I wish I had known.

## The UMPIRE Framework

When given a coding problem:
- Understand: ask clarifying questions. What are the constraints? What is the expected output for edge cases?
- Match: which data structures or algorithms apply? (array -> two pointers; graph -> BFS/DFS; sorted -> binary search)
- Plan: outline your approach verbally before you write a single line.
- Implement: write clean code with meaningful variable names.
- Review: trace through a test case, find bugs.
- Evaluate: state time and space complexity.

## What Interviewers Actually Look For

They are NOT just testing whether you know the answer. They watch:
- Communication: do you think out loud? Do you ask clarifying questions?
- Problem decomposition: can you break a hard problem into smaller pieces?
- Adaptability: if stuck, do you try a different approach or freeze?
- Code quality: readable names, no magic numbers, handles edge cases.

A candidate who starts with brute force, recognises its flaws, and iteratively improves while explaining their reasoning scores higher than one who arrives at an optimal solution in silence.

## 12-Week Study Plan

Weeks 1-3: arrays, strings, hash maps, two-pointer and sliding window patterns. LeetCode Easy (~50 problems).
Weeks 4-6: linked lists, stacks, queues, binary trees. LeetCode Easy/Medium mix.
Weeks 7-9: binary search, graphs (BFS, DFS, topological sort, union-find), dynamic programming. LeetCode Medium focus.
Weeks 10-12: timed mock interviews (Pramp, interviewing.io), company-specific problem lists, review weak topics.

## The Most Common Mistake

Grinding 400 problems without being able to explain complexity. Every practice session should end with: what is the time complexity and why? What is the space complexity? What edge cases does my code handle? Is there a better approach?

## Behavioural Questions (STAR)

Situation, Task, Action, Result. Prepare 5-6 stories covering: disagreement with a teammate, a project that failed, going beyond your scope, learning something quickly under pressure.

## Salary Negotiation

Always negotiate. Research Glassdoor and Levels.fyi. "I am very excited about this role. Based on my research I was expecting something closer to X — is there flexibility?" You will not lose an offer for negotiating respectfully.`,
    },
    {
        authorKey: 'davidchen',
        title: 'Proof Techniques Every Maths Student Should Know',
        subject: 'Mathematics',
        tags: 'proofs,logic,induction,contradiction,direct-proof',
        content: `# Proof Techniques Every Maths Student Should Know

Writing proofs is a skill built through practice. This article covers the six core techniques with worked examples.

## 1. Direct Proof

Assume the hypothesis; deduce the conclusion using definitions and previously proved results.

Theorem: The sum of two even integers is even.
Proof: Let m = 2a and n = 2b. Then m+n = 2(a+b), which is even. QED

## 2. Proof by Contrapositive

Instead of proving P => Q, prove not-Q => not-P (logically equivalent).

Theorem: If n^2 is even, then n is even.
Contrapositive proof: If n is odd, n = 2k+1, then n^2 = 4k^2+4k+1 = 2(2k^2+2k)+1, which is odd. QED

Use when: hypothesis is complex and the conclusion is simpler to negate.

## 3. Proof by Contradiction

Assume the negation, derive a logical impossibility.

Theorem: sqrt(2) is irrational.
Proof: Assume sqrt(2) = p/q with gcd(p,q)=1. Then p^2 = 2q^2, so p is even (p=2k). Then 4k^2=2q^2, so q^2=2k^2, so q is even. But then gcd(p,q) >= 2. Contradiction. QED

## 4. Mathematical Induction

Base case + inductive step.

Theorem: 1+2+...+n = n(n+1)/2 for all n >= 1.
Base (n=1): LHS=1, RHS=1*2/2=1. Check.
Step: Assume for n=k. Then 1+...+k+(k+1) = k(k+1)/2 + (k+1) = (k+1)(k+2)/2. QED

Strong induction: the hypothesis assumes P(1),...,P(k) are all true. Use when P(k+1) depends on cases earlier than just k.

## 5. Proof by Cases

Split into exhaustive, mutually exclusive cases.

Theorem: n^2 + n is even for all integers n.
n even: n=2k, so n^2+n=2(2k^2+k), even.
n odd: n=2k+1, so n^2+n=4k^2+6k+2=2(2k^2+3k+1), even. QED

## 6. Existence and Uniqueness

Existence: exhibit an example or use a non-constructive argument (e.g. IVT).
Uniqueness: assume two objects x and y satisfy the condition, then prove x=y.

## Writing Style

- Define everything on first use: "Let n be an even integer."
- Every equation is a sentence: "Since p^2 = 2q^2, we have..."
- State what you are doing: "We proceed by contrapositive."
- End with QED or a tombstone symbol.`,
    },
];

const QA_DATA = [
    {
        authorKey: 'jamespark',
        title: 'Why does the derivative of sin(x) equal cos(x)?',
        subject: 'Mathematics',
        tags: 'calculus,trigonometry,derivatives',
        body: `I know that d/dx[sin(x)] = cos(x) but I have only ever been told to memorise it. Can someone explain where this actually comes from? Preferably without using the Taylor series since we have not covered that yet.`,
        answers: [
            {
                authorKey: 'davidchen',
                content: `Great question — deriving this from first principles is a real rite of passage in calculus.

By definition: d/dx[f(x)] = lim_{h->0} [f(x+h) - f(x)] / h

For f(x) = sin(x), apply the angle addition formula sin(x+h) = sin(x)cos(h) + cos(x)sin(h):

d/dx[sin(x)] = lim_{h->0} [sin(x)(cos(h)-1) + cos(x)sin(h)] / h
             = sin(x) * lim_{h->0} (cos(h)-1)/h  +  cos(x) * lim_{h->0} sin(h)/h

Two key limits:
- lim_{h->0} sin(h)/h = 1   (provable geometrically via the squeeze theorem)
- lim_{h->0} (cos(h)-1)/h = 0   (follows from the first using cos(h)-1 = -2sin^2(h/2))

Result: sin(x)*0 + cos(x)*1 = cos(x). QED

The geometric proof that lim sin(h)/h = 1 is beautiful: compare areas of a triangle, circular sector, and larger triangle on the unit circle, then squeeze them together. It is worth looking up.`,
                isAccepted: true,
                votes: 8,
            },
            {
                authorKey: 'saramen',
                content: `Adding a geometric intuition to David's answer:

Think of sin(x) as the y-coordinate of a point moving counterclockwise around the unit circle. The rate at which sin(x) changes is the x-coordinate of that same point, which is cos(x).

When sin(x) is increasing most rapidly (at x=0), cos(x)=1 is maximal. When sin(x) peaks (x=pi/2), it momentarily flatlines, and cos(pi/2)=0.

This is a good sanity check but not a rigorous proof. David's first-principles derivation is what you would write in an exam.`,
                isAccepted: false,
                votes: 3,
            },
        ],
    },
    {
        authorKey: 'alexkim',
        title: 'When should I use BFS vs DFS for graph problems?',
        subject: 'Computer Science',
        tags: 'graphs,bfs,dfs,algorithms',
        body: `I know the mechanics of both BFS and DFS but I am never sure which one to use when I see a new graph problem. Is there a general rule of thumb, or does it just come from experience?`,
        answers: [
            {
                authorKey: 'arjunkumar',
                content: `There is a reliable heuristic that covers about 90% of cases:

Use BFS when:
- You need the shortest path (fewest edges) — BFS guarantees this; DFS does not.
- You need to explore level by level (minimum depth of binary tree, word ladder).
- The target is likely close to the source.

Use DFS when:
- You need to explore all paths or check reachability (cycle detection, connected components).
- You are working with topological sorting (DFS-based for DAGs).
- You need to backtrack (all permutations, maze solving).
- You need strongly connected components (Tarjan's / Kosaraju's algorithms).

Memory:
- BFS stores the frontier: O(width), up to O(n/2) for a balanced tree.
- DFS call stack: O(depth).
- Wide shallow graphs: prefer DFS. Deep narrow graphs: prefer BFS.

Interview tip: "shortest path" or "minimum steps" -> BFS. "Exists a path", "all paths", "cycles" -> DFS. Discussing both and their trade-offs shows strong reasoning.`,
                isAccepted: true,
                votes: 12,
            },
        ],
    },
    {
        authorKey: 'jamespark',
        title: "What's the difference between mass and weight in physics?",
        subject: 'Physics',
        tags: 'mechanics,fundamentals,mass,weight,gravity',
        body: `My teacher says mass and weight are different but everyone uses them interchangeably in everyday life. What is the actual distinction in physics and when does it matter in calculations?`,
        answers: [
            {
                authorKey: 'davidchen',
                content: `The clean distinction:

MASS:
- Scalar (just a number, no direction), measured in kg.
- A property of matter — how much "stuff" there is.
- Invariant: same on Earth, the Moon, or in deep space.
- Related to inertia: F = m*a means more mass = harder to accelerate.

WEIGHT:
- Vector (has direction — toward the gravitational source), measured in Newtons (N).
- The gravitational force: W = m*g.
- Location-dependent: on the Moon (g ≈ 1.62 m/s^2) you weigh about 1/6 of your Earth weight.

Why it matters in calculations:
- In F = m*a, use mass (kg) on the right-hand side.
- In free body diagrams, the downward force is weight = m*g (in Newtons).
- On an inclined plane, resolve weight m*g into components, not mass.

Common exam mistake: "the force due to gravity is 70 kg" — kg is mass. The force is 70 * 9.81 ≈ 686 N.

When everyday language collides with physics: "I weigh 70 kg" technically states mass. Physicists are pedantic; everyone else is not. Learn to switch modes for exams.`,
                isAccepted: true,
                votes: 9,
            },
        ],
    },
    {
        authorKey: 'alexkim',
        title: 'How does Git rebase differ from merge, and when should I use each?',
        subject: 'Computer Science',
        tags: 'git,version-control,rebase,merge',
        body: `I have been using git merge for everything but my internship mentor keeps telling me to use rebase instead. I understand merge creates a merge commit but I do not really understand what rebase does and what the trade-offs are.`,
        answers: [
            {
                authorKey: 'arjunkumar',
                content: `Setup: you are on branch "feature", which branched off "main" 3 commits ago. Meanwhile "main" has gotten 2 new commits.

git merge main (while on feature):
- Creates a merge commit with two parents: tip of feature + tip of main.
- Preserves exact history of both branches (non-linear graph).
- Safe: never rewrites history.

git rebase main (while on feature):
- Replays your feature commits on top of the current tip of main one by one.
- Your commits get new SHAs (technically new commits, same content).
- Result: linear history — looks like you always branched from the latest main.
- Rewrites history: NEVER rebase commits already pushed to a shared branch.

When to use merge: long-lived branches (feature -> main), when you want the true historical record, when collaborating on the same branch.

When to use rebase: keeping a local feature branch up-to-date before a PR, cleaning up messy commits with "git rebase -i" (interactive squashing), teams that prefer linear history.

The Golden Rule: never rebase a branch others have pulled. You will rewrite the SHAs they have, creating painful divergence.

Common workflow at most companies: rebase locally to stay current with main, then squash-and-merge when the PR lands.`,
                isAccepted: true,
                votes: 15,
            },
        ],
    },
    {
        authorKey: 'alexkim',
        title: 'How do I show a function is uniformly continuous but not Lipschitz?',
        subject: 'Mathematics',
        tags: 'real-analysis,continuity,uniform-continuity',
        body: `I need to find an example of a function on a bounded interval that is uniformly continuous but not Lipschitz continuous, and prove both properties. I think sqrt(x) might work but I am not sure how to prove it is not Lipschitz.`,
        answers: [
            {
                authorKey: 'davidchen',
                content: `f(x) = sqrt(x) on [0,1] is the canonical example.

Proving sqrt(x) is uniformly continuous on [0,1]:
[0,1] is compact and sqrt(x) is continuous on it, so uniform continuity follows from the Heine-Cantor theorem.

For an explicit delta: given epsilon > 0, let delta = epsilon^2.
If |x-y| < delta with x, y in [0,1]:
  |sqrt(x) - sqrt(y)| = |x-y|/(sqrt(x)+sqrt(y)) <= sqrt(|x-y|) < sqrt(delta) = epsilon. QED

Proving sqrt(x) is NOT Lipschitz on [0,1]:
Suppose |sqrt(x)-sqrt(y)| <= K|x-y| for all x,y in [0,1]. Set y=0:
  sqrt(x) <= K*x, so 1/sqrt(x) <= K for all x in (0,1].
But 1/sqrt(x) -> infinity as x -> 0+, contradicting K being finite. QED

Intuition: Lipschitz means the derivative is bounded. The derivative of sqrt(x) is 1/(2*sqrt(x)), which blows up at 0 — so it cannot be Lipschitz. But the function itself stays controlled, which is why the weaker condition of uniform continuity still holds.`,
                isAccepted: true,
                votes: 6,
            },
        ],
    },
    {
        authorKey: 'jamespark',
        title: 'Is there an intuitive way to understand the Fundamental Theorem of Calculus?',
        subject: 'Mathematics',
        tags: 'calculus,integration,differentiation,FTC',
        body: `I can apply the Fundamental Theorem of Calculus but I feel like I am just following steps without understanding why antiderivatives give the area under a curve. Can anyone give an intuitive explanation?`,
        answers: [
            {
                authorKey: 'davidchen',
                content: `Yes, and once you see this it becomes one of the most beautiful results in all of mathematics.

Define A(x) = integral from a to x of f(t) dt — the "area so far" function.

Ask: how fast is the area growing as x increases?

Moving from x to x+h (a tiny nudge), the extra area is approximately a thin rectangle:
  A(x+h) - A(x) ≈ f(x) * h

Therefore: [A(x+h) - A(x)] / h ≈ f(x). Taking h -> 0: A'(x) = f(x).

The area function's derivative is the original function. That is FTC Part 1.

FTC Part 2 (what you use for calculations):
If F is any antiderivative of f (F'=f), then integral from a to b of f = F(b) - F(a).

Why? Both A(x) and F(x) are antiderivatives of f, so they differ by a constant: A(x) = F(x) + C.
Since A(a) = 0 (area from a to a), C = -F(a), giving A(x) = F(x) - F(a).
At x=b: integral from a to b = F(b) - F(a). QED

The grand insight: integration and differentiation are inverse operations. The derivative of "area so far" is the height of the function — connecting the geometric idea of area to the algebraic operation of antidifferentiation.`,
                isAccepted: true,
                votes: 11,
            },
        ],
    },
];

const RESOURCES_DATA = [
    {
        authorKey: 'arjunkumar',
        title: 'Ultimate Data Structures Cheat Sheet',
        description: 'A comprehensive two-page reference covering arrays, linked lists, stacks, queues, heaps, hash tables, BSTs, and graphs. Includes time complexities for all operations, use-case guidance, and common interview pitfalls.',
        type: 'guide',
        price: 80,
        content: `# Data Structures Cheat Sheet

## Arrays
Access O(1) | Search O(n) | Insert/Delete O(n)
Dynamic arrays (Python list): amortized O(1) append.
Use when: index-based access needed, cache-friendly iteration.

## Linked Lists
Access O(n) | Insert/Delete at head O(1) | Search O(n)
Singly: pointer to next only. Doubly: prev + next pointers.
Use when: frequent insert/delete at ends, size unknown in advance.

## Stacks (LIFO)
Push/Pop/Peek O(1). Backed by array or linked list.
Use when: DFS, expression parsing, undo history, call stacks.

## Queues (FIFO)
Enqueue/Dequeue O(1) with circular buffer or linked list.
Priority Queue (Heap): O(log n) insert/extract-min.
Use when: BFS, task scheduling, sliding window maximum.

## Hash Tables
Average Insert/Delete/Search O(1). Worst case O(n) (all collisions).
Collision handling: chaining (linked lists) or open addressing.
Keep load factor below 0.7; rehash when exceeded.
Use when: O(1) lookup, counting frequencies, complement lookups.

## Binary Search Trees
Insert/Delete/Search O(h) where h = height.
Balanced BST (AVL, Red-Black): h = O(log n) guaranteed.
In-order traversal yields sorted output.
Use when: sorted data with dynamic insertions, range queries.

## Heaps
Insert O(log n) | Extract-min/max O(log n) | Peek O(1).
Heapify n elements: O(n) — NOT O(n log n)!
Use when: priority queue, k-th largest, Dijkstra's algorithm.

## Graphs
Adjacency list: O(V+E) space. Adjacency matrix: O(V^2) space.
BFS O(V+E): shortest path (unweighted edges).
DFS O(V+E): connectivity, cycle detection, topological sort.
Dijkstra O((V+E) log V): shortest path (non-negative weights).
Bellman-Ford O(VE): shortest path (negative weights allowed).

## Union-Find (DSU)
Find/Union O(alpha(n)) ≈ O(1) with path compression + union by rank.
Use when: connectivity queries, Kruskal's MST, cycle detection.

## Tries
Insert/Search O(L) where L = string length.
Use when: prefix matching, autocomplete, spell checking.`,
    },
    {
        authorKey: 'davidchen',
        title: 'A-Level & IB Mathematics Formula Book (Annotated)',
        description: 'Complete formula reference for A-Level Maths / IB HL Mathematics. Every formula includes a note on when to apply it. Covers Pure (calculus, algebra, series, trig), Statistics, and Mechanics.',
        type: 'notes',
        price: 50,
        content: `# Mathematics Formula Book (Annotated)

## Algebra & Series

Quadratic Formula: x = (-b +/- sqrt(b^2-4ac)) / 2a
Discriminant: b^2-4ac > 0 two real roots, = 0 one root, < 0 complex roots.

Binomial: (a+b)^n = sum_{k=0}^{n} C(n,k) a^{n-k} b^k
For |x|<1 and any real n, (1+x)^n = 1 + nx + n(n-1)/2! x^2 + ...

AP sum: S_n = n/2 * (2a + (n-1)d) = n/2 * (first + last)
GP sum: S_n = a(1-r^n)/(1-r). Infinite GP: S = a/(1-r) for |r| < 1.

## Calculus

Product Rule: (uv)' = u'v + uv'
Quotient Rule: (u/v)' = (u'v - uv') / v^2
Chain Rule: d/dx[f(g(x))] = f'(g(x)) * g'(x)
Integration by Parts: integral(u dv) = uv - integral(v du). Choose u via LIATE.

Key derivatives:
d/dx[x^n] = n x^{n-1}
d/dx[e^x] = e^x, d/dx[ln x] = 1/x
d/dx[sin x] = cos x, d/dx[cos x] = -sin x, d/dx[tan x] = sec^2 x

## Trigonometry

sin^2 + cos^2 = 1, 1 + tan^2 = sec^2, cot^2 + 1 = csc^2
Double angle: sin(2x) = 2 sin x cos x, cos(2x) = cos^2 x - sin^2 x = 1 - 2sin^2 x
Sine rule: a/sin A = b/sin B = c/sin C
Cosine rule: c^2 = a^2 + b^2 - 2ab cos C

## Statistics

E(X) = sum x P(X=x) discrete; E(X) = integral x f(x) dx continuous.
Var(X) = E(X^2) - [E(X)]^2.
Z-score: Z = (X - mu) / sigma. Standardised Normal N(0,1).
Binomial B(n,p): P(X=r) = C(n,r) p^r (1-p)^{n-r}. E=np, Var=np(1-p).
Poisson Po(lambda): P(X=r) = e^{-lambda} lambda^r / r!. E = Var = lambda.

## Mechanics (SUVAT)

v = u + at
s = ut + 0.5 a t^2
v^2 = u^2 + 2as
s = 0.5 (u+v) t

F = ma (vector). W = Fs cos theta. KE = 0.5 mv^2. GPE = mgh. P = Fv.
Impulse = Ft = delta(mv).`,
    },
    {
        authorKey: 'arjunkumar',
        title: 'System Design Interview Prep: 6 Core Patterns',
        description: 'Structured notes on the 6 most common system design patterns at top tech interviews: URL shortener, rate limiter, news feed, distributed cache, notification system, and ride-sharing. Each includes a full design walk-through and scaling strategy.',
        type: 'guide',
        price: 120,
        content: `# System Design Interview: 6 Core Patterns

## How to Structure Any Answer

1. Clarify requirements (functional + non-functional, scale estimates)
2. Capacity estimation (storage, bandwidth, QPS)
3. High-level design (core components, data flow diagram)
4. Deep dive into 1-2 challenging components
5. Bottlenecks and scaling strategies

## Pattern 1: URL Shortener

Core challenge: generate short unique codes, redirect fast.
Schema: id, long_url, short_code, created_at, expires_at, user_id
Code generation: random 6-char base62 gives 62^6 ≈ 56 billion unique codes.
Caching: read-heavy — cache short_code->long_url in Redis with TTL.
Scale: stateless redirect service scales horizontally. Use Snowflake IDs for distributed unique code generation.

## Pattern 2: Rate Limiter

Token bucket: smooth bursts, constant refill rate.
Sliding window counter: O(1) memory, slight inaccuracy at window boundaries.
Implementation: Redis INCR + EXPIRE, or atomic Lua script for distributed systems.
Place at: API gateway level.

## Pattern 3: News Feed

Fan-out on write: push post to all followers' feeds on creation. Fast read, slow write, fails for celebrities.
Fan-out on read: fetch posts from followed accounts on load. Fast write, slow read.
Hybrid: push to regular users, pull for celebrities. Cache feeds in Redis Sorted Set (score = timestamp).

## Pattern 4: Distributed Cache

Eviction policies: LRU (most common), LFU, FIFO.
Cache-aside: app checks cache -> miss -> reads DB -> writes cache.
Write-through: app writes cache -> cache synchronously writes DB.
Consistent hashing: distributes keys across nodes, minimises remapping when topology changes.

## Pattern 5: Notification System

Pipeline: notification service -> message queue -> per-channel workers (push/email/SMS) -> providers.
Why queue: decouples producer and consumer, enables backpressure and retry.
Retry: exponential backoff with jitter. Dead letter queue after N failures.

## Pattern 6: Ride-Sharing

Location service: drivers send GPS every 4s -> Redis GEOADD. Rider request -> GEORADIUS for nearby drivers.
Matching: candidates -> filter availability -> rank by ETA.
Trip state machine: REQUESTED -> ACCEPTED -> PICKUP -> IN_PROGRESS -> COMPLETED.
Scale: shard location writes by geohash. WebSockets for real-time position updates.`,
    },
    {
        authorKey: 'davidchen',
        title: 'Proof Writing Templates for Real Analysis',
        description: 'Fill-in templates for the 12 most common proof structures in real analysis: epsilon-delta limits, continuity, uniform continuity, sequence convergence, Cauchy sequences, and compactness. Ideal for exam prep.',
        type: 'template',
        price: 40,
        content: `# Proof Writing Templates for Real Analysis

## Template 1: Epsilon-Delta Limit

Goal: prove lim_{x->a} f(x) = L.

Scratchwork: compute |f(x)-L| in terms of |x-a|. Find delta expression.

Let epsilon > 0. Choose delta = [expression in epsilon, possibly min(1,...)].
Suppose 0 < |x-a| < delta.
[If preliminary constraint: since delta<=1, |x-a|<1 gives [bound on extra factor].]
Then: |f(x)-L| = [algebra] <= [apply delta] < epsilon. QED

## Template 2: Sequence Convergence

Goal: prove a_n -> L as n -> infinity.

Let epsilon > 0. Choose N = ceil([expression in epsilon]).
Let n > N. Then: |a_n - L| = [algebra] < epsilon. QED

## Template 3: Uniform Continuity

Goal: prove f is uniformly continuous on D.

Let epsilon > 0. Choose delta = [expression in epsilon, INDEPENDENT of x and y].
Let x, y in D with |x-y| < delta.
Then: |f(x)-f(y)| = [algebra] <= [bound] < epsilon. QED

## Template 4: NOT Lipschitz

Suppose for contradiction |f(x)-f(y)| <= K|x-y| for all x, y in D.
Set y = [a]: rearrange to get [expression] <= K for all x in D.
But [expression] -> infinity as x -> [limit], contradicting K finite. QED

## Template 5: Cauchy Sequence

Let epsilon > 0. Choose N = ceil([expression]).
Let m, n > N. Then:
  |a_m - a_n| <= [telescoping sum] <= [geometric bound] < epsilon. QED

## Template 6: Compactness (Sequential)

Let (x_n) be any sequence in K.
[Show bounded — use K bounded.]
By Bolzano-Weierstrass, (x_n) has convergent subsequence (x_{n_k}).
Since K is closed and x_{n_k} -> x, we have x in K. QED

## Scratchwork Toolkit

Factor-and-bound: |f(x)-f(y)| = |x-y||g(x,y)| — use preliminary constraint to bound |g|.
Triangle inequality: |a-c| <= |a-b| + |b-c|.
Geometric sum: sum_{k=n}^inf r^k = r^n/(1-r) for |r|<1.
MVT bound: |f(x)-f(y)| <= sup|f'| * |x-y| — gives Lipschitz when f' is bounded.`,
    },
    {
        authorKey: 'alexkim',
        title: 'LeetCode Patterns: 10 Problem-Solving Templates',
        description: 'Identify the pattern, apply the template. Covers: two pointers, sliding window, binary search on answer, BFS, DFS with backtracking, 1D and 2D DP, monotonic stack, union-find, and topological sort. Each includes a worked example.',
        type: 'notes',
        price: 90,
        content: `# LeetCode Patterns: 10 Problem-Solving Templates

## 1. Two Pointers

When: sorted array, pair with target sum, remove duplicates in-place.

  left, right = 0, len(arr)-1
  while left < right:
      s = arr[left] + arr[right]
      if s == target: return [left, right]
      elif s < target: left += 1
      else: right -= 1

## 2. Sliding Window

When: subarray/substring with constraint (max sum, no duplicate chars).

  left = 0
  for right in range(len(arr)):
      window.add(arr[right])
      while window_invalid: window.remove(arr[left]); left += 1
      best = max(best, right - left + 1)

## 3. Binary Search on Answer

When: "Find minimum X such that condition(X) holds."

  lo, hi = min_val, max_val
  while lo < hi:
      mid = (lo + hi) // 2
      if condition(mid): hi = mid
      else: lo = mid + 1
  return lo

## 4. BFS (Shortest Path)

  from collections import deque
  q = deque([(start, 0)]); seen = {start}
  while q:
      node, d = q.popleft()
      if node == target: return d
      for nb in graph[node]:
          if nb not in seen: seen.add(nb); q.append((nb, d+1))

## 5. DFS with Backtracking

  def bt(start, cur):
      if base_case: result.append(cur[:]); return
      for i in range(start, len(opts)):
          cur.append(opts[i]); bt(i+1, cur); cur.pop()

## 6. 1D Dynamic Programming

  dp = [base] * (n+1)
  for i in range(1, n+1): dp[i] = recurrence(dp[i-1], dp[i-2])
  return dp[n]

## 7. 2D DP (Grid / String)

  dp = [[0]*(m+1) for _ in range(n+1)]
  for i in range(1, n+1):
      for j in range(1, m+1):
          dp[i][j] = dp[i-1][j-1]+1 if match else max(dp[i-1][j], dp[i][j-1])

## 8. Monotonic Stack

  stack = []
  for i, v in enumerate(arr):
      while stack and arr[stack[-1]] < v:
          idx = stack.pop()  # next greater of arr[idx] is v
      stack.append(i)

## 9. Union-Find

  par = list(range(n)); rnk = [0]*n
  def find(x):
      while par[x]!=x: par[x]=par[par[x]]; x=par[x]
      return x
  def union(x,y):
      px,py=find(x),find(y)
      if px==py: return False
      if rnk[px]<rnk[py]: px,py=py,px
      par[py]=px
      if rnk[px]==rnk[py]: rnk[px]+=1
      return True

## 10. Topological Sort (Kahn's)

  indeg = [0]*n
  for u,v in edges: indeg[v]+=1
  q = deque(i for i in range(n) if indeg[i]==0)
  order = []
  while q:
      node=q.popleft(); order.append(node)
      for nb in g[node]:
          indeg[nb]-=1
          if indeg[nb]==0: q.append(nb)
  return order if len(order)==n else []  # empty = cycle`,
    },
];

const POSTS_DATA = [
    {
        authorKey: 'arjunkumar',
        type: 'advice',
        title: 'How I Went from Failing Second Year to a Job Offer at a Top Fintech',
        likes: 47,
        content: `Second year of my CS degree was the worst year of my life. I failed my algorithms module. I failed my databases module. I was close to dropping out.

Three years later I had a job offer from a company I had dreamed of working at. Here is what actually changed.

The mindset shift: I stopped treating university as a hoop to jump through and started treating it as deliberate skill-building. Old thinking: "I need to pass this exam." New thinking: "I need to actually understand this — because I will use it at a job in 18 months." That shift made studying feel like training, not punishment.

What I did differently:

I stopped re-reading notes. It feels productive. It is not. Re-reading gives you the illusion of understanding. Instead: close your notes, open a blank page, reconstruct everything from memory. What you cannot reconstruct is what you do not know. Do this daily.

I found a study group — not to share notes, but to teach each other. The rule: if you cannot explain it to someone else, you do not understand it. Teaching forces precision, which exposes gaps you did not know you had.

I started side projects earlier than my course required. I built a basic web app in the Christmas break of second year — a to-do list with a real database. By the time we covered databases in third year, I had hands-on intuition my classmates were still building abstractly.

I reached out to an alumni mentor. She was one year ahead, had just done internship recruiting, and could tell me exactly what interviewers asked and what I was wasting time on. Find someone 1-2 years ahead. They remember what it felt like.

On failure: failing those modules was not the problem. Spending six months feeling sorry for myself was. Failure is information — it shows exactly where your understanding breaks down. The question is what you do with that.

You have more capacity than you think. Most people who "cannot do" something have not yet found the right explanation, the right angle, or the right reason to care. Go find it.`,
    },
    {
        authorKey: 'davidchen',
        type: 'advice',
        title: '10 Things I Wish Someone Told Me Before Starting a Maths Degree',
        likes: 62,
        content: `I spent the first term of my mathematics degree completely lost — not because the content was beyond me, but because nobody had warned me how different university mathematics is from everything that came before.

1. Proofs are the whole game. A-level is about calculation. University maths is about proving calculations work. The transition is brutal and fast. Start practising proof writing immediately. "How to Prove It" by Velleman is the book I recommend.

2. Your intuition will mislead you. Many true theorems are deeply counterintuitive. The rationals have measure zero. There are as many points in a line segment as in all of R^3. A continuous function can be nowhere differentiable. Train yourself to demand proof.

3. Read before lectures, not after. Lecturers cover in 50 minutes what textbooks take 20 pages to explain. Go in having read the chapter — even if you understood nothing — and the lecture will clarify the structure.

4. The library has better books than your lecture notes. Rudin for analysis. Axler's "Linear Algebra Done Right." Find the book that explains things the way your brain works.

5. Attempt every problem sheet yourself before solutions. Struggling for two hours and then seeing the solution teaches you more than reading the solution cold. Struggle is the mechanism of learning.

6. Definitions are everything. For every new definition: read a worked example, construct your own example, try to construct a counter-example. This is how you build the mental model proofs depend on.

7. Talk to your lecturers. They have office hours. They are almost always delighted when a student comes with a genuine question.

8. Understanding in mathematics often comes in a flash after a long period of confusion. Keep accumulating confusion — the flash will come.

9. Find your tribe early: 3-5 people as serious as you. Do problem sheets together after attempting them independently. Argue about proofs. Quiz each other.

10. The hardest thing is not the mathematics. It is tolerating not knowing. A-level gives you the answer at the back. Real mathematics has no answer key. You are training to sit with an open problem and not give up.`,
    },
    {
        authorKey: 'alexkim',
        type: 'blog',
        title: "I Built a Side Project Every Month for a Year — Here's What I Learned",
        likes: 34,
        content: `January 2024: I committed to building and shipping one side project per month for twelve months. Every one had to be live by the last day of the month. No graveyard projects.

What I built: habit tracker, Git commit summariser (CLI + LLM), multiplayer quiz game (WebSockets), browser extension for arXiv, recipe generator from fridge contents (OpenAI API), URL shortener from scratch, Pomodoro timer with ambient sounds, maths flashcard app with spaced repetition, personal stats dashboard, cover letter generator, collaborative whiteboard with real-time sync, and a search engine over my own note archive.

What I actually learned:

Finishing is a skill. It requires scoping ruthlessly, cutting scope again when you are behind, and shipping 80% of what you imagined rather than 100% of nothing. That skill compounds.

Deployment anxiety is mostly irrational. After a year: nobody cares enough to judge you. Ship it.

The projects I failed taught me the most. I failed the constraint in three months. Each traced back to the same mistake: building something I thought was cool rather than solving a problem I actually cared about.

Tooling choices compound. After month three I stopped debating what stack to use and started every project with the same one. Saved 4-6 hours per project. Use boring technology for side projects.

The best projects came from real problems. The ones I still use daily all solved something I personally needed.

The number that surprised me most: I got my first engineering job offer in April — four months in. The recruiter found me through a LinkedIn post about the multiplayer quiz game. Not because it was technically impressive, but because I could articulate clearly what problems I encountered and how I solved them. Building in public is an underrated job search strategy.`,
    },
    {
        authorKey: 'jamespark',
        type: 'blog',
        title: 'My First Month Studying Physics at University (Honest Account)',
        likes: 28,
        content: `I thought I was ready for university physics. I got an A* in A-level Physics. I had done extra reading over the summer. I was wrong about how prepared I was.

Week 1: The first lecture opened with Lagrangian mechanics. I did not know what a Lagrangian was. Neither had most of the room — but a few people in the front row were nodding. I learned two things: some peers had more prior exposure; and the gap was entirely closeable with work. The front-row nodders were not smarter. They just had a head start.

Week 2: University physics is mostly applied mathematics. Partial derivatives, dot products, cross products, differential equations — assumed knowledge. My maths was fine but rusty from six months without it. I started 30 minutes of maths review every morning. Not new material — drilling back to fluency. This was probably the most important thing I did in the first month.

Week 3: The first mechanics problem sheet took me seven hours. Seven hours for eight questions. I panicked. Then I checked the forums: everyone had taken four to eight hours. This was just what university problem sheets take.

Week 4: Conservation of momentum and energy — territory I knew from A-level. The lecture felt like a conversation instead of a performance I was watching from the back. I answered a question and got it right. That one moment recalibrated everything. The earlier confusion was not a sign I was in the wrong place. It was a sign I was in the right place and working at the edge of my ability.

What I would tell my pre-university self: review your maths before you arrive, not your physics. Do not compare your internal experience (confused, working hard) to others' external presentation (calm, apparently effortless). The calibration period is normal. It ends. Give it a month.`,
    },
    {
        authorKey: 'saramen',
        type: 'advice',
        title: 'How to Actually Prepare for a Mathematics Oral Examination',
        likes: 19,
        content: `Some of the most terrifying words a mathematics student can hear: "Your final assessment will be an oral examination."

I had one in second year for Real Analysis. Here is how I prepared, what went wrong, and what I would do differently.

What an oral exam actually tests: the examiner can follow up, ask you to justify every step, ask for a plain-English explanation, or ask "what if we changed this assumption?" You cannot memorise a proof and regurgitate it — the first follow-up question will expose whether it was real understanding or not.

Preparation:

Make a question bank for every major result. For each theorem: what does it say in plain English? Why do we need each assumption? What are the main techniques in the proof? What is a simple example? What breaks if you drop each assumption?

Explain out loud to someone who will ask "why?" at every step. I studied with a friend and we took turns explaining proofs with the listener asking questions. Brutally effective at finding gaps.

Practice proving things from scratch with no scaffolding. Pick a result, close your notes, and prove it from the definitions. If you cannot, you need to study more.

Prepare "what if?" variants: what if f is only continuous, not differentiable? What if the interval is open? What if we remove the boundedness condition? Think through how each assumption is used in every proof you know.

What went wrong: I knew the proofs but jumped to symbols without explaining what I was doing. The examiner stopped me twice: "Before you write that, tell me what you are trying to do." After the exam she said: "Your technical work was fine. Work on explaining your reasoning in words before equations."

One week before: read summaries, not full notes. Talk through each major result out loud. Do mock explanations under time pressure. Sleep.

The oral rewards the student who has really thought about the material. Deep engagement beats passive review every time.`,
    },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────

async function seed() {
    try {
        await db.sequelize.authenticate();

        // Add columns that exist in models but may be missing from the DB
        // (server's sync() only creates new tables, not new columns on existing ones)
        const addIfMissing = async (table, column, definition) => {
            const [rows] = await db.sequelize.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                { replacements: [table, column] }
            );
            if (rows.length === 0) {
                await db.sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                console.log(`  migrated: ${table}.${column}`);
            }
        };
        await addIfMissing('WikiArticles', 'tags', 'TEXT NULL');
        await addIfMissing('Questions',    'tags', 'TEXT NULL');

        console.log('Connected to database.\n');

        // ── Users ──────────────────────────────────────────────────────────
        if (!CONTENT_ONLY) {
            console.log('Creating users...');
            let created = 0, skipped = 0;
            for (const u of USERS) {
                const exists = await db.Users.findOne({ where: { email: u.email } });
                if (exists) {
                    console.log(`  skip   ${u.email}`);
                    skipped++;
                    continue;
                }
                const { password, ...rest } = u;
                const hashedPassword = await bcrypt.hash(password, 10);
                await db.Users.create({ ...rest, password: hashedPassword, isVerified: true });
                console.log(`  create ${u.email}  [${u.role}]`);
                created++;
            }
            console.log(`  Done: created=${created}, skipped=${skipped}\n`);
        }

        // Build a username -> User map for content seeding
        const userMap = {};
        for (const u of USERS) {
            const user = await db.Users.findOne({ where: { email: u.email } });
            if (user) userMap[u.username] = user;
        }

        // ── Wiki Articles ──────────────────────────────────────────────────
        console.log('Creating wiki articles...');
        for (const art of WIKI_ARTICLES) {
            const author = userMap[art.authorKey];
            if (!author) { console.warn(`  WARN  unknown author: ${art.authorKey}`); continue; }
            const exists = await WikiArticles.findOne({ where: { title: art.title } });
            if (exists) { console.log(`  skip   "${art.title}"`); continue; }
            const article = await WikiArticles.create({
                title: art.title, content: art.content, subject: art.subject,
                tags: art.tags, authorId: author.id,
                views: Math.floor(Math.random() * 200) + 10,
            });
            await safeIndex('wiki', article.id);
            console.log(`  create "${art.title}"`);
        }
        console.log();

        // ── Q&A ────────────────────────────────────────────────────────────
        console.log('Creating Q&A questions and answers...');
        for (const qa of QA_DATA) {
            const author = userMap[qa.authorKey];
            if (!author) { console.warn(`  WARN  unknown author: ${qa.authorKey}`); continue; }
            const exists = await Questions.findOne({ where: { title: qa.title } });
            if (exists) { console.log(`  skip   "${qa.title}"`); continue; }
            const question = await Questions.create({
                title: qa.title, body: qa.body, subject: qa.subject,
                tags: qa.tags, authorId: author.id,
            });
            let hasAccepted = false;
            for (const a of qa.answers) {
                const ansAuthor = userMap[a.authorKey];
                if (!ansAuthor) continue;
                const answer = await Answers.create({
                    content: a.content, questionId: question.id,
                    authorId: ansAuthor.id, isAccepted: a.isAccepted, votes: a.votes || 0,
                });
                if (a.isAccepted) hasAccepted = true;
                await safeIndex('answer', answer.id);
            }
            if (hasAccepted) await question.update({ isAnswered: true });
            await safeIndex('question', question.id);
            console.log(`  create "${qa.title}" (${qa.answers.length} answer${qa.answers.length !== 1 ? 's' : ''})`);
        }
        console.log();

        // ── Marketplace Resources ──────────────────────────────────────────
        console.log('Creating marketplace resources...');
        for (const res of RESOURCES_DATA) {
            const author = userMap[res.authorKey];
            if (!author) { console.warn(`  WARN  unknown author: ${res.authorKey}`); continue; }
            const exists = await Resources.findOne({ where: { title: res.title } });
            if (exists) { console.log(`  skip   "${res.title}"`); continue; }
            const resource = await Resources.create({
                title: res.title, description: res.description, content: res.content,
                price: res.price, type: res.type, authorId: author.id,
                downloads: Math.floor(Math.random() * 60) + 5,
            });
            await safeIndex('resource', resource.id);
            console.log(`  create "${res.title}" (${res.price} XP, ${res.type})`);
        }
        console.log();

        // ── Posts ──────────────────────────────────────────────────────────
        console.log('Creating posts...');
        for (const post of POSTS_DATA) {
            const author = userMap[post.authorKey];
            if (!author) { console.warn(`  WARN  unknown author: ${post.authorKey}`); continue; }
            const exists = await Posts.findOne({ where: { title: post.title } });
            if (exists) { console.log(`  skip   "${post.title}"`); continue; }
            const created = await Posts.create({
                title: post.title, content: post.content,
                type: post.type, authorId: author.id, likes: post.likes || 0,
            });
            await safeIndex('post', created.id);
            console.log(`  create "${post.title}" (${post.type})`);
        }
        console.log();

        // ── Summary ────────────────────────────────────────────────────────
        const [wCount, qCount, aCount, rCount, pCount] = await Promise.all([
            WikiArticles.count(), Questions.count(), Answers.count(),
            Resources.count(), Posts.count(),
        ]);

        console.log('===========================================');
        console.log('Seed complete!\n');
        console.log('  Test accounts (password: password123):');
        console.log('    student1@test.com   student');
        console.log('    student2@test.com   student');
        console.log('    student3@test.com   student');
        console.log('    alumni1@test.com    alumni');
        console.log('    alumni2@test.com    alumni');
        console.log('    alumni3@test.com    alumni');
        console.log('    admin@test.com      admin  (password: admin123)');
        console.log();
        console.log(`  Wiki articles : ${wCount}`);
        console.log(`  Questions     : ${qCount}`);
        console.log(`  Answers       : ${aCount}`);
        console.log(`  Resources     : ${rCount}`);
        console.log(`  Posts         : ${pCount}`);
        console.log('===========================================');
        if (SKIP_EMBEDDINGS) {
            console.log('\nEmbeddings were skipped. To index this content for RAG, start the');
            console.log('server and send: POST /ai/reindex  (requires valid OPENAI_API_KEY)');
        }
    } catch (err) {
        console.error('Seed failed:', err.message);
        console.error(err.stack);
    } finally {
        await db.sequelize.close();
    }
}

seed();
