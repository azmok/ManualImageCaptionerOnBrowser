const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable JSON parsing
// Increase payload size limit (add this before other middleware)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

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
// Increase multer limits
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 300 // Maximum 300 files
  }
});




// --- Routes ---

// Upload images
// Fixed upload route with proper caption handling
app.post('/api/upload', upload.array('images', 300), async (req, res) => {
  try {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    console.log(`Processing ${req.files.length} files...`);
    console.log('Request body captions type:', typeof req.body.captions);
    console.log('Request body captions length:', Array.isArray(req.body.captions) ? req.body.captions.length : 'not array');
    
    // FIX: Properly handle captions from FormData
    let captions = [];
    if (req.body.captions) {
      if (Array.isArray(req.body.captions)) {
        captions = req.body.captions;
      } else {
        // If it's a single string, put it in an array
        captions = [req.body.captions];
      }
    }
    
    // Ensure captions array has the same length as files array
    while (captions.length < req.files.length) {
      captions.push(''); // Fill missing captions with empty strings
    }

    console.log(`Files: ${req.files.length}, Captions: ${captions.length}`);
    
    // Debug: Log first few captions to verify they're not empty
    console.log('First 3 captions:', captions.slice(0, 3));

    const BATCH_SIZE = 10;
    const savedImages = [];
    
    for (let i = 0; i < req.files.length; i += BATCH_SIZE) {
      const batch = req.files.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex;
        const caption = captions[globalIndex] || '';
        
        // Debug: Log filename and caption for troubleshooting
        if (globalIndex < 5) { // Only log first 5 to avoid spam
          console.log(`File ${globalIndex}: ${file.originalname}, Caption: "${caption}"`);
        }

        const newImage = new ImageModel({
          filename: file.originalname,
          data: file.buffer,
          contentType: file.mimetype,
          caption: caption.trim() // Trim whitespace
        });

        return await newImage.save();
      });

      const batchResults = await Promise.all(batchPromises);
      savedImages.push(...batchResults);
      
      console.log(`Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(req.files.length/BATCH_SIZE)}`);
    }

    console.log(`Successfully saved ${savedImages.length} images`);
    
    // Count how many images actually have captions
    const imagesWithCaptions = savedImages.filter(img => img.caption && img.caption.trim() !== '').length;
    console.log(`Images with non-empty captions: ${imagesWithCaptions}`);
    
    const responseData = savedImages.map(img => ({
      _id: img._id,
      filename: img.filename,
      contentType: img.contentType,
      caption: img.caption,
      timestamp: img.timestamp
    }));

    res.status(200).json({
      message: `Successfully uploaded ${savedImages.length} images (${imagesWithCaptions} with captions)`,
      count: savedImages.length,
      captionedCount: imagesWithCaptions,
      images: responseData.slice(0, 10)
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: 'Invalid data provided', error: error.message });
    } else if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'File too large', error: error.message });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      res.status(413).json({ message: 'Too many files', error: error.message });
    } else if (error.message.includes('Invalid string length')) {
      res.status(200).json({
        message: `Successfully uploaded images but response too large`,
        count: req.files ? req.files.length : 0,
        note: 'Images saved successfully, refresh to see them'
      });
    } else {
      res.status(500).json({ message: 'Failed to upload images', error: error.message });
    }
  }
});

// Add middleware to handle larger payloads if needed
app.use('/api/upload', express.raw({ 
  limit: '200mb', // Increase limit for upload endpoint specifically
  type: 'multipart/form-data'
}));






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

