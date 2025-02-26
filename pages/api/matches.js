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

// Enable debug mode
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
        log("Received query parameters", req.query);
        const { date, skillLevel, status, location, userId } = req.query;
        let matchesQuery = collection(db, "matches");
        let filters = [];

        // ✅ Date Filter (with detailed logging)
        if (date && date !== "all") {
            try {
                const parsedDate = new Date(date);
                if (!isNaN(parsedDate.getTime())) {
                    const timestamp = Timestamp.fromDate(parsedDate);
                    filters.push(where("date", "==", timestamp));
                    log(`Date filter applied: Date String: ${date}, Timestamp: ${timestamp}`);  //More details
                } else {
                    console.error("Invalid date format received:", date);
                    return res.status(400).json({ error: "Invalid date format" });
                }
            } catch (dateError) {
                console.error("Error parsing date:", dateError);
                return res.status(400).json({ error: "Invalid date format" });
            }
        }

        // ✅ Skill Level Filter (with type check)
        if (skillLevel && skillLevel !== "all") {
            log(`SkillLevel filter - Expected Type: STRING, Value Received: ${skillLevel}, Type: ${typeof skillLevel}`); // Added type check
            filters.push(where("skillLevel", "==", skillLevel));  // removed toString()
        }

        // ✅ Status Filter (with type check)
        if (status && status !== "all") {
            log(`Status filter - Expected Type: STRING, Value Received: ${status}, Type: ${typeof status}`); // Added type check
            filters.push(where("status", "==", status)); // removed toString()
        }

        // ✅ Location Filter (with type check)
        if (location && location !== "All Locations") {
            log(`Location filter - Expected Type: STRING, Value Received: ${location}, Type: ${typeof location}`); // Added type check
            filters.push(where("location", "==", location));  // removed toString()
        }

        // ✅ User ID Filter (with type check)
        if (userId) {
            log(`UserID filter - Expected Type: STRING, Value Received: ${userId}, Type: ${typeof userId}`); // Added type check
            filters.push(where("players", "array-contains", userId));
        }

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
                date: matchData.date?.toDate ? matchData.date.toDate() : matchData.date,
                createdAt: matchData.createdAt?.toDate ? matchData.createdAt.toDate() : matchData.createdAt,
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
