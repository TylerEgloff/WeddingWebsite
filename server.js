require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for frontend
app.use(express.json()); // Parse JSON

// Serve static files from public
app.use(express.static('public'));

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Store request counts per IP for rate limiting
const requestCounts = {};

// Custom rate limiter middleware for RSVP submissions
// https://medium.com/@ignatovich.dm/creating-a-simple-api-rate-limiter-with-node-a834d03bad7a
const rateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, lastRequest: now };
  } else {
    const timeSinceLastRequest = now - requestCounts[ip].lastRequest;
    const timeLimit = 15 * 60 * 1000; // 15 minutes

    if (timeSinceLastRequest < timeLimit) {
      requestCounts[ip].count += 1;
    } else {
      requestCounts[ip] = { count: 1, lastRequest: now }; // Reset after time window
    }
  }

  const maxRequests = 3;

  if (requestCounts[ip].count > maxRequests) {
    return res.status(429).json({ message: 'Too many requests, please try again later.' });
  }

  requestCounts[ip].lastRequest = now;
  next();
};

// Routes
app.get('/', (req, res) => {
  res.send('Wedding RSVP Server Running');
});

// Endpoint for searching guests and finding their party 
app.post('/api/search-guests', async (req, res) => {
  const { query } = req.body;

  try {
    const cleanQuery = query.trim();
    // Split the query into words
    const words = cleanQuery.split(/\s+/);

    let supabaseQuery = supabase
      .from('guests')
      .select(`
        *,
        parties:party_id (party_name, has_responded)
      `);

    if (words.length === 1) {
      // Single word search (first or last )
      supabaseQuery = supabaseQuery.or(
        `first_name.ilike.%${words[0]}%,last_name.ilike.%${words[0]}%`
      );
    } else if (words.length >= 2) {
      // Multiple word search (first and last)
      const firstName = words[0];
      const lastName = words.slice(1).join(' ');
      supabaseQuery = supabaseQuery.or(
        `and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),` +
        `and(first_name.ilike.%${lastName}%,last_name.ilike.%${firstName}%)`
      );
    }

    const { data: guests, error: guestError } = await supabaseQuery;

    if (guestError) throw guestError;
    if (!guests || guests.length === 0) {
      return res.json({ error: 'Guest not found' });
    }

    // Filter out completely null guests (plus ones with no name)
    const filteredGuests = guests.filter(guest =>
      guest.first_name || guest.last_name || guest.is_plus_one
    );

    // Group guests by party
    const partiesMap = new Map();
    filteredGuests.forEach(guest => {
      if (!partiesMap.has(guest.party_id)) {
        partiesMap.set(guest.party_id, {
          party_id: guest.party_id,
          party_name: guest.parties.party_name,
          has_responded: guest.parties.has_responded,
          guests: []
        });
      }
      partiesMap.get(guest.party_id).guests.push(guest);
    });

    res.json(Array.from(partiesMap.values()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get all guests of a party 
app.post('/api/get-party-guests', async (req, res) => {
  const { partyId } = req.body;

  try {
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .eq('party_id', partyId);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply rate limiter only to RSVP submission endpoint
app.post('/api/submit-rsvp', rateLimiter, async (req, res) => {
  const { guestUpdates, partyId, honeypot } = req.body;

  if (honeypot) {
    return res.status(400).json({ error: 'Bot detected.' });
  }

  try {
    // Update guest attendance
    const { error: guestError } = await supabase
      .from('guests')
      .upsert(guestUpdates);

    if (guestError) throw guestError;

    // Mark party as responded
    const { error: partyError } = await supabase
      .from('parties')
      .update({ has_responded: true })
      .eq('party_id', partyId);

    if (partyError) throw partyError;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});