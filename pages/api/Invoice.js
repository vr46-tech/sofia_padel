import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, Timestamp } from "firebase/firestore";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { InvoicePDF } from "../../components/pdf/InvoicePDF";

// Firebase config and initialization (client SDK)
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ message: "Missing orderId in request body" });
    return;
  }

  try {
    // Fetch order
    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (!orderDoc.exists()) throw new Error("Order not found");
    const order = orderDoc.data();

    // Fetch product info for each item
    const items = [];
    for (const item of order.items || []) {
      let productName = item.name;
      let image_url = "";
      let brand = "";
      if (item.product_id) {
        const productDoc = await getDoc(doc(db, "products", item.product_id));
        if (productDoc.exists()) {
          const data = productDoc.data();
          if (data.name) productName = data.name;
          if (data.image_url) image_url = data.image_url;
          if (data.brand_name) brand = data.brand_name;
        }
      }
      items.push({
        name: productName,
        brand,
        quantity: item.quantity,
        price: item.price,
        image_url,
        total: item.price * item.quantity,
      });
    }

    // Prepare invoice data
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = order.shipping_cost || 0;
    const basePrice = order.base_price || 0;
    const totalBeforeVAT = subtotal + shippingCost + basePrice;
    const vatAmount = totalBeforeVAT * 0.2;
    const total = totalBeforeVAT + vatAmount;

    const invoiceNumber = `INV-${orderId.slice(-6).toUpperCase()}`;
    const issueDate = new Date().toISOString().slice(0, 10);

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      <InvoicePDF
        invoiceNumber={invoiceNumber}
        issueDate={issueDate}
        company={{
          name: "Sofia Padel",
          address: "123 Avenue Padel",
          city: "Sofia",
          vatNumber: "BG123456789",
        }}
        customer={{
          name: `${order.first_name} ${order.last_name}`,
          address: order.address,
          city: order.city,
          postalCode: order.postal_code,
          phone: order.phone,
        }}
        items={items}
        shippingCost={shippingCost}
        basePrice={basePrice}
        paymentMethod={
          order.payment_method === "card"
            ? "Pay by Card on Delivery"
            : "Cash on Delivery"
        }
      />
    );

    // Convert Buffer to base64 for Firestore (since Firestore client SDK does not support Blob directly in Node.js)
    const pdfBase64 = pdfBuffer.toString("base64");

    // Store invoice in Firestore
    const invoiceDoc = {
      orderId,
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
      items,
      subtotal,
      shippingCost,
      basePrice,
      vatAmount,
      total,
      paymentMethod:
        order.payment_method === "card"
          ? "Pay by Card on Delivery"
          : "Cash on Delivery",
      createdAt: Timestamp.now(),
      pdfBase64, // Store the PDF as a base64 string
    };

    await addDoc(collection(db, "invoices"), invoiceDoc);

    res.status(200).json({
      message: "Invoice PDF saved as blob in Firestore invoice record.",
      invoiceNumber,
    });
  } catch (error) {
    console.error("Invoice error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
}
