import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { siteId, term } = req.body;
  if (!siteId || !term) {
    return res.status(400).json({ error: 'Missing siteId or term.' });
  }

  try {
    const response = await axios.post(
      'https://api.speedy.bg/v1/location/street/',
      {
        userName: process.env.SPEEDY_USER,
        password: process.env.SPEEDY_PASS,
        language: 'EN',
        siteId: Number(siteId),
        name: term
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // Return the array of streets for the specified city
    res.status(200).json(response.data.streets || []);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error || error.message });
  }
}
