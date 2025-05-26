
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
path.join(process.cwd(), "public", "orderConfirmationTemplate.html"),
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
* Fetch product names and images from products collection using product_id
*/
async function prepareItemsWithProductNames(db, orderItems) {
const itemsWithNames = [];
for (const item of orderItems) {
let displayName = "Unknown Product";
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
} else {
displayName = item.name || "Unknown Product";
}
} else {
displayName = item.name || "Unknown Product";
}
} catch (error) {
displayName = item.name || "Unknown Product";
}
itemsWithNames.push({
brand,
name: displayName,
image_url: imageUrl,
quantity: item.quantity,
itemTotal: (item.price * item.quantity).toFixed(2),
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

// Prepare template data
const templateData = {
customerName: `${order.first_name} ${order.last_name}`,
items: items,
subtotal: order.total_amount ? order.total_amount.toFixed(2) : "0.00",
shippingCostDisplay:
order.shipping_cost > 0 ? "€" + order.shipping_cost.toFixed(2) : "FREE",
total: order.total_amount ? order.total_amount.toFixed(2) : "0.00",
address: order.address,
city: order.city,
postalCode: order.postal_code,
phone: order.phone,
deliveryOptionDisplay:
order.delivery_option === "delivery"
? "Delivery to address"
: "Pick up from address",
paymentMethodDisplay:
order.payment_method === "card"
? "Pay by Card on Delivery"
: "Cash on Delivery",
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

// Default export required for Next.js API route
export default async function handler(req, res) {

// 1. Set CORS headers FIRST
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  // 2. Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    res.status(204).end();
    return;
  }

  // 3. Log request details for debugging
  console.log('Incoming request:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });

  // 4. Validate HTTP method
  if (req.method !== 'POST') {
    console.error(`Method ${req.method} not allowed`);
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      allowed_methods: ['POST']
    });
  }

  // 5. Validate API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
    console.error('Invalid/missing API key:', {
      received: apiKey,
      expected: process.env.VERCEL_API_KEY ? '***' : 'NOT_SET'
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'Valid x-api-key header required'
    });
  }

  // 6. Validate request body
  let orderId;
  try {
    orderId = typeof req.body === 'string' 
      ? JSON.parse(req.body).orderId 
      : req.body?.orderId;
  } catch (e) {
    console.error('Invalid request body:', req.body);
    return res.status(400).json({ 
      error: 'Invalid request body',
      expected_format: { orderId: "string" }
    });
  }

  if (!orderId) {
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
res.status(500).json({
message: "Internal server error",
error: error.message,
});
}
}
