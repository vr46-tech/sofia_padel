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
      console.error("Error fetching product data:", error);
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
  console.log(`Processing order confirmation for order: ${orderId}`);
  
  const orderDocRef = doc(db, "orders", orderId);
  const orderDoc = await getDoc(orderDocRef);
  if (!orderDoc.exists()) {
    throw new Error(`Order not found: ${orderId}`);
  }
  const order = orderDoc.data();

  console.log(`Order found, customer: ${order.first_name} ${order.last_name}`);

  // Prepare items array with product names and images from products collection
  const items = await prepareItemsWithProductNames(db, order.items || []);

  // Calculate shipping cost for template (using the same logic as frontend)
  const shippingCost = order.total_amount >= 50 ? 0 : 5.99;

  // Prepare template data
  const templateData = {
    customerName: `${order.first_name} ${order.last_name}`,
    items: items,
    subtotal: order.total_amount ? (order.total_amount - shippingCost).toFixed(2) : "0.00",
    shippingCostDisplay: shippingCost > 0 ? "€" + shippingCost.toFixed(2) : "FREE",
    total: order.total_amount ? order.total_amount.toFixed(2) : "0.00",
    address: order.address || "",
    city: order.city || "",
    postalCode: order.postal_code || "",
    phone: order.phone || "",
    deliveryOptionDisplay:
      order.delivery_option === "delivery"
        ? "Delivery to address"
        : "Pick up from address",
    paymentMethodDisplay:
      order.payment_method === "card"
        ? "Pay by Card on Delivery"
        : "Cash on Delivery",
  };

  console.log(`Generating email for: ${order.user_email}`);

  // Generate the HTML email content
  const htmlContent = template(templateData);

  // Send the email
  await transporter.sendMail({
    from: `"Sofia Padel" <${process.env.SMTP_USER}>`,
    to: order.user_email,
    subject: "Order Confirmation - Sofia Padel",
    html: htmlContent,
  });

  console.log(`Order confirmation email sent successfully to: ${order.user_email}`);
  return true;
}

// Default export required for Next.js API route
export default async function handler(req, res) {
  console.log(`${req.method} request to /api/OrderConfirmation`);

  // Always set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    console.log(`Method ${req.method} not allowed`);
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  // Extract orderId from request body (handle both simple and complex payloads)
  let orderId;
  try {
    if (typeof req.body === 'string') {
      const parsed = JSON.parse(req.body);
      orderId = parsed.orderId;
    } else {
      orderId = req.body.orderId;
    }
  } catch (parseError) {
    console.error('Error parsing request body:', parseError);
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  if (!orderId) {
    console.log('Missing orderId in request body:', req.body);
    res.status(400).json({ message: "Missing orderId in request body" });
    return;
  }

  console.log(`Processing order confirmation for orderId: ${orderId}`);

  try {
    await sendOrderConfirmationEmail(orderId);
    res.status(200).json({ 
      message: "Order confirmation email sent successfully!",
      orderId: orderId 
    });
  } catch (error) {
    console.error("Order confirmation error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
      orderId: orderId
    });
  }
}
