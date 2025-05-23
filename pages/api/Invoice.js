import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, Timestamp } from "firebase/firestore";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import nodemailer from "nodemailer";
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

// Helper to get the next unique invoice number
async function getNextInvoiceNumber() {
  const counterRef = doc(db, "config", "invoiceCounter");
  let newNumber;
  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let current = 100000001; // 0100000001
    if (counterDoc.exists()) {
      current = counterDoc.data().current || current;
    }
    newNumber = current;
    transaction.set(counterRef, { current: current + 1 }, { merge: true });
  });
  // Format as string with leading zeros
  return newNumber.toString().padStart(10, "0");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const { orderId, currency = "BGN", recipientEmail } = req.body;
  if (!orderId) {
    res.status(400).json({ message: "Missing orderId in request body" });
    return;
  }

  try {
    // 1. Check if invoice already exists for this order
    const invoicesRef = collection(db, "invoices");
    const existingInvoiceSnap = await getDocs(query(invoicesRef, where("orderId", "==", orderId)));
    let invoiceData, pdfBuffer, invoiceNumber, customerEmail;

    if (!existingInvoiceSnap.empty) {
      // Invoice exists: re-send it
      const invoiceDoc = existingInvoiceSnap.docs[0].data();
      invoiceData = invoiceDoc;
      invoiceNumber = invoiceDoc.invoiceNumber;
      customerEmail = invoiceDoc.user_email;
      // Convert base64 back to Buffer
      pdfBuffer = Buffer.from(invoiceDoc.pdfBase64, "base64");
    } else {
      // Invoice does not exist: generate, store, and send
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

      invoiceNumber = await getNextInvoiceNumber();
      const issueDate = new Date().toISOString().slice(0, 10);

      // Generate PDF buffer
      pdfBuffer = await renderToBuffer(
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
          currency={currency}
          orderReference={orderId}
        />
      );

      // Convert PDF buffer to base64 for Firestore storage
      const pdfBase64 = pdfBuffer.toString("base64");

      // Store invoice in Firestore
      invoiceData = {
        orderId,
        orderReference: orderId,
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
        currency,
        createdAt: Timestamp.now(),
        pdfBase64,
      };

      await addDoc(invoicesRef, invoiceData);
      customerEmail = order.user_email;
    }

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
      to: recipientEmail || customerEmail,
      subject: "Your Invoice - Sofia Padel",
      text: `Thank you for your purchase! Your invoice is attached. Your order reference is: ${orderId}`,
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
