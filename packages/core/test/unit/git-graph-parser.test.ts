import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitGraphDiagram } from '../../src/diagrams/git-graph/parser.js';

const BASIC = `gitGraph
  commit
  commit
  branch develop
  commit
  checkout main
  commit
  merge develop`;

test('main branch exists by default, first in creation order, colorIndex 0', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit');
  assert.equal(ast.branches.length, 1);
  assert.equal(ast.branches[0]?.name, 'main');
  assert.equal(ast.branches[0]?.colorIndex, 0);
});

test('auto-generated commit ids are unique and stable in declaration order', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit\n  commit\n  commit');
  assert.equal(ast.commits.length, 3);
  const ids = ast.commits.map((c) => c.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ast.commits.map((c) => c.seq), [0, 1, 2]);
});

test('a custom commit id/type/tag is captured', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit id: "Alpha" type: HIGHLIGHT tag: "v1.0.0"');
  const c = ast.commits[0]!;
  assert.equal(c.id, 'Alpha');
  assert.equal(c.type, 'HIGHLIGHT');
  assert.equal(c.tag, 'v1.0.0');
});

test('REVERSE and an unrecognized type both resolve correctly (unrecognized falls back to NORMAL)', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit type: REVERSE\n  commit type: BOGUS');
  assert.equal(ast.commits[0]?.type, 'REVERSE');
  assert.equal(ast.commits[1]?.type, 'NORMAL');
});

test('branch creates a new branch and switches to it; subsequent commits land there', () => {
  const { ast } = parseGitGraphDiagram(BASIC);
  assert.equal(ast.branches.map((b) => b.name).includes('develop'), true);
  const develop = ast.commits.find((c) => c.branch === 'develop');
  assert.ok(develop);
  assert.equal(develop!.parents.length, 1);
});

test('checkout switches the current branch back', () => {
  const { ast } = parseGitGraphDiagram(BASIC);
  const mainCommits = ast.commits.filter((c) => c.branch === 'main');
  assert.equal(mainCommits.length, 4); // 2 initial + the merge commit + 1 more, all on main
});

test('merge produces a commit with two parents and default MERGE type', () => {
  const { ast } = parseGitGraphDiagram(BASIC);
  const merge = ast.commits[ast.commits.length - 1]!;
  assert.equal(merge.parents.length, 2);
  assert.equal(merge.type, 'MERGE');
});

test('merge with an explicit type override does not use the default MERGE shape', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev type: REVERSE');
  const merge = ast.commits[ast.commits.length - 1]!;
  assert.equal(merge.type, 'REVERSE');
});

test('merge onto an unknown branch is ignored with a warning', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  merge ghost');
  assert.equal(ast.commits.length, 1);
  assert.ok(warnings.some((w) => w.includes('unknown branch')));
});

test('merging a branch with itself is ignored with a warning', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  merge main');
  assert.equal(ast.commits.length, 1);
  assert.ok(warnings.some((w) => w.includes('itself')));
});

test('cherry-pick creates a new commit referencing the source id, with a fresh auto id', () => {
  const { ast } = parseGitGraphDiagram(
    'gitGraph\n  commit id: "ZERO"\n  branch dev\n  commit id: "B"\n  checkout main\n  cherry-pick id:"B"',
  );
  const cp = ast.commits[ast.commits.length - 1]!;
  assert.equal(cp.cherryPickFrom, 'B');
  assert.notEqual(cp.id, 'B');
  assert.equal(cp.branch, 'main');
});

test('cherry-pick with an unknown source id is ignored with a warning', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  cherry-pick id: "ghost"');
  assert.equal(ast.commits.length, 1);
  assert.ok(warnings.some((w) => w.includes('unknown source commit')));
});

test('branch order: N sorts explicit-order branches ascending, after all no-order branches, main always first', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit\n  branch test1 order: 3\n  branch test2 order: 2\n  branch test3 order: 1');
  assert.deepEqual(
    ast.branches.map((b) => b.name),
    ['main', 'test3', 'test2', 'test1'],
  );
});

test('branches without an explicit order keep their appearance order, before any explicit-order branch', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit\n  branch test2\n  branch test3\n  branch test4 order: 1');
  assert.deepEqual(
    ast.branches.map((b) => b.name),
    ['main', 'test2', 'test3', 'test4'],
  );
});

test('a quoted branch name (keyword-shaped) round-trips correctly', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  commit\n  branch "cherry-pick"\n  commit');
  assert.equal(ast.branches[1]?.name, 'cherry-pick');
  assert.equal(ast.commits[1]?.branch, 'cherry-pick');
});

test('re-declaring an existing branch name is ignored (with a warning) but still switches to it', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  branch dev\n  checkout main\n  branch dev\n  commit');
  assert.equal(ast.branches.length, 2);
  assert.equal(ast.commits[ast.commits.length - 1]?.branch, 'dev');
  assert.ok(warnings.some((w) => w.includes('already exists')));
});

test('checkout to an unknown branch is ignored with a warning, current branch unchanged', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  checkout ghost\n  commit');
  assert.ok(ast.commits.every((c) => c.branch === 'main'));
  assert.ok(warnings.some((w) => w.includes('Unknown branch')));
});

test('orientation defaults to LR, and LR:/TB:/BT: headers are all recognized', () => {
  assert.equal(parseGitGraphDiagram('gitGraph\n  commit').ast.orientation, 'LR');
  assert.equal(parseGitGraphDiagram('gitGraph LR:\n  commit').ast.orientation, 'LR');
  assert.equal(parseGitGraphDiagram('gitGraph TB:\n  commit').ast.orientation, 'TB');
  assert.equal(parseGitGraphDiagram('gitGraph BT:\n  commit').ast.orientation, 'BT');
});

test('title is parsed', () => {
  const { ast } = parseGitGraphDiagram('gitGraph\n  title My Repo History\n  commit');
  assert.equal(ast.title, 'My Repo History');
});

test('a duplicate custom commit id is auto-renamed with a warning', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit id: "A"\n  commit id: "A"');
  assert.equal(ast.commits[0]?.id, 'A');
  assert.notEqual(ast.commits[1]?.id, 'A');
  assert.ok(warnings.some((w) => w.includes('Duplicate commit id')));
});

test('an unsupported line is skipped with a warning, not thrown', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  commit\n  this is not a real statement');
  assert.equal(ast.commits.length, 1);
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored')));
});

test('a %% comment line is ignored', () => {
  const { ast, warnings } = parseGitGraphDiagram('gitGraph\n  %% a comment\n  commit');
  assert.equal(ast.commits.length, 1);
  assert.equal(warnings.length, 0);
});
