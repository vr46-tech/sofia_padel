import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { term, countryId } = req.body;
  if (!term) {
    return res.status(400).json({ error: 'Missing search term.' });
  }

  try {
    const response = await axios.post(
      'https://services.speedy.bg/api/location/site/',
      {
        userName: process.env.SPEEDY_USER,
        password: process.env.SPEEDY_PASS,
        language: 'EN',
        countryId: countryId || 100, // Default to Bulgaria if not provided
        name: term
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    res.status(200).json(response.data.sites || []);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error || error.message });
  }
}
