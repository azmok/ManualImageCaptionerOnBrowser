const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable JSON parsing
app.use(express.json());
app.use(cors());
app.use(express.static('public', {
  maxAge: 0 // disable server-side caching
}));



// --- MongoDB setup ---
mongoose.connect('mongodb://localhost:27017/imageUploads')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));


// --- MongoDB Schema ---
const imageSchema = new mongoose.Schema({
  filename: String,
  data: Buffer,
  contentType: String,
  caption: String,
  timestamp: { type: Date, default: Date.now }
});

const ImageModel = mongoose.model('Image', imageSchema);

// --- Multer memory storage ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Routes ---

// Upload images
app.post('/api/upload', upload.array('images', 300), async (req, res) => {
  try {
    const captions = Array.isArray(req.body.captions)
      ? req.body.captions
      : [req.body.captions];

    const savedImages = [];

    for (let i = 0; i < req.files.length; i++) {

      const file = req.files[i];
      const caption = captions[i] || '';

      const newImage = new ImageModel({
        filename: file.originalname,
        data: file.buffer,
        contentType: file.mimetype,
        caption
      });

      const saved = await newImage.save();
      savedImages.push(saved);
    }

    res.status(200).json(savedImages);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload images', error: error.message });
  }
});

// Get all images (metadata only, not buffer)
app.get('/api/images', async (req, res) => {
  try {
    const images = await ImageModel.find({}, { data: 0 }).sort({ timestamp: -1 });
    res.json(images);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch images', error: error.message });
  }
});

// Get image by ID (returns actual image)
app.get('/api/images/:id', async (req, res) => {
  try {
    const image = await ImageModel.findById(req.params.id);
    if (!image) return res.status(404).send('Image not found');

    res.contentType(image.contentType);
    res.send(image.data);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch image', error: error.message });
  }
});

// Update caption
app.put('/api/images/:id', async (req, res) => {
  try {
    const { caption } = req.body;
    const updated = await ImageModel.findByIdAndUpdate(
      req.params.id,
      { caption },
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update caption', error: error.message });
  }
});

// Delete image
app.delete('/api/images/:id', async (req, res) => {
  try {
    await ImageModel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Image deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete image', error: error.message });
  }
});

// Delete all images
app.delete('/api/images', async (req, res) => {
  try {
    await ImageModel.deleteMany({});
    res.json({ message: 'All images deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete images', error: error.message });
  }
});

// Serve frontend
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


