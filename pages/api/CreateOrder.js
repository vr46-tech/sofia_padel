import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, runTransaction, Timestamp } from "firebase/firestore";

// Firebase config (reuse your config)
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
}

async function generateOrderNumber() {
  return await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, 'counters', 'orders');
    const counterDoc = await transaction.get(counterRef);
    const nextNumber = (counterDoc.exists() ? counterDoc.data().current : 0) + 1;
    transaction.set(counterRef, { current: nextNumber }, { merge: true });
    return nextNumber.toString().padStart(7, '0');
  });
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

  // API key validation (optional, add if needed)
  // const apiKey = req.headers['x-api-key'];
  // if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
  //   setCORSHeaders(req, res);
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  try {
    const {
      user_email,
      user_uid,
      first_name,
      last_name,
      phone,
      delivery_option,
      address,
      city,
      postal_code,
      payment_method,
      items, // Array of { product_id, quantity }
      shipping_cost = 0
    } = req.body;

    if (
      !user_email || !user_uid || !first_name || !last_name ||
      !phone || !delivery_option || !address || !city ||
      !postal_code || !payment_method || !Array.isArray(items) || items.length === 0
    ) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Fetch product details for each item to get price, VAT, etc.
    let subtotal = 0;
    let vat_total = 0;
    const orderItems = [];
    for (const item of items) {
      // Each item: { product_id, quantity }
      const productDoc = await getDoc(doc(db, "products", item.product_id));
      if (!productDoc.exists()) {
        res.status(400).json({ error: `Product not found: ${item.product_id}` });
        return;
      }
      const product = productDoc.data();
      const price = product.discounted
        ? (product.discounted_price ?? product.price)
        : product.price;
      const vat_rate = product.vat_rate ?? 0.20;
      const quantity = item.quantity;
      const itemSubtotal = price * quantity;
      const itemVAT = +(itemSubtotal * vat_rate).toFixed(2);
      subtotal += itemSubtotal;
      vat_total += itemVAT;

      orderItems.push({
        product_id: item.product_id,
        name: product.name,
        quantity,
        unit_price: price,
        vat_rate,
        vat_amount: itemVAT,
        subtotal: itemSubtotal,
        currency: product.currency || "BGN"
      });
    }

    const total_before_vat = subtotal + shipping_cost;
    const total_vat = +(vat_total).toFixed(2);
    const total = +(total_before_vat + total_vat).toFixed(2);

    const order_number = await generateOrderNumber();

    // Build order document
    const orderData = {
      order_number,
      user_email,
      user_uid,
      first_name,
      last_name,
      phone,
      delivery_option,
      address,
      city,
      postal_code,
      payment_method,
      items: orderItems,
      shipping_cost,
      subtotal: +subtotal.toFixed(2),
      vat_total: total_vat,
      total: total,
      currency: orderItems[0]?.currency || "BGN",
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Store order in Firestore
    const orderRef = await addDoc(collection(db, 'orders'), orderData);

    // Optionally update user profile
    if (user_uid) {
      const userRef = doc(db, 'users', user_uid);
      await updateDoc(userRef, {
        first_name,
        last_name,
        phone,
        address,
        city,
        postal_code,
        preferred_payment: payment_method,
        updated_at: new Date().toISOString()
      });
    }

    res.status(200).json({
      message: "Order created successfully",
      order_id: orderRef.id,
      order_number,
      vat_total: total_vat,
      total
    });
  } catch (error) {
    setCORSHeaders(req, res);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
