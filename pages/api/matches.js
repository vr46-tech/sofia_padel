import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, Timestamp } from "firebase/firestore";

// Firebase Configuration (Ensure these are set in Vercel Environment Variables)
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

// Enable debug mode from environment variable
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Logging function
function log(message, data) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`, data || "");
  }
}

// API Handler
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    log("Received query parameters:", req.query);

    const { date, skillLevel, status, location, userId } = req.query;
    let matchesQuery = collection(db, "matches");
    let filters = [];

    // ✅ Convert Date to Firestore Timestamp
    if (date && date !== "all") {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        const firestoreTimestamp = Timestamp.fromDate(parsedDate);
        filters.push(where("date", "==", firestoreTimestamp));
        log("Date filter applied:", firestoreTimestamp);
      } else {
        console.error("Invalid date format received:", date);
        return res.status(400).json({ error: "Invalid date format" });
      }
    }

    // ✅ Convert Strings to Ensure Firestore Type Match
    if (skillLevel && skillLevel !== "all") {
      filters.push(where("skillLevel", "==", skillLevel.toString()));
      log("Skill Level filter applied:", skillLevel.toString());
    }

    if (status && status !== "all") {
      filters.push(where("status", "==", status.toString()));
      log("Status filter applied:", status.toString());
    }

    if (location && location !== "All Locations") {
      filters.push(where("location", "==", location.toString()));
      log("Location filter applied:", location.toString());
    }

    // ✅ Handle Player Filtering
    if (userId) {
      filters.push(where("players", "array-contains", userId));
      log("Player filter applied:", userId);
    }

    // ✅ Log Firestore Filters Before Query Execution
    filters.forEach((f) => log(`Applying Firestore filter: ${JSON.stringify(f)}`));

    // Apply filters
    if (filters.length > 0) {
      matchesQuery = query(matchesQuery, ...filters);
    }

    // Execute Firestore Query
    const snapshot = await getDocs(matchesQuery);
    const matches = snapshot.docs.map((doc) => {
      const matchData = doc.data();
      return {
        id: doc.id,
        ...matchData,
        date: matchData.date.toDate(), // Convert Firestore Timestamp to JS Date
        createdAt: matchData.createdAt.toDate(),
      };
    });

    log("Fetched matches from Firestore", { count: matches.length });

    return res.status(200).json({ matches });
  } catch (error) {
    console.error("[ERROR] Fetching matches failed:", error);

    return res.status(500).json({
      error: "Failed to fetch matches",
      details: error.message,
    });
  }
}
