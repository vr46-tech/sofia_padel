import type { NextApiRequest, NextApiResponse } from 'next';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Config
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

// Debug Mode
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Logging Function
const log = (message: string, data?: any) => {
  if (DEBUG_MODE) console.log(`[DEBUG] ${message}`, data || '');
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    log('Incoming request', { query: req.query });

    const { date, skillLevel, status, location } = req.query;
    let matchesQuery = collection(db, 'matches');
    let filters = [];

    if (date && date !== 'all') {
      const parsedDate = new Date(date as string);
      log('Filtering by date', parsedDate);
      filters.push(where('date', '==', parsedDate));
    }
    if (skillLevel && skillLevel !== 'all') {
      log('Filtering by skill level', skillLevel);
      filters.push(where('skillLevel', '==', skillLevel as string));
    }
    if (status && status !== 'all') {
      log('Filtering by status', status);
      filters.push(where('status', '==', status as string));
    }
    if (location && location !== 'All Locations') {
      log('Filtering by location', location);
      filters.push(where('location', '==', location as string));
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

    res.status(200).json({ matches });
  } catch (error) {
    console.error('[ERROR] Fetching matches failed:', error);

    res.status(500).json({
      error: 'Failed to fetch matches',
      details: error.message
    });
  }
}
