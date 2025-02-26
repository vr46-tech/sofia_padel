import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, Timestamp } from "firebase/firestore";

// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    console.log("🔹 [LOG] Incoming GET Request - Query Params:", JSON.stringify(req.query, null, 2));

    // ✅ Ensure query parameters are correctly formatted
    const status = req.query.status || null;
    const date = req.query.date || null;
    const skillLevel = req.query.skillLevel || null;
    const location = req.query.location || null;
    const userId = req.query.userId || null;

    console.log("✅ [LOG] Extracted Query Params:", { date, skillLevel, status, location, userId });

    let matchesRef = collection(db, "matches");
    let filters = [];

    // ✅ Convert Date to Firestore Timestamp
    if (date && date !== "all") {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        const firestoreTimestamp = Timestamp.fromDate(parsedDate);
        filters.push(where("date", "==", firestoreTimestamp));
        console.log("✅ [LOG] Date filter applied:", firestoreTimestamp);
      } else {
        console.error("❌ [ERROR] Invalid date format received:", date);
        return res.status(400).json({ error: "Invalid date format" });
      }
    }

    // ✅ Apply Skill Level Filter
    if (skillLevel && skillLevel !== "all") {
      filters.push(where("skillLevel", "==", skillLevel.toString()));
      console.log("✅ [LOG] Skill Level filter applied:", skillLevel.toString());
    }

    // ✅ Apply Status Filter
    if (status && status !== "all") {
      filters.push(where("status", "==", status.toString()));
      console.log("✅ [LOG] Status filter applied:", status.toString());
    }

    // ✅ Apply Location Filter
    if (location && location !== "All Locations") {
      filters.push(where("location", "==", location.toString()));
      console.log("✅ [LOG] Location filter applied:", location.toString());
    }

    // ✅ Handle Player Filtering
    if (userId) {
      filters.push(where("players", "array-contains", userId));
      console.log("✅ [LOG] Player filter applied:", userId);
    }

    // ✅ Apply Filters to Firestore Query
    if (filters.length > 0) {
      console.log("🔍 [LOG] Filters applied:", filters.map(f => f.fieldPath?.fieldName || f));
      matchesRef = query(matchesRef, ...filters);
    } else {
      console.log("⚠️ [LOG] No filters applied. Fetching all matches.");
    }

    // Execute Firestore Query
    const snapshot = await getDocs(matchesRef);
    const matches = snapshot.docs.map((doc) => {
      const matchData = doc.data();
      return {
        id: doc.id,
        ...matchData,
        date: matchData.date?.toDate ? matchData.date.toDate() : matchData.date, // Ensure proper conversion
        createdAt: matchData.createdAt?.toDate ? matchData.createdAt.toDate() : matchData.createdAt,
      };
    });

    console.log("✅ [LOG] Matches Fetched - Count:", matches.length);
    console.log("📄 [LOG] Matches Data:", JSON.stringify(matches, null, 2));

    return res.status(200).json({ matches });
  } catch (error) {
    console.error("❌ [ERROR] Fetching matches failed:", error);

    return res.status(500).json({
      error: "Failed to fetch matches",
      details: error.message,
    });
  }
}
