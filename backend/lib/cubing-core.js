import fs from 'fs';
import path from 'path';
import { ROOT_DIR } from './config.js';

/**
 * The browser tools and the backend share ONE implementation of the cubing arithmetic:
 * public/js/cubingCore.js. It is a plain classic script (what the browser needs), so it is
 * evaluated here with its own `globalThis` instead of being imported: it attaches CubingCore to
 * that private object (no global pollution) but still runs in this realm, so arrays and objects it
 * returns behave like any other and TextEncoder/atob/btoa are available.
 */
const file = process.env.CUBING_CORE_FILE || path.join(ROOT_DIR, 'public', 'js', 'cubingCore.js');
const evaluate = new Function('globalThis', `${fs.readFileSync(file, 'utf8')}\n;return globalThis.CubingCore;`);

export const CubingCore = evaluate({});
