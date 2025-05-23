import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, Timestamp, runTransaction } from "firebase/firestore";
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
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.VERCEL_API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  } // <-- MISSING BRACE ADDED HERE

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  // ... rest of your code remains unchanged ...
}
