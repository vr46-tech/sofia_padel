import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc
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

function calculateStockStatus(stockAvailable, stockReserved, minimumStockLevel) {
  const availableStock = (stockAvailable || 0) - (stockReserved || 0);
  
  if (availableStock <= 0) {
    return "out_of_stock";
  } else if (availableStock <= minimumStockLevel) {
    return "low_stock";
  } else {
    return "in_stock";
  }
}

export default async function handler(req, res) {
  try {
    const productsRef = collection(db, "products");
    const snapshot = await getDocs(productsRef);
    
    let productsUpdated = 0;
    let errors = [];

    for (const productDoc of snapshot.docs) {
      try {
        const productId = productDoc.id;
        const data = productDoc.data();
        
        // Set default minimum stock level
        const minimumStockLevel = 10;
        
        // Calculate stock status based on existing stock data
        const stockStatus = calculateStockStatus(
          data.stock_available, 
          data.stock_reserved, 
          minimumStockLevel
        );

        // Prepare update object with new inventory management fields
        const inventoryUpdates = {
          minimum_stock_level: minimumStockLevel,
          track_inventory: true,
          allow_backorder: false,
          stock_status: stockStatus,
          last_stock_update: new Date().toISOString()
        };

        // Only add fields that don't already exist to avoid overwriting existing data
        const updates = {};
        Object.keys(inventoryUpdates).forEach(field => {
          if (data[field] === undefined) {
            updates[field] = inventoryUpdates[field];
          }
        });

        // Update the product if there are fields to add
        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "products", productId), updates);
          productsUpdated++;
          
          console.log(`Updated product ${productId} with fields:`, Object.keys(updates));
        }

      } catch (productError) {
        console.error(`Error updating product ${productDoc.id}:`, productError);
        errors.push({
          productId: productDoc.id,
          error: productError.message
        });
      }
    }

    // Also update counters collection for inventory tracking
    try {
      const countersRef = doc(db, "counters", "inventory");
      await updateDoc(countersRef, {
        stock_movements: { current: 0 },
        reservations: { current: 0 },
        updated_at: new Date().toISOString()
      });
    } catch (counterError) {
      console.log("Note: Could not update counters collection:", counterError.message);
    }

    res.status(200).json({
      message: "Products updated with inventory management fields ✅",
      productsUpdated: productsUpdated,
      totalProducts: snapshot.docs.length,
      errors: errors.length > 0 ? errors : undefined,
      fieldsAdded: [
        "minimum_stock_level (default: 10)",
        "track_inventory (default: true)", 
        "allow_backorder (default: false)",
        "stock_status (calculated based on current stock)",
        "last_stock_update (current timestamp)"
      ],
      note: "Stock status calculated as: out_of_stock (available ≤ 0), low_stock (available ≤ minimum), in_stock (normal)"
    });

  } catch (error) {
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
