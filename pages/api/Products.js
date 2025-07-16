import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, query, where } from "firebase/firestore";

// Enhanced cache structure
const cache = {
  allProducts: { data: null, timestamp: 0 },
  singleProducts: {}, // Cache individual products by ID
  categoryProducts: {}, // Cache products by category ID
  ttl: 10 * 60 * 1000 // 10 minutes in ms
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
        updateData.discount_price = 0;
        updateData.discount_start = null;
        updateData.discount_end = null;
        updateData.discount_reason = null;
      }

      const productRef = doc(db, "products", id);
      await updateDoc(productRef, updateData);

      // Invalidate relevant cache entries
      delete cache.singleProducts[id]; // Remove single product from cache
      cache.allProducts.data = null; // Invalidate all products list
      cache.allProducts.timestamp = 0;
      // Invalidate all category caches (simple strategy)
      cache.categoryProducts = {}; 

      res.status(200).json({ success: true });
      return;
    }

    // --- GET: Single, All, or By Category ---
    if (req.method === 'GET') {
      const { id, category_id } = req.query;
      const now = Date.now();

      if (id) {
        // Single product with caching
        const cachedProduct = cache.singleProducts[id];
        if (cachedProduct && now - cachedProduct.timestamp < cache.ttl) {
          res.status(200).json(cachedProduct.data);
          return;
        }
        const productDoc = await getDoc(doc(db, "products", id));
        if (!productDoc.exists()) {
          res.status(404).json({ error: "Product not found" });
          return;
        }
        const product = calculateFinalPrice(productDoc.data());
        cache.singleProducts[id] = {
          data: product,
          timestamp: now
        };
        res.status(200).json(product);
        return;
      } else if (category_id) {
        // Products by category with caching
        const cachedCategory = cache.categoryProducts[category_id];
        if (cachedCategory && now - cachedCategory.timestamp < cache.ttl) {
          res.status(200).json(cachedCategory.data);
          return;
        }
        const productsQuery = query(
          collection(db, "products"),
          where("category_id", "==", category_id)
        );
        const querySnapshot = await getDocs(productsQuery);
        const products = querySnapshot.docs.map(doc => ({
          docId: doc.id,
          ...calculateFinalPrice(doc.data())
        }));

        cache.categoryProducts[category_id] = {
          data: products,
          timestamp: now
        };

        res.status(200).json(products);
        return;
      } else {
        // All products with caching
        if (cache.allProducts.data && now - cache.allProducts.timestamp < cache.ttl) {
          res.status(200).json(cache.allProducts.data);
          return;
        }
        const querySnapshot = await getDocs(collection(db, "products"));
        const products = querySnapshot.docs.map(doc => ({
          docId: doc.id,
          ...calculateFinalPrice(doc.data())
        }));

        cache.allProducts = {
          data: products,
          timestamp: now
        };

        res.status(200).json(products);
        return;
      }
    }

    // --- Method Not Allowed ---
    setCORSHeaders(req, res);
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    setCORSHeaders(req, res);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
