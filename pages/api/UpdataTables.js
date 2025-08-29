import { initializeApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  setDoc 
} from "firebase/firestore";

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

    let inventoryCreated = 0;
    let productsUpdated = 0;

    for (const productDoc of snapshot.docs) {
      const productId = productDoc.id;
      const data = productDoc.data();

      // ✅ Step 1: Create/Update inventory entry for each product
      const inventoryRef = doc(db, "inventory", productId);
      await setDoc(
        inventoryRef,
        {
          product_id: productId,
          stock_available: data.stock_available ?? 0,
          stock_reserved: data.stock_reserved ?? 0,
          stock_sold: data.stock_sold ?? 0,
          updated_at: new Date().toISOString()
        },
        { merge: true }
      );
      inventoryCreated++;

      // ✅ Step 2: Add missing fields to products (optional sync)
      const productUpdates = {};
      if (data.stock_available === undefined) productUpdates.stock_available = 0;
      if (data.stock_reserved === undefined) productUpdates.stock_reserved = 0;
      if (data.stock_sold === undefined) productUpdates.stock_sold = 0;

      if (Object.keys(productUpdates).length > 0) {
        await updateDoc(doc(db, "products", productId), productUpdates);
        productsUpdated++;
      }
    }

    // ✅ Step 3: Example: define schema expectations for Orders and Notes
    // Orders collection new fields
    // - reserved_stock (array of {product_id, qty})
    // - status (pending, confirmed, shipped, cancelled, refunded)
    // - total_reserved_qty

    // Order Notes collection new fields
    // - linked_inventory_movement_id
    // - note_type (system, manual, adjustment)

    res.status(200).json({
      message: "Inventory schema initialized ✅",
      inventoryDocsCreatedOrUpdated: inventoryCreated,
      productDocsUpdated: productsUpdated,
      notes: "Inventory movements should be logged in `inventory_movements` with fields {product_id, order_id, movement_type, quantity, created_at}"
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
