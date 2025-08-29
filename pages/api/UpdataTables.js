import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

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

export default async function handler(req, res) {
  try {
    const productsRef = collection(db, "products");
    const snapshot = await getDocs(productsRef);

    let updatedCount = 0;

    for (const productDoc of snapshot.docs) {
      const data = productDoc.data();
      const updates = {};

      if (data.stock_available === undefined) updates.stock_available = 0;
      if (data.stock_reserved === undefined) updates.stock_reserved = 0;
      if (data.stock_sold === undefined) updates.stock_sold = 0;

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "products", productDoc.id), updates);
        updatedCount++;
      }
    }

    res.status(200).json({
      message: `Products initialized with inventory tracking.`,
      updated: updatedCount
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
