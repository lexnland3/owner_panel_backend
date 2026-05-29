const admin = require('firebase-admin');

if (!admin.apps.length) {
  // If you have serviceAccountKey.json, use:
  // credential: admin.credential.cert(require('../serviceAccountKey.json')),
  
  // Otherwise use Application Default with just projectId:
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
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
