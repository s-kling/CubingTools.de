import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { BACKEND_DIR } from './config.js';

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let shared = null;

/**
 * One pooled SMTP transporter per process. The old code built a brand-new transporter (a new
 * TCP+TLS+AUTH handshake) for every single email and re-read the HTML template from disk each time.
 */
export function getMailer({ maxConnections = 5, ratePerSecond = 5 } = {}) {
    if (shared) return shared;
    shared = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 587,
        secure: false,
        pool: true,
        maxConnections,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: ratePerSecond,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });
    return shared;
}

export function closeMailer() {
    shared?.close?.();
    shared = null;
}

const templateCache = new Map();

/** Template (backend/API/mail/<name>.html) read once, `${var}` placeholders replaced. */
export function renderTemplate(name, vars, dir = path.join(BACKEND_DIR, 'API', 'mail')) {
    let tpl = templateCache.get(name);
    if (tpl === undefined) {
        tpl = fs.readFileSync(path.join(dir, `${name}.html`), 'utf8');
        templateCache.set(name, tpl);
    }
    return tpl.replace(/\$\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

export const stripHeaderChars = (s) => String(s).replace(/[\r\n\0]/g, '');
