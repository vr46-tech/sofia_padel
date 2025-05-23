import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import nodemailer from "nodemailer";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { InvoicePDF } from "../../components/pdf/InvoicePDF"; // Adjust path as needed

// Firebase config
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
      });
    }

    // Prepare invoice data
    const invoiceProps = {
      invoiceNumber: `INV-${orderId.slice(-6).toUpperCase()}`,
      issueDate: new Date().toISOString().slice(0, 10),
      company: {
        name: "Sofia Padel",
        address: "123 Avenue Padel",
        city: "Sofia",
        vatNumber: "BG123456789",
      },
      customer: {
        name: `${order.first_name} ${order.last_name}`,
        address: order.address,
        city: order.city,
        postalCode: order.postal_code,
        phone: order.phone,
      },
      items,
      shippingCost: order.shipping_cost || 0,
      basePrice: order.base_price || 0,
      paymentMethod:
        order.payment_method === "card"
          ? "Pay by Card on Delivery"
          : "Cash on Delivery",
    };

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(<InvoicePDF {...invoiceProps} />);

    // Send email with PDF attached
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
      to: order.user_email,
      subject: "Your Invoice - Sofia Padel",
      text: "Thank you for your purchase! Your invoice is attached.",
      attachments: [
        {
          filename: `${invoiceProps.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    res.status(200).json({ message: "Invoice PDF sent to customer." });
  } catch (error) {
    console.error("Invoice error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
}
