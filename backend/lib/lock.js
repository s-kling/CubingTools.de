import fs from 'fs';

/** Single-instance guard via an exclusive lock file; stale locks (dead pid) are taken over. */
export function acquireLock(file) {
    const tryCreate = () => {
        fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
        const release = () => {
            try {
                if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.unlinkSync(file);
            } catch {
                /* already gone */
            }
        };
        process.on('exit', release);
        return release;
    };
    try {
        return tryCreate();
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        const pid = Number(fs.readFileSync(file, 'utf8'));
        let alive = true;
        try {
            process.kill(pid, 0);
        } catch (e) {
            alive = e.code === 'EPERM';
        }
        if (alive) throw new Error(`another jobs process is running (pid ${pid}); lock file ${file}`);
        fs.unlinkSync(file);
        return tryCreate();
    }
}
