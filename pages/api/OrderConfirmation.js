import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, query, collection, where, getDocs } from "firebase/firestore";
import nodemailer from "nodemailer";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";

// Enable debug HTML attachment via env variable or set to true/false directly
const DEBUG_ATTACH_HTML = process.env.DEBUG_ATTACH_HTML === 'true'; // or: const DEBUG_ATTACH_HTML = true;

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
 * Fallback: If not found by document ID, query by 'id' field.
 */
async function prepareItemsWithProductNames(db, orderItems) {
  const itemsWithNames = [];
  for (const item of orderItems) {
    let displayName = item.name || "Unknown Product";
    let imageUrl = "";
    try {
      if (item.product_id) {
        console.log(`[OrderConfirmation] Fetching product data for ID: ${item.product_id}`);
        // Try by document ID
        const productDocRef = doc(db, "products", item.product_id);
        const productDoc = await getDoc(productDocRef);

        if (productDoc.exists()) {
          const productData = productDoc.data();
          displayName = productData.name || displayName;
          imageUrl = productData.image_url || imageUrl;
          console.log(`[OrderConfirmation] imageUrl for ${item.product_id}:`, imageUrl);
        } else {
          // Fallback: query by 'id' field
          console.warn(`[OrderConfirmation] Product not found in Firestore: ${item.product_id}. Trying by 'id' field.`);
          const q = query(collection(db, "products"), where("id", "==", item.product_id));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const productData = querySnapshot.docs[0].data();
            displayName = productData.name || displayName;
            imageUrl = productData.image_url || imageUrl;
            console.log(`[OrderConfirmation] imageUrl for ${item.product_id} (by 'id' field):`, imageUrl);
          } else {
            console.warn(`[OrderConfirmation] Product not found by 'id' field: ${item.product_id}`);
          }
        }
      }
    } catch (error) {
      console.error(`[OrderConfirmation] Error fetching product ${item.product_id}:`, error);
    }
    itemsWithNames.push({
      image_url: imageUrl,
      item_name: displayName,
      quantity: item.quantity,
      item_price: (item.line_total_gross ?? 0).toFixed(2)
    });
  }
  return itemsWithNames;
}

/**
 * Send order confirmation email for a given orderId
 */
async function sendOrderConfirmationEmail(orderId) {
  try {
    console.log(`[OrderConfirmation] Starting email confirmation for order: ${orderId}`);
    const orderDocRef = doc(db, "orders", orderId);
    const orderDoc = await getDoc(orderDocRef);

    if (!orderDoc.exists()) {
      console.error(`[OrderConfirmation] Order not found in Firestore: ${orderId}`);
      throw new Error(`Order ${orderId} not found in Firestore`);
    }
    console.log(`[OrderConfirmation] Order document found: ${orderId}`);

    const order = orderDoc.data();
    console.log('[OrderConfirmation] Order data:', JSON.stringify(order, null, 2));

    const items = await prepareItemsWithProductNames(db, order.items || []);
    console.log(`[OrderConfirmation] Processed ${items.length} order items`);

    const templateData = {
      first_name: order.first_name,
      sub_total: (order.subtotal_gross ?? 0).toFixed(2),
      shipping: (order.shipping_cost ?? 0).toFixed(2),
      total: (order.total_gross ?? 0).toFixed(2),
      shipping_address: `${order.address}, ${order.city}`,
      shipping_method: order.delivery_option,
      payment_method: order.payment_method,
      items: items,
      customerName: `${order.first_name} ${order.last_name}`,
      postalCode: order.postal_code,
      phone: order.phone
    };
    console.log('[OrderConfirmation] Template data prepared:', JSON.stringify(templateData, null, 2));

    const htmlContent = template(templateData);
    console.log('[OrderConfirmation] Email template rendered successfully');

    // Prepare mail options
    const mailOptions = {
      from: `"Sofia Padel" <${process.env.SMTP_USER}>`,
      to: order.user_email,
      subject: "Order Confirmation - Sofia Padel",
      html: htmlContent,
    };

    // Attach HTML as a file if debug mode is enabled
    if (DEBUG_ATTACH_HTML) {
      mailOptions.attachments = [
        {
          filename: 'orderConfirmation.html',
          content: htmlContent,
          contentType: 'text/html'
        }
      ];
      console.log('[OrderConfirmation] Debug mode enabled: HTML attached as orderConfirmation.html');
    }

    // Send the email
    const mailResult = await transporter.sendMail(mailOptions);
    console.log('[OrderConfirmation] ✅ Email sent successfully:', mailResult.messageId);

    return true;
  } catch (error) {
    console.error('[OrderConfirmation] 🔥 Error in sendOrderConfirmationEmail:', error);
    throw error;
  }
}

function setCORSHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
}

// Default export required for Next.js API route
export default async function handler(req, res) {
  try {
    setCORSHeaders(req, res);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      console.log('[OrderConfirmation] Handling OPTIONS preflight');
      return res.status(204).end();
    }

    // Log request details for debugging
    console.log('[OrderConfirmation] Incoming request:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    });

    if (req.method !== 'POST') {
      console.warn(`[OrderConfirmation] Method not allowed: ${req.method}`);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Validate API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
      console.error('[OrderConfirmation] Invalid/missing API key:', {
        received: apiKey,
        expected: process.env.VERCEL_API_KEY ? '***' : 'NOT_SET'
      });
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
      console.error('[OrderConfirmation] Invalid request body:', req.body);
      return res.status(400).json({
        error: 'Invalid request body',
        expected_format: { orderId: "string" }
      });
    }

    if (!orderId) {
      console.error('[OrderConfirmation] Missing orderId in request body');
      return res.status(400).json({
        error: 'Missing required field: orderId'
      });
    }

    console.log('[OrderConfirmation] ✅ All validations passed. Processing order:', orderId);

    await sendOrderConfirmationEmail(orderId);

    console.log('[OrderConfirmation] Order confirmation completed successfully');
    return res.status(200).json({ message: "Order confirmation email sent!" });

  } catch (error) {
    console.error('[OrderConfirmation] 🚨 Top-level handler error:', {
      message: error.message,
      stack: error.stack,
      rawError: error
    });

    setCORSHeaders(req, res);
    return res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === 'production' ? 'Contact support' : error.message,
      errorId: Date.now()
    });
  }
}
