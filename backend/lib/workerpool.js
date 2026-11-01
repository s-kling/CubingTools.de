import { Worker } from 'worker_threads';

/**
 * Small fixed-size worker_threads pool for CPU-bound or synchronous-SQLite work.
 * Jobs are queued FIFO with a bounded queue so overload turns into fast 503s instead of
 * unbounded latency. A crashed worker is replaced and its in-flight job is rejected.
 */
export class WorkerPool {
    constructor(file, { size = 2, maxQueue = 64, workerData = undefined } = {}) {
        this.file = file;
        this.size = size;
        this.maxQueue = maxQueue;
        this.workerData = workerData;
        this.idle = [];
        this.queue = [];
        this.active = new Map(); // worker -> job
        this.seq = 0;
        this.closed = false;
        for (let i = 0; i < size; i++) this._spawn();
    }

    _spawn() {
        const w = new Worker(this.file, { workerData: this.workerData });
        w.on('message', (m) => {
            const job = this.active.get(w);
            if (!job || m.id !== job.id) return;
            this.active.delete(w);
            m.error ? job.reject(Object.assign(new Error(m.error), { remoteStack: m.stack })) : job.resolve(m.result);
            this._release(w);
        });
        w.on('error', (err) => this._fail(w, err));
        w.on('exit', (code) => {
            if (this.closed) return;
            this._fail(w, new Error(`worker exited with code ${code}`));
        });
        this.idle.push(w);
        return w;
    }

    _fail(w, err) {
        const job = this.active.get(w);
        this.active.delete(w);
        this.idle = this.idle.filter((x) => x !== w);
        w.removeAllListeners();
        w.terminate().catch(() => {});
        job?.reject(err);
        if (!this.closed) {
            this._spawn();
            this._drain();
        }
    }

    _release(w) {
        this.idle.push(w);
        this._drain();
    }

    _drain() {
        while (this.idle.length && this.queue.length) {
            const job = this.queue.shift();
            const w = this.idle.pop();
            this.active.set(w, job);
            w.postMessage({ id: job.id, task: job.task, payload: job.payload });
        }
    }

    /** @returns {Promise<any>} rejects with err.code === 'POOL_FULL' when saturated */
    run(task, payload) {
        if (this.closed) return Promise.reject(new Error('pool closed'));
        if (this.queue.length >= this.maxQueue) {
            return Promise.reject(Object.assign(new Error('Server busy'), { code: 'POOL_FULL' }));
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ id: ++this.seq, task, payload, resolve, reject });
            this._drain();
        });
    }

    stats() {
        return { size: this.size, idle: this.idle.length, queued: this.queue.length };
    }

    async close() {
        this.closed = true;
        await Promise.all([...this.idle, ...this.active.keys()].map((w) => w.terminate()));
    }
}
