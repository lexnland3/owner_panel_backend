const admin = require('firebase-admin');

if (!admin.apps.length) {
  let credential;

  // PRODUCTION (Render): paste the FULL contents of serviceAccountKey.json into
  // an env var called FIREBASE_SERVICE_ACCOUNT.
  // LOCAL: falls back to the serviceAccountKey.json file, then to
  // application-default credentials.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // Env vars often escape the key's newlines as literal "\n" — restore them.
    if (svc.private_key) {
      svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    }
    credential = admin.credential.cert(svc);
  } else {
    try {
      credential = admin.credential.cert(require('../serviceAccountKey.json'));
    } catch (_) {
      credential = admin.credential.applicationDefault();
    }
  }

  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || 'lexnland-2f518',
  });
}

const verifyFirebaseToken = async (idToken) => {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { valid: true, decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

module.exports = { admin, verifyFirebaseToken };
