import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SECRET_DIR } from './config.js';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Resolve the HMAC secret shared by every logic worker.
 * Order: SESSION_SECRET env -> backend/secret/session.key (created race-safely on first use).
 */
export function loadSessionSecret() {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
        return process.env.SESSION_SECRET;
    }
    const dir = SECRET_DIR;
    const file = path.join(dir, 'session.key');
    try {
        return fs.readFileSync(file, 'utf8').trim();
    } catch {
        fs.mkdirSync(dir, { recursive: true });
        const fresh = crypto.randomBytes(48).toString('hex');
        try {
            fs.writeFileSync(file, fresh, { flag: 'wx', mode: 0o600 });
            return fresh;
        } catch (err) {
            if (err.code === 'EEXIST') return fs.readFileSync(file, 'utf8').trim();
            throw err;
        }
    }
}

/**
 * Stateless signed bearer tokens (payload.signature, HMAC-SHA256).
 *
 * The old implementation kept sessions in a per-process Map, which breaks as soon as
 * more than one logic worker exists (login on worker A, next request lands on B -> 401)
 * and also dropped every admin session on each restart.
 */
export class SessionTokens {
    constructor({ secret, ttlMs = 8 * 60 * 60 * 1000 }) {
        if (!secret) throw new Error('SessionTokens requires a secret');
        this.secret = secret;
        this.ttlMs = ttlMs;
    }

    _mac(body) {
        return crypto.createHmac('sha256', this.secret).update(body).digest();
    }

    issue(claims, now = Date.now()) {
        const body = b64(JSON.stringify({ ...claims, iat: now, exp: now + this.ttlMs }));
        return `${body}.${b64(this._mac(body))}`;
    }

    verify(token, now = Date.now()) {
        if (typeof token !== 'string' || token.length > 2048) return null;
        const dot = token.indexOf('.');
        if (dot < 1) return null;
        const body = token.slice(0, dot);
        const given = Buffer.from(token.slice(dot + 1), 'base64url');
        const expected = this._mac(body);
        if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
        try {
            const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
            if (typeof payload.exp !== 'number' || now > payload.exp) return null;
            return payload;
        } catch {
            return null;
        }
    }
}
