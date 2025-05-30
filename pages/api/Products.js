import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

// Simple in-memory cache
const cache = {
  products: null,
  productsTimestamp: 0,
  ttl: 10 * 60 * 1000 // 10 minutes in milliseconds
};

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

function setCORSHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
}

function calculateFinalPrice(product) {
  const now = new Date();
  const vatRate = product.vat_rate || 0.20;
  const priceNet = product.price;
  const vatAmount = +(priceNet * vatRate).toFixed(2);
  const priceGross = +(priceNet + vatAmount).toFixed(2);

  let discounted = false;
  let discountPercent = 0;
  let discountedPriceNet = null;
  let discountedPriceGross = null;
  let vatAmountDiscounted = null;

  if (
    product.discounted &&
    product.discount_percent > 0 &&
    product.discount_start &&
    (!product.discount_end || new Date(product.discount_end) >= now) &&
    new Date(product.discount_start) <= now
  ) {
    discounted = true;
    discountPercent = product.discount_percent;
    discountedPriceNet = +(priceNet * (1 - discountPercent / 100)).toFixed(2);
    vatAmountDiscounted = +(discountedPriceNet * vatRate).toFixed(2);
    discountedPriceGross = +(discountedPriceNet + vatAmountDiscounted).toFixed(2);
  }

  return {
    ...product,
    price_net: priceNet,
    price_gross: priceGross,
    discounted_price_net: discountedPriceNet,
    discounted_price_gross: discountedPriceGross,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    vat_amount_discounted: vatAmountDiscounted,
    discounted,
    discount_percent: discountPercent,
    currency: product.currency || "BGN"
  };
}

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // --- PUT: Update Discount Fields (Admin) ---
    if (req.method === "PUT") {
      const { id, discount_percent, discount_start, discount_end, discount_reason } = req.body;

      if (!id || typeof discount_percent !== "number" || !discount_start) {
        res.status(400).json({ error: "Missing required fields: id, discount_percent, discount_start" });
        return;
      }

      const updateData = {
        discount_percent,
        discount_start,
        discounted: discount_percent > 0,
        updated_at: new Date().toISOString()
      };

      if (discount_end) updateData.discount_end = discount_end;
      if (discount_reason) updateData.discount_reason = discount_reason;

      // Remove discount if percent is 0 or negative
      if (discount_percent <= 0) {
        updateData.discounted = false;
        updateData.discount_percent = 0;
        updateData.discount_start = null;
        updateData.discount_end = null;
        updateData.discount_reason = null;
      }

      const productRef = doc(db, "products", id);
      await updateDoc(productRef, updateData);

      res.status(200).json({ success: true });
      return;
    }

    // --- GET: Single or All Products ---
    if (req.method === 'GET') {
      const { id } = req.query;

      if (id) {
        // Single product details (no cache for single product)
        const productDoc = await getDoc(doc(db, "products", id));
        if (!productDoc.exists()) {
          setCORSHeaders(req, res);
          res.status(404).json({ error: "Product not found" });
          return;
        }
        const product = productDoc.data();
        const result = calculateFinalPrice(product);
        res.status(200).json(result);
      } else {
        // List all products with server-side cache
        const now = Date.now();
        if (
          cache.products &&
          now - cache.productsTimestamp < cache.ttl
        ) {
          // Serve from cache
          res.status(200).json(cache.products);
          return;
        }

        // Fetch from Firestore and update cache
        const querySnapshot = await getDocs(collection(db, "products"));
        const products = querySnapshot.docs.map(doc => {
          const product = doc.data();
          return {
            docId: doc.id,
            ...calculateFinalPrice(product)
          };
        });

        cache.products = products;
        cache.productsTimestamp = now;

        res.status(200).json(products);
      }
      return;
    }

    // --- Method Not Allowed ---
    setCORSHeaders(req, res);
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    setCORSHeaders(req, res);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
