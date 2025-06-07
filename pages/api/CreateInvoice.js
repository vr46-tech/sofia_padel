import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, Timestamp, runTransaction } from "firebase/firestore";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import nodemailer from "nodemailer";
import { InvoicePDF } from "../../components/pdf/InvoicePDF";

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

  const { orderId, currency = "BGN", recipientEmail } = req.body;
  if (!orderId) {
    res.status(400).json({ message: "Missing orderId in request body" });
    return;
  }

  try {
    // Check if invoice already exists for this order
    const invoicesRef = collection(db, "invoices");
    const existingInvoiceSnap = await getDocs(query(invoicesRef, where("orderId", "==", orderId)));
    let invoiceData, pdfBuffer, invoiceNumber, customerEmail;

    if (!existingInvoiceSnap.empty) {
      // Invoice exists: re-send it
      const invoiceDoc = existingInvoiceSnap.docs[0].data();
      invoiceData = invoiceDoc;
      invoiceNumber = invoiceDoc.invoiceNumber;
      customerEmail = invoiceDoc.user_email;
      pdfBuffer = Buffer.from(invoiceDoc.pdfBase64, "base64");
    } else {
      // Invoice does not exist: generate, store, and send
      const orderDoc = await getDoc(doc(db, "orders", orderId));
      if (!orderDoc.exists()) throw new Error("Order not found");
      const order = orderDoc.data();

      // Prepare invoice items with all new fields, safely accessed
      const items = [];
      for (const item of order.items || []) {
        let productName = item.name || "Unknown Product";
        let image_url = "";
        let brand = "";
        if (item.product_id) {
          const productDoc = await getDoc(doc(db, "products", item.product_id));
          if (productDoc.exists()) {
            const data = productDoc.data();
            if (data.name) productName = data.name;
            if (data.image_url) image_url = data.image_url;
            // Fetch brand from either brand_name or brand, whichever is present
            brand = data.brand_name || data.brand || "";
          }
        }
        items.push({
          name: productName,
          brand,
          quantity: item.quantity,
          unit_price: item.unit_price_gross ?? 0,
          unit_price_net: item.unit_price_net ?? 0,
          unit_vat_amount: item.unit_vat_amount ?? 0,
          vat_rate: item.vat_rate ?? 0.2,
          line_total_gross: item.line_total_gross ?? 0,
          line_total_net: item.line_total_net ?? 0,
          line_vat_amount: item.line_vat_amount ?? 0,
          image_url,
          discounted: item.discounted ?? false,
          discount_percent: item.discount_percent ?? 0,
          original_price_gross: item.original_price_gross ?? 0,
        });
      }

      // Use order's calculated totals
      const subtotal_net = order.subtotal_net ?? 0;
      const subtotal_gross = order.subtotal_gross ?? 0;
      const vat_total = order.vat_total ?? order.subtotal_vat_amount ?? 0;
      const shipping_cost = order.shipping_cost ?? 0;
      const total_gross = order.total_gross ?? 0;

      invoiceNumber = await getNextInvoiceNumber();
      const issueDate = new Date().toISOString().slice(0, 10);

      // Debug: Log the items structure before generating PDF
      console.log("Invoice items before PDF generation:", JSON.stringify(items, null, 2));

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
          shippingCost={shipping_cost}
          subtotalNet={subtotal_net}
          subtotalGross={subtotal_gross}
          vatTotal={vat_total}
          total={total_gross}
          paymentMethod={
            order.payment_method === "card"
              ? "Pay by Card on Delivery"
              : "Cash on Delivery"
          }
          currency={currency}
          orderReference={order.order_number || orderId}
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
        items,
        subtotalNet: subtotal_net,
        subtotalGross: subtotal_gross,
        vatTotal: vat_total,
        shippingCost: shipping_cost,
        total: total_gross,
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
      subject: `Your Invoice - Sofia Padel`,
      text: `Thank you for your purchase! Your invoice is attached. Your order reference is: ${invoiceData.orderReference}`,
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
