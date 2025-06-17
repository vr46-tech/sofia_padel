import axios from 'axios';

export default async function handler(req, res) {
  const { term } = req.query;
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
        name: term
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // Return the array of sites (cities/towns)
    res.status(200).json(response.data.sites || []);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error || error.message });
  }
}
