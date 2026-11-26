/**
 * Runs one job in a child process and kills it, with everything it started, when the deadline passes.
 *
 * Why a process and not a `worker_thread`: `convert()` runs Pandoc, which runs the diagram bridge, and
 * a thread cannot take those grandchildren down with it. The child is its own process group on POSIX
 * (`detached`), so `kill(-pid)` reaches Pandoc and the bridge too; on Windows `taskkill /T` does.
 *
 * Security (AGENTS.md rule 4): the child is started with an argument array; the job travels over the
 * IPC channel as data, never on a command line.
 */

import { fork, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_RUNNER = fileURLToPath(new URL('./job-runner.mjs', import.meta.url));
const MAX_STDERR = 16 * 1024;

/** The job did not finish before its deadline; the child and its descendants were killed. */
export class JobTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`timed out after ${timeoutMs} ms (the work was killed)`);
    this.name = 'JobTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** The job ran and failed, or the child died without answering. `kind` is the original error's name. */
export class JobFailedError extends Error {
  constructor(kind, message, stderr) {
    super(message);
    this.name = 'JobFailedError';
    this.kind = kind;
    this.stderr = stderr;
  }
}

/** Kill `child` and its descendants; `done` runs once the kill has been carried out. */
function killTree(child, done = () => {}) {
  const pid = child.pid;
  if (pid === undefined) {
    done();
    return;
  }
  if (process.platform === 'win32') {
    // taskkill /F returns once the processes are terminated; it takes a few hundred ms to start, cold.
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {
      // Best effort: the process may already be gone; nothing to report either way.
      done();
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The group is already gone (the job finished between the deadline and the kill): nothing to kill.
  }
  done();
}

/**
 * @param {{ tool: string, args: object }} job
 * @param {{ timeoutMs: number, runnerPath?: string }} options
 * @returns {Promise<unknown>} the runner's result
 * @throws {JobTimeoutError | JobFailedError}
 */
export function runJob(job, { timeoutMs, runnerPath = DEFAULT_RUNNER }) {
  return new Promise((resolve, reject) => {
    const child = fork(runnerPath, [], {
      detached: process.platform !== 'win32',
      execArgv: ['--max-old-space-size=1024'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8');
    });
    let settled = false;
    let timedOut = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      // Answer once the tree is gone, so "the work was killed" is true when the caller hears it. Until
      // then, the worker's own exit (caused by the kill) or a late answer must not settle the call.
      killTree(child, () => finish(reject, new JobTimeoutError(timeoutMs)));
    }, timeoutMs);
    child.on('message', (msg) => {
      if (timedOut) return;
      // The answer is in; the group is killed so nothing the job left behind outlives it.
      killTree(child);
      if (msg && msg.ok) finish(resolve, msg.result);
      else finish(reject, new JobFailedError(msg?.name ?? 'Error', msg?.message ?? 'job failed', stderr));
    });
    child.on('error', (err) => {
      if (!timedOut) finish(reject, new JobFailedError(err.name, err.message, stderr));
    });
    child.on('exit', (code, signal) => {
      if (timedOut) return;
      finish(reject, new JobFailedError('Error', `worker exited without an answer (${signal ?? code})`, stderr));
    });
    child.send(job);
  });
}
