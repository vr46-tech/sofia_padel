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
      'https://api.speedy.bg/v1/location/site/',
      {
        userName: process.env.SPEEDY_USER,
        password: process.env.SPEEDY_PASS,
        language: 'EN',
        countryId: countryId || 100,
        postCode: term
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return res.status(200).json(response.data.sites || []);
  } catch (error) {
    console.error('Speedy API error:', {
      message: error.message,
      responseData: error.response?.data || null,
      status: error.response?.status || null,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Speedy API request failed',
      details: error.response?.data || error.message
    });
  }
}
