import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

// Firebase config and initialization (reuse your config)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}
const db = getFirestore(firebaseApp);

function setCORSHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
}

export default async function handler(req, res) {
  setCORSHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    setCORSHeaders(req, res);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // API key validation
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
    setCORSHeaders(req, res);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'Valid x-api-key header required'
    });
  }

  try {
    const productsRef = collection(db, "products");
    const snapshot = await getDocs(productsRef);
    let updatedCount = 0;
    for (const productDoc of snapshot.docs) {
      const data = productDoc.data();
      const updates = {};
      if (data.vat_rate === undefined) updates.vat_rate = 0.20; // Default to 20%
      if (data.currency === undefined) updates.currency = 'BGN';
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "products", productDoc.id), updates);
        updatedCount++;
      }
    }
    res.status(200).json({
      message: `Products updated successfully.`,
      updated: updatedCount
    });
  } catch (error) {
    setCORSHeaders(req, res);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
