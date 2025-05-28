import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

// Firebase config (reuse your existing config)
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

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function calculateFinalPrice(product) {
  // Determine if discount is active
  const now = new Date();
  let discounted = false;
  let discountPercent = 0;
  let discountedPrice = product.price;

  if (
    product.discounted &&
    product.discount_percent > 0 &&
    product.discount_start &&
    (!product.discount_end || new Date(product.discount_end) >= now) &&
    new Date(product.discount_start) <= now
  ) {
    discounted = true;
    discountPercent = product.discount_percent;
    discountedPrice = +(product.price * (1 - discountPercent / 100)).toFixed(2);
  }

  return {
    discounted,
    discount_percent: discountPercent,
    discounted_price: discounted ? discountedPrice : null,
    price: product.price,
    currency: product.currency || "BGN",
    vat_rate: product.vat_rate || 0.20,
    ...product
  };
}

export default async function handler(req, res) {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // GET /api/products           => list all products
  // GET /api/products?id=123    => get details for a single product
  try {
    if (req.method !== 'GET') {
      setCORSHeaders(res);
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const { id } = req.query;

    if (id) {
      // Single product details
      const productDoc = await getDoc(doc(db, "products", id));
      if (!productDoc.exists()) {
        setCORSHeaders(res);
        res.status(404).json({ error: "Product not found" });
        return;
      }
      const product = productDoc.data();
      const result = calculateFinalPrice(product);
      res.status(200).json(result);
    } else {
      // List all products
      const querySnapshot = await getDocs(collection(db, "products"));
      const products = querySnapshot.docs.map(doc => {
        const product = doc.data();
        return {
          docId: doc.id,
          ...calculateFinalPrice(product)
        };
      });
      res.status(200).json(products);
    }
  } catch (error) {
    setCORSHeaders(res);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
