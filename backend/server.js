/**
 * Launcher: starts the three roles as separate OS processes and keeps them alive.
 *
 *   web   (page serving, N workers)   -> :PORT          (config prod_port / beta_port)
 *   logic (API, N workers)            -> :LOGIC_PORT     (127.0.0.1 only by default)
 *   jobs  (WCA import + newsletter)   -> no port, exactly one instance
 *
 * Usage:  node backend/server.js [--beta] [--debug] [--only=web,logic,jobs]
 * Each role can also be started on its own (backend/web/server.js, backend/logic/server.js,
 * backend/jobs/index.js), e.g. under separate systemd units or containers.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const forward = process.argv.slice(2).filter((a) => !a.startsWith('--only='));
const only = (process.argv.find((a) => a.startsWith('--only=')) || '--only=web,logic,jobs').slice(7).split(',');

const ROLES = { web: 'web/server.js', logic: 'logic/server.js', jobs: 'jobs/index.js' };
const children = new Map();
let stopping = false;

function start(role, delay = 500) {
    const child = spawn(process.execPath, [path.join(here, ROLES[role]), ...forward], { stdio: 'inherit' });
    children.set(role, child);
    const started = Date.now();
    child.on('exit', (code, signal) => {
        children.delete(role);
        if (stopping) return;
        const lived = Date.now() - started;
        const next = lived > 60_000 ? 500 : Math.min(delay * 2, 30_000);
        console.error(`[launcher] ${role} exited (code=${code}, signal=${signal}); restarting in ${next}ms`);
        setTimeout(() => start(role, next), next);
    });
}

for (const role of only) {
    if (!ROLES[role]) {
        console.error(`unknown role "${role}"`);
        process.exit(2);
    }
    start(role);
}

const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const c of children.values()) c.kill('SIGTERM');
    setTimeout(() => process.exit(0), 12_000).unref();
    const t = setInterval(() => children.size === 0 && process.exit(0), 200);
    t.unref?.();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
