import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, runTransaction } from "firebase/firestore";

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

// Calculate final pricing for a product (same logic as in Products API)
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

  try {
    // Verbose: Log incoming payload
    console.log("Order creation request body:", JSON.stringify(req.body, null, 2));

    // Parse and validate input
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

    let subtotal_net = 0;
    let subtotal_gross = 0;
    let total_vat_amount = 0;
    const orderItems = [];

    for (const item of items) {
      // Verbose log for each item
      console.log(`Processing order item:`, item);

      // Check type and value of product_id
      if (!item.product_id || typeof item.product_id !== "string") {
        console.error("Invalid product_id in item:", item);
        res.status(400).json({ error: `Invalid product_id: ${item.product_id}` });
        return;
      }

      // Log the Firestore path being queried
      const productRef = doc(db, "products", item.product_id);
      console.log("Firestore product path:", productRef.path);

      const productDoc = await getDoc(productRef);

      // Log existence check
      console.log(
        `Product fetch result for ID ${item.product_id}: exists=${productDoc.exists()}`
      );

      if (!productDoc.exists()) {
        // Log all IDs in the products collection for debugging
        const snapshot = await getDocs(collection(db, "products"));
        const allIds = snapshot.docs.map(d => d.id);
        console.error(
          `Product not found: ${item.product_id}. Existing product IDs:`,
          allIds
        );
        res.status(400).json({ error: `Product not found: ${item.product_id}` });
        return;
      }

      const product = productDoc.data();
      const productWithPricing = calculateFinalPrice(product);

      // Determine which price to use (discounted or regular)
      const isDiscounted = productWithPricing.discounted &&
        productWithPricing.discounted_price_gross !== null;

      const unit_price_net = isDiscounted
        ? productWithPricing.discounted_price_net
        : productWithPricing.price_net;

      const unit_price_gross = isDiscounted
        ? productWithPricing.discounted_price_gross
        : productWithPricing.price_gross;

      const unit_vat_amount = isDiscounted
        ? productWithPricing.vat_amount_discounted
        : productWithPricing.vat_amount;

      const quantity = item.quantity;
      const line_total_net = +(unit_price_net * quantity).toFixed(2);
      const line_total_gross = +(unit_price_gross * quantity).toFixed(2);
      const line_vat_amount = +(unit_vat_amount * quantity).toFixed(2);

      subtotal_net += line_total_net;
      subtotal_gross += line_total_gross;
      total_vat_amount += line_vat_amount;

      orderItems.push({
        product_id: item.product_id,
        name: product.name,
        quantity,
        unit_price_net: unit_price_net,
        unit_price_gross: unit_price_gross,
        unit_vat_amount: unit_vat_amount,
        vat_rate: productWithPricing.vat_rate,
        line_total_net: line_total_net,
        line_total_gross: line_total_gross,
        line_vat_amount: line_vat_amount,
        currency: productWithPricing.currency,
        // Store discount info if applicable
        discounted: isDiscounted,
        discount_percent: isDiscounted ? productWithPricing.discount_percent : null,
        original_price_net: productWithPricing.price_net,
        original_price_gross: productWithPricing.price_gross
      });
    }

    // Calculate shipping VAT (assuming same rate as first product, or 20%)
    const shipping_vat_rate = orderItems[0]?.vat_rate || 0.20;
    const shipping_net = shipping_cost;
    const shipping_vat_amount = +(shipping_net * shipping_vat_rate).toFixed(2);
    const shipping_gross = +(shipping_net + shipping_vat_amount).toFixed(2);

    // Calculate order totals
    const order_subtotal_net = +subtotal_net.toFixed(2);
    const order_subtotal_gross = +subtotal_gross.toFixed(2);
    const order_total_vat = +(total_vat_amount + shipping_vat_amount).toFixed(2);
    const order_total_net = +(order_subtotal_net + shipping_net).toFixed(2);
    const order_total_gross = +(order_subtotal_gross + shipping_gross).toFixed(2);

    const order_number = await generateOrderNumber();

    // Build comprehensive order document with VAT breakdown
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

      // Pricing breakdown
      subtotal_net: order_subtotal_net,
      subtotal_gross: order_subtotal_gross,
      subtotal_vat_amount: +total_vat_amount.toFixed(2),

      shipping_cost_net: shipping_net,
      shipping_cost_gross: shipping_gross,
      shipping_vat_amount: shipping_vat_amount,
      shipping_vat_rate: shipping_vat_rate,

      total_net: order_total_net,
      total_gross: order_total_gross,
      total_vat_amount: order_total_vat,

      // Legacy fields for backward compatibility
      shipping_cost: shipping_gross, // Keep for compatibility
      subtotal: order_subtotal_gross, // Keep for compatibility
      vat_total: order_total_vat, // Keep for compatibility
      total: order_total_gross, // Keep for compatibility

      currency: orderItems[0]?.currency || "BGN",
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Store order in Firestore
    const orderRef = await addDoc(collection(db, 'orders'), orderData);

    // Update user profile if user exists
    if (user_uid) {
      const userRef = doc(db, 'users', user_uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        res.status(404).json({ error: `User not found: ${user_uid}` });
        return;
      }
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
      subtotal_net: order_subtotal_net,
      subtotal_gross: order_subtotal_gross,
      total_vat_amount: order_total_vat,
      total_net: order_total_net,
      total_gross: order_total_gross,
      currency: orderItems[0]?.currency || "BGN"
    });
  } catch (error) {
    setCORSHeaders(req, res);
    console.error("Order creation error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
