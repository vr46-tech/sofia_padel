import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, Timestamp, runTransaction } from "firebase/firestore";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import nodemailer from "nodemailer";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { InvoicePDF } from "../../components/pdf/InvoicePDF";

// Firebase configuration
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

// Helper: Get next invoice number (auto-increment)
async function getNextInvoiceNumber() {
  const counterRef = doc(db, "config", "invoiceCounter");
  let newNumber;
  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let current = 100000001;
    if (counterDoc.exists()) {
      current = counterDoc.data().current || current;
    }
    newNumber = current;
    transaction.set(counterRef, { current: current + 1 }, { merge: true });
  });
  return newNumber.toString().padStart(10, "0");
}

// Helper: Prepare items for the template (fetch product info if needed)
async function prepareItemsWithProductNames(orderItems) {
  const itemsWithNames = [];
  for (const item of orderItems || []) {
    let displayName = item.name || "Unknown Product";
    try {
      if (item.product_id) {
        // Try by document ID
        const productDocRef = doc(db, "products", item.product_id);
        const productDoc = await getDoc(productDocRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const brandName = productData.brand || "";
          const modelName = productData.name || displayName;
          displayName = brandName ? `${brandName} ${modelName}` : modelName;
        } else {
          // Fallback: query by 'id' field
          const q = query(collection(db, "products"), where("id", "==", item.product_id));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const productData = querySnapshot.docs[0].data();
            const brandName = productData.brand || "";
            const modelName = productData.name || displayName;
            displayName = brandName ? `${brandName} ${modelName}` : modelName;
          }
        }
      }
    } catch (error) {
      // Ignore product lookup errors, fallback to item.name
    }
    itemsWithNames.push({
      item_name: displayName,
      quantity: item.quantity,
      item_price: (item.line_total_gross ?? 0).toFixed(2),
    });
  }
  return itemsWithNames;
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { orderId, recipientEmail } = req.body;
  if (!orderId) {
    res.status(400).json({ message: "Missing orderId in request body" });
    return;
  }

  try {
    // Check if invoice already exists for this order
    const invoicesRef = collection(db, "invoices");
    const existingInvoiceSnap = await getDocs(query(invoicesRef, where("orderId", "==", orderId)));
    let invoiceData, pdfBuffer, invoiceNumber, customerEmail, order, items;

    if (!existingInvoiceSnap.empty) {
      // Invoice exists: re-send it
      const invoiceDoc = existingInvoiceSnap.docs[0].data();
      invoiceData = invoiceDoc;
      invoiceNumber = invoiceDoc.invoiceNumber;
      customerEmail = invoiceDoc.user_email;
      pdfBuffer = Buffer.from(invoiceDoc.pdfBase64, "base64");
      order = null; // Not needed for HTML template if already sent
      items = invoiceDoc.items || [];
    } else {
      // Invoice does not exist: generate, store, and send
      const orderDoc = await getDoc(doc(db, "orders", orderId));
      if (!orderDoc.exists()) throw new Error("Order not found");
      order = orderDoc.data();

      // Prepare invoice items with product names
      items = await prepareItemsWithProductNames(order.items);

      // Use order's calculated totals
      const subtotal_net = order.subtotal_net ?? 0;
      const subtotal_gross = order.subtotal_gross ?? 0;
      const vat_total = order.vat_total ?? order.subtotal_vat_amount ?? 0;
      const shipping_cost = order.shipping_cost ?? 0;
      const total_gross = order.total_gross ?? 0;

      invoiceNumber = await getNextInvoiceNumber();
      const issueDate = new Date().toISOString().slice(0, 10);

      // Generate PDF buffer
      pdfBuffer = await renderToBuffer(
        <InvoicePDF
          invoiceNumber={invoiceNumber}
          issueDate={issueDate}
          orderReference={order.order_number || orderId}
          customer={{
            name: `${order.first_name} ${order.last_name}`,
            address: order.address,
            city: order.city,
            postalCode: order.postal_code,
            phone: order.phone,
          }}
          company={{
            name: "Sofia Padel",
            address: "123 Avenue Padel",
            city: "Sofia",
            vatNumber: "BG123456789",
          }}
          items={order.items}
          subtotalNet={subtotal_net}
          subtotalGross={subtotal_gross}
          vatTotal={vat_total}
          shippingCost={shipping_cost}
          total={total_gross}
          paymentMethod={
            order.payment_method === "card"
              ? "Pay by Card on Delivery"
              : "Cash on Delivery"
          }
          currency={order.currency || "BGN"}
          language={order.language || "en"}
        />
      );
      const pdfBase64 = pdfBuffer.toString("base64");

      invoiceData = {
        orderId,
        orderReference: order.order_number || orderId,
        user_email: order.user_email,
        customer: {
          name: `${order.first_name} ${order.last_name}`,
          address: order.address,
          city: order.city,
          postalCode: order.postal_code,
          phone: order.phone,
        },
        company: {
          name: "Sofia Padel",
          address: "123 Avenue Padel",
          city: "Sofia",
          vatNumber: "BG123456789",
        },
        invoiceNumber,
        issueDate,
        items: order.items,
        subtotalNet: subtotal_net,
        subtotalGross: subtotal_gross,
        vatTotal: vat_total,
        shippingCost: shipping_cost,
        total: total_gross,
        paymentMethod:
          order.payment_method === "card"
            ? "Pay by Card on Delivery"
            : "Cash on Delivery",
        currency: order.currency || "BGN",
        language: order.language || "en",
        createdAt: Timestamp.now(),
        pdfBase64,
      };
      await addDoc(invoicesRef, invoiceData);
      customerEmail = order.user_email;
    }

    // --- HTML Email Template Integration ---
    // Load and compile the HTML template
    const templateSource = fs.readFileSync(
      path.join(process.cwd(), "public", "orderShipmentTemplate.html"),
      "utf8"
    );
    const template = handlebars.compile(templateSource);

    // Prepare data for the template
    // If order is not loaded (re-send), fetch order for template data
    let orderData = order;
    if (!orderData) {
      // Fetch order for template if not present
      const orderDoc = await getDoc(doc(db, "orders", orderId));
      if (!orderDoc.exists()) throw new Error("Order not found (for HTML template)");
      orderData = orderDoc.data();
    }

    const templateData = {
      first_name: orderData.first_name,
      order_id: orderData.order_number || orderId,
      items: items,
      sub_total: (orderData.subtotal_gross ?? 0).toFixed(2),
      shipping: (orderData.shipping_cost ?? 0).toFixed(2),
      total: (orderData.total_gross ?? 0).toFixed(2),
      shipping_address: `${orderData.address}, ${orderData.city}`,
      billing_address: `${orderData.address}, ${orderData.city}`,
      shipping_method: orderData.delivery_option || "",
      payment_method: orderData.payment_method || "",
    };

    // Render the HTML content
    const htmlContent = template(templateData);

    // Send email with HTML body and PDF attachment
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Sofia Padel" <${process.env.SMTP_USER}>`,
      to: recipientEmail || customerEmail,
      subject: `Your So Padel order has been shipped`,
      text: `Thank you for your purchase! Your invoice is attached. Your order reference is: ${invoiceData.orderReference}`,
      html: htmlContent,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    res.status(200).json({
      message: "Invoice PDF sent (re-used if already exists) and stored in Firestore.",
      invoiceNumber,
    });
  } catch (error) {
    console.error("Invoice error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
}
