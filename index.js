require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schemas
const VoterSchema = new mongoose.Schema({
  voterId: { type: String, unique: true, required: true },
  name: String,
  votedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', default: null },
});

const CandidateSchema = new mongoose.Schema({
  name: String,
  category: String,
  votes: { type: Number, default: 0 },
});

const CategorySchema = new mongoose.Schema({
  name: String,
});

const SearchedVotersSchema = new mongoose.Schema({
  voter: { type: mongoose.Schema.Types.ObjectId, ref: 'Voter' },
});

const Voter = mongoose.model('Voter', VoterSchema);
const Candidate = mongoose.model('Candidate', CandidateSchema);
const Category = mongoose.model('Category', CategorySchema);
const SearchedVoter = mongoose.model('SearchedVoter', SearchedVotersSchema);

// WebSocket connection
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Broadcast updated vote tally
const broadcastVoteUpdate = async () => {
  const candidates = await Candidate.find();
  io.emit('voteUpdate', candidates.map((c) => ({ name: c.name, votes: c.votes })));
};

// Routes

// Register a voter
app.post('/voters/register', async (req, res) => {
  try {
    const { voterId, name } = req.body;
    const voter = new Voter({ voterId, name });
    await voter.save();
    res.status(201).json({ message: 'Voter registered successfully', voter });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Search for a voter by voterId and track searched voters
app.get('/voters/search/:voterId', async (req, res) => {
    try {
      const { voterId } = req.params;  // Access the voterId from URL parameters
      const voter = await Voter.findOne({ voterId });
      if (!voter) return res.status(404).json({ message: 'Voter not found' });
  
      // Track searched voters
      await SearchedVoter.deleteMany({});
      await new SearchedVoter({ voter: voter._id }).save();
  
      res.json(voter);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// Fetch the searched voter
app.get('/voters/searched', async (req, res) => {
  try {
    const searched = await SearchedVoter.findOne().populate('voter');
    res.json(searched ? searched.voter : null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a candidate
app.post('/candidates', async (req, res) => {
  try {
    const { name, category } = req.body;
    const candidate = new Candidate({ name, category });
    await candidate.save();
    res.status(201).json(candidate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fetch all candidates
app.get('/candidates', async (req, res) => {
  try {
    const candidates = await Candidate.find();
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a category
app.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const category = new Category({ name });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fetch all categories
app.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vote for a candidate
app.post('/voters/vote', async (req, res) => {
  try {
    const { voterId, candidateId } = req.body;

    // Ensure voter exists and hasn't voted
    const voter = await Voter.findOne({ voterId });
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    if (voter.votedFor) return res.status(400).json({ message: 'Voter has already voted' });

    // Ensure candidate exists
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    // Update vote
    voter.votedFor = candidate._id;
    await voter.save();

    candidate.votes += 1;
    await candidate.save();

    // Broadcast vote update
    await broadcastVoteUpdate();

    res.json({ message: 'Vote cast successfully', voter });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch vote tally
app.get('/votes/tally', async (req, res) => {
  try {
    const candidates = await Candidate.find();
    res.json(candidates.map((c) => ({ name: c.name, votes: c.votes })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
