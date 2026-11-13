// Test runner that never answers and keeps a descendant alive, to prove the deadline kills the tree.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
process.once('message', (job) => {
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  if (job.args?.pidFile) writeFileSync(job.args.pidFile, String(grandchild.pid));
  setInterval(() => {}, 1000);
});
