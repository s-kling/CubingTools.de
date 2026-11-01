import admin from 'firebase-admin';
import path from 'path';

// Initialize Firebase Admin SDK with the cubingtools project.
// Uses Application Default Credentials when available, otherwise falls
// back to the service-account key shipped in secret/.
const __dirname = path.dirname(new URL(import.meta.url).pathname);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Both file names are accepted (bin/start.sh historically checked for service-account.json).
let credential;
for (const name of ['firebase-service-account.json', 'service-account.json']) {
    try {
        credential = admin.credential.cert(require(path.join(__dirname, 'secret', name)));
        break;
    } catch {
        /* try next */
    }
}
credential ??= admin.credential.applicationDefault();

admin.initializeApp({ credential, projectId: 'cubingtools' });

const db = admin.firestore();

export { db };
