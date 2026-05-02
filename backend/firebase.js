import admin from 'firebase-admin';
import path from 'path';

// Initialize Firebase Admin SDK with the cubingtools project.
// Uses Application Default Credentials when available, otherwise falls
// back to the service-account key shipped in secret/.
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const serviceAccountPath = path.join(__dirname, 'secret', 'firebase-service-account.json');

let credential;
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

try {
    credential = admin.credential.cert(require(serviceAccountPath));
} catch {
    credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential, projectId: 'cubingtools' });

const db = admin.firestore();

export { db };
