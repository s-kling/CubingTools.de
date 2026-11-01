import sanitizeHtml from 'sanitize-html';

// Fields that must reach the handlers byte-for-byte. sanitize-html HTML-escapes text
// ("p&ss" -> "p&amp;ss") and strips "<...>" sequences, which silently corrupted passwords
// (login with a legitimate "&" or "<" failed) and admin TODO markdown.
const VERBATIM_KEYS = new Set(['password', 'newPassword', 'token', 'content']);

function clean(value, key, depth) {
    if (typeof value === 'string') {
        return VERBATIM_KEYS.has(key) ? value : sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
    }
    if (depth > 6) return value;
    if (Array.isArray(value)) return value.map((v) => clean(v, key, depth + 1));
    if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) value[k] = clean(value[k], k, depth + 1);
    }
    return value;
}

/** Express middleware: strips markup from every string in req.body, recursively. */
export function sanitizeBody() {
    return (req, _res, next) => {
        if (req.body && typeof req.body === 'object') clean(req.body, '', 0);
        next();
    };
}

export const __test = { clean };
