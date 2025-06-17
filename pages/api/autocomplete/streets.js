import axios from 'axios';

export default async function handler(req, res) {
  const { siteId, term } = req.query;
  if (!siteId || !term) {
    return res.status(400).json({ error: 'Missing siteId or term.' });
  }

  try {
    const response = await axios.post(
      'https://services.speedy.bg/api/location/street/',
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
