const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// On Render, we can use a persistent disk. By default we use the current folder.
const DATA_DIR = process.env.DISK_PATH || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

app.use(cors());
app.use(express.json());

// Serve static frontend files from current directory
app.use(express.static(path.join(__dirname, '.')));

// Initialize data from JSON
let trips = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    if (data.trim()) {
      trips = JSON.parse(data);
    }
  }
} catch (e) {
  console.error('Error reading data file:', e);
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(trips, null, 2));
  } catch (e) {
    console.error('Error writing data file:', e);
  }
}

// ==== API Endpoints ====

// 1. Get all trips for a user
app.get('/api/trips/user/:userId', (req, res) => {
  const userId = req.params.userId;
  // Solo devolvemos los viajes donde el usuario es miembro
  const userTrips = trips.filter(t => t.members.some(m => m.id === userId));
  res.json(userTrips);
});

// 2. Get a single trip by ID
app.get('/api/trips/:id', (req, res) => {
  const trip = trips.find(t => t.id === req.params.id);
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  res.json(trip);
});

// 3. Create a new trip
app.post('/api/trips', (req, res) => {
  const newTrip = req.body;
  trips.push(newTrip);
  saveData();
  res.status(201).json(newTrip);
});

// 4. Join a trip via code
app.post('/api/trips/join', (req, res) => {
  const { code, user } = req.body;
  
  if (!code || !user) {
    return res.status(400).json({ error: 'Missing code or user data' });
  }

  const trip = trips.find(t => t.code.toUpperCase() === code.toUpperCase());
  if (!trip) {
    return res.status(404).json({ error: 'Viaje no encontrado' });
  }

  // Si no es miembro aún, lo agregamos
  if (!trip.members.some(m => m.id === user.id)) {
    trip.members.push(user);
    saveData();
  }

  res.json(trip);
});

// 5. Update an entire trip (add/edit activities, expenses, etc.)
app.put('/api/trips/:id', (req, res) => {
  const index = trips.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  
  // Reemplazamos los datos del viaje con el nuevo cuerpo
  trips[index] = { ...trips[index], ...req.body };
  saveData();
  res.json(trips[index]);
});

// 6. Delete a trip
app.delete('/api/trips/:id', (req, res) => {
  const index = trips.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  
  trips.splice(index, 1);
  saveData();
  res.status(204).send();
});

// Fallback to index.html for SPA (though the frontend uses hash routing anyway)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
