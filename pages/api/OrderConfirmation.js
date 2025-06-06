import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import nodemailer from "nodemailer";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";

// Firebase Client SDK Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase app only once
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}
const db = getFirestore(firebaseApp);

// Load the HTML template (from /public directory)
const templateSource = fs.readFileSync(
  path.join(process.cwd(), "public", "orderConfirmationTemplatev2.html"),
  "utf8"
);
const template = handlebars.compile(templateSource);

// Configure Nodemailer SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Fetch product names and images from products collection using product_id,
 * and return all necessary fields for the email template.
 */
async function prepareItemsWithProductNames(db, orderItems) {
  const itemsWithNames = [];
  for (const item of orderItems) {
    let displayName = item.name || "Unknown Product";
    let brand = "";
    let imageUrl = "";
    try {
      if (item.product_id) {
        const productDocRef = doc(db, "products", item.product_id);
        const productDoc = await getDoc(productDocRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          if (productData.name) displayName = productData.name;
          if (productData.brand_name) brand = productData.brand_name;
          if (productData.image_url) imageUrl = productData.image_url;
        }
      }
    } catch (error) {
      // Fallback to item fields if product fetch fails
    }
    itemsWithNames.push({
      brand,
      name: displayName,
      image_url: imageUrl,
      quantity: item.quantity,
      // New order item fields:
      unitPriceNet: (item.unit_price_net ?? 0).toFixed(2),
      unitPriceGross: (item.unit_price_gross ?? 0).toFixed(2),
      unitVatAmount: (item.unit_vat_amount ?? 0).toFixed(2),
      vatRate: Math.round((item.vat_rate ?? 0) * 100),
      lineTotalNet: (item.line_total_net ?? 0).toFixed(2),
      lineTotalGross: (item.line_total_gross ?? 0).toFixed(2),
      lineVatAmount: (item.line_vat_amount ?? 0).toFixed(2),
      discountPercent: item.discount_percent > 0 ? item.discount_percent : null,
      originalPriceGross: item.original_price_gross
        ? (item.original_price_gross).toFixed(2)
        : null,
    });
  }
  return itemsWithNames;
}

/**
 * Send order confirmation email for a given orderId
 */
async function sendOrderConfirmationEmail(orderId) {
  const orderDocRef = doc(db, "orders", orderId);
  const orderDoc = await getDoc(orderDocRef);
  if (!orderDoc.exists()) throw new Error("Order not found");
  const order = orderDoc.data();

  // Prepare items array with product names and images from products collection
  const items = await prepareItemsWithProductNames(db, order.items || []);

  // Prepare template data with new variable names
  const templateData = {
    first_name: order.first_name,
    sub_total: (order.subtotal_gross ?? 0).toFixed(2),
    shipping: (order.shipping_cost ?? 0).toFixed(2),
    total: (order.total_gross ?? 0).toFixed(2),
    shipping_address: `${order.address}, ${order.city}`,
    shipping_method: order.delivery_option,
    payment_method: order.payment_method,
    // Keep items array for product listing
    items: items,
    // Include other existing fields if needed by template
    customerName: `${order.first_name} ${order.last_name}`,
    postalCode: order.postal_code,
    phone: order.phone
  };

  // Generate the HTML email content
  const htmlContent = template(templateData);

  // Send the email
  await transporter.sendMail({
    from: `"Sofia Padel" <${process.env.SMTP_USER}>`,
    to: order.user_email,
    subject: "Order Confirmation - Sofia Padel",
    html: htmlContent,
  });

  return true;
}


function setCORSHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
}

// Default export required for Next.js API route
export default async function handler(req, res) {
  setCORSHeaders(req, res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Log request details for debugging
  console.log('Incoming request:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });

  if (req.method !== 'POST') {
    setCORSHeaders(req, res);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Validate API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
    console.error('Invalid/missing API key:', {
      received: apiKey,
      expected: process.env.VERCEL_API_KEY ? '***' : 'NOT_SET'
    });
    setCORSHeaders(req, res);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'Valid x-api-key header required'
    });
  }

  // Validate request body
  let orderId;
  try {
    orderId = typeof req.body === 'string'
      ? JSON.parse(req.body).orderId
      : req.body?.orderId;
  } catch (e) {
    setCORSHeaders(req, res);
    console.error('Invalid request body:', req.body);
    return res.status(400).json({
      error: 'Invalid request body',
      expected_format: { orderId: "string" }
    });
  }

  if (!orderId) {
    setCORSHeaders(req, res);
    console.error('Missing orderId in request body');
    return res.status(400).json({
      error: 'Missing required field: orderId'
    });
  }

  console.log('✅ All validations passed. Processing order:', orderId);

  try {
    await sendOrderConfirmationEmail(orderId);
    res.status(200).json({ message: "Order confirmation email sent!" });
  } catch (error) {
    setCORSHeaders(res);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
}
