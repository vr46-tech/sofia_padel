const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Speedy API credentials (set in .env)
const SPEEDY_USER = process.env.SPEEDY_USER;
const SPEEDY_PASS = process.env.SPEEDY_PASS;

// Helper: Speedy API POST request
async function speedyApiRequest(endpoint, data) {
  const url = `https://services.speedy.bg/api/${endpoint}`;
  const payload = {
    userName: SPEEDY_USER,
    password: SPEEDY_PASS,
    language: 'EN',
    ...data
  };
  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  return response.data;
}

// 1. Autocomplete Sites (Cities)
app.get('/autocomplete/sites', async (req, res) => {
  const { term } = req.query;
  if (!term) return res.status(400).json({ error: 'Missing search term.' });
  try {
    const data = await speedyApiRequest('location/site/', { name: term });
    // Returns array of sites (cities/towns)
    res.json(data.sites || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Autocomplete Streets (within a city)
app.get('/autocomplete/streets', async (req, res) => {
  const { siteId, term } = req.query;
  if (!siteId || !term) return res.status(400).json({ error: 'Missing siteId or term.' });
  try {
    const data = await speedyApiRequest('location/street/', { siteId: Number(siteId), name: term });
    // Returns array of streets in the specified city
    res.json(data.streets || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Autocomplete API running on http://localhost:${PORT}`);
});
