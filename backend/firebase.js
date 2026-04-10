const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK with the cubingtools project.
// Uses Application Default Credentials when available, otherwise falls
// back to the service-account key shipped in secret/.
const serviceAccountPath = path.join(__dirname, 'secret', 'firebase-service-account.json');

let credential;
try {
    credential = admin.credential.cert(require(serviceAccountPath));
} catch {
    // Fall back to ADC (e.g. GOOGLE_APPLICATION_CREDENTIALS env var or
    // metadata server when running on Google Cloud).
    credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential, projectId: 'cubingtools' });

const db = admin.firestore();

module.exports = { db };
