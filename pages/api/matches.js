import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Config (Ensure these are set in your Vercel Environment Variables)
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
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Logging Function
function log(message, data) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

// Main API Handler
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    log('Incoming request', { query: req.query });

    const { date, skillLevel, status, location } = req.query;
    let matchesQuery = collection(db, 'matches');
    let filters = [];

    if (date && date !== 'all') {
      const parsedDate = new Date(date);
      log('Filtering by date', parsedDate);
      filters.push(where('date', '==', parsedDate));
    }
    if (skillLevel && skillLevel !== 'all') {
      log('Filtering by skill level', skillLevel);
      filters.push(where('skillLevel', '==', skillLevel));
    }
    if (status && status !== 'all') {
      log('Filtering by status', status);
      filters.push(where('status', '==', status));
    }
    if (location && location !== 'All Locations') {
      log('Filtering by location', location);
      filters.push(where('location', '==', location));
    }

    if (filters.length > 0) {
      matchesQuery = query(matchesQuery, ...filters);
    }

    log('Final Firestore query built', { filters });

    const snapshot = await getDocs(matchesQuery);
    const matches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    log('Fetched matches from Firestore', { count: matches.length });

    return res.status(200).json({ matches });
  } catch (error) {
    console.error('[ERROR] Fetching matches failed:', error);

    return res.status(500).json({
      error: 'Failed to fetch matches',
      details: error.message
    });
  }
}
