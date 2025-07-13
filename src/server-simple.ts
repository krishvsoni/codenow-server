/*
CodeNow Server - Vercel Compatible Version
Based on the working simple version with MongoDB integration
*/
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// MongoDB Schema
const codeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  url: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

const Code = mongoose.model('Code', codeSchema);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://codenow.vercel.app", "https://codenow.krishsoni.co"],
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const codeStore: { [key: string]: string } = {};

// Database connection with error handling
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      console.log('MongoDB URI not found, running without database');
      return;
    }

    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.log('MongoDB connection failed, running without database:', error);
  }
};

// Helper function to safely use database
const safeDbOperation = async (operation: () => Promise<any>) => {
  if (!isConnected) return null;
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error);
    return null;
  }
};

app.get('/', (req, res) => {
  res.json({ message: 'CodeNow server is running' });
});

app.post('/api/saveCode', async (req, res) => {
  const { id, code } = req.body;
  codeStore[id] = code;
  
  // Try to save to database, but don't fail if it doesn't work
  await safeDbOperation(async () => {
    await Code.findOneAndUpdate(
      { id },
      { id, code, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`Code saved to MongoDB for ID: ${id}`);
  });
  
  res.status(200).json({ message: 'Code saved successfully' });
});

app.get('/api/getCode/:id', async (req, res) => {
  const { id } = req.params;
  let code = codeStore[id];
  
  // If not in memory, try database
  if (!code) {
    const codeDoc = await safeDbOperation(async () => {
      return await Code.findOne({ id });
    });
    
    if (codeDoc) {
      code = codeDoc.code;
      codeStore[id] = code;
    }
  }
  
  if (code) {
    res.status(200).json({ code });
  } else {
    res.status(404).json({ error: 'Code not found' });
  }
});

// Additional endpoints for the full functionality
app.get('/api/getAllCodes', async (req, res) => {
  const codes = await safeDbOperation(async () => {
    return await Code.find({}).sort({ updatedAt: -1 }).limit(100);
  });
  
  res.status(200).json({ codes: codes || [] });
});

app.get('/api/getRecentBackups', async (req, res) => {
  const backups = await safeDbOperation(async () => {
    return await Code.find({
      $or: [
        { url: 'shared-session' },
        { url: 'disconnect-backup' },
        { id: { $regex: '^(shared-session|disconnect-backup)' } }
      ]
    }).sort({ updatedAt: -1 }).limit(20);
  });
  
  res.status(200).json({ backups: backups || [] });
});

app.delete('/api/deleteCode/:id', async (req, res) => {
  const { id } = req.params;
  delete codeStore[id];
  
  await safeDbOperation(async () => {
    await Code.findOneAndDelete({ id });
  });
  
  res.status(200).json({ message: 'Code deleted successfully' });
});

app.post('/api/autoSave', async (req, res) => {
  const { code, type = 'shared-session' } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  const defaultId = `${type}-${new Date().toISOString().split('T')[0]}`;
  
  await safeDbOperation(async () => {
    await Code.findOneAndUpdate(
      { id: defaultId },
      { id: defaultId, code, url: type, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  });
  
  res.status(200).json({ message: 'Code auto-saved successfully' });
});

let sharedCode = '';

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('message', 'Welcome to the code sharing service!');

  if (sharedCode) {
    socket.emit('codeUpdate', sharedCode);
  }

  socket.on('codeChange', async ({ newCode, url }) => {
    if (newCode !== undefined) {
      sharedCode = newCode;
      console.log(`Code change from URL: ${url || 'Unknown URL'}`);
      
      // Save to database if available
      if (url) {
        const id = url.split('/').pop() || url;
        await safeDbOperation(async () => {
          await Code.findOneAndUpdate(
            { id },
            { id, code: newCode, url, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        });
      }
      
      socket.broadcast.emit('codeUpdate', newCode);
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (sharedCode) {
      const disconnectId = 'disconnect-backup-' + Date.now();
      await safeDbOperation(async () => {
        await Code.findOneAndUpdate(
          { id: disconnectId },
          { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() },
          { upsert: true, new: true }
        );
      });
    }
  });
});

const PORT = process.env.PORT || 3001;

// Initialize database connection
connectDB();

httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
