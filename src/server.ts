/*
Official File For CodeNow Server
This file handles the server-side logic for CodeNow, including real-time code sharing, saving code
and retrieving code from MongoDB, and managing WebSocket connections.
It sets up the Express server, connects to MongoDB, and listens for client connections.

Architecture: Modular
Author: Krish Soni
GitHub: krishvsoni
Website: https://krishsoni.co
License: MIT License
*/
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { Code } from './models/Code';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://codenow.vercel.app","https://codenow.krishsoni.co"],
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const codeStore: { [key: string]: string } = {};

app.get('/', (req, res) => {
  res.json({ message: 'CodeNow server is running' });
});

// Get all saved codes (for backup/admin purposes)
app.get('/api/getAllCodes', async (req, res) => {
  try {
    const codes = await Code.find({}).sort({ updatedAt: -1 }).limit(100);
    res.status(200).json({ codes });
  } catch (error) {
    console.error('Error retrieving all codes:', error);
    res.status(500).json({ error: 'Failed to retrieve codes' });
  }
});

// Get recent backups (auto-saved codes)
app.get('/api/getRecentBackups', async (req, res) => {
  try {
    const backups = await Code.find({
      $or: [
        { url: 'shared-session' },
        { url: 'disconnect-backup' },
        { id: { $regex: '^(shared-session|disconnect-backup)' } }
      ]
    }).sort({ updatedAt: -1 }).limit(20);
    res.status(200).json({ backups });
  } catch (error) {
    console.error('Error retrieving recent backups:', error);
    res.status(500).json({ error: 'Failed to retrieve backups' });
  }
});

app.delete('/api/deleteCode/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    delete codeStore[id];
    
    await Code.findOneAndDelete({ id });
    
    res.status(200).json({ message: 'Code deleted successfully' });
  } catch (error) {
    console.error('Error deleting code:', error);
    res.status(500).json({ error: 'Failed to delete code' });
  }
});

app.post('/api/saveCode', async (req, res) => {
  try {
    const { id, code } = req.body;
    
    codeStore[id] = code;
    
    await Code.findOneAndUpdate(
      { id },
      { id, code, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    console.log(`Code saved to MongoDB for ID: ${id}`);
    res.status(200).json({ message: 'Code saved successfully' });
  } catch (error) {
    console.error('Error saving code to MongoDB:', error);
    res.status(500).json({ error: 'Failed to save code' });
  }
});

app.get('/api/getCode/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    let code = codeStore[id];
    
    if (!code) {
      const codeDoc = await Code.findOne({ id });
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
  } catch (error) {
    console.error('Error retrieving code:', error);
    res.status(500).json({ error: 'Failed to retrieve code' });
  }
});

let sharedCode = '';
let lastSaveTime = 0;
const AUTO_SAVE_INTERVAL = 3000; 

const autoSaveSharedCode = async () => {
  if (sharedCode && Date.now() - lastSaveTime > AUTO_SAVE_INTERVAL) {
    try {
      const defaultId = 'shared-session-' + new Date().toISOString().split('T')[0];
      await Code.findOneAndUpdate(
        { id: defaultId },
        { id: defaultId, code: sharedCode, url: 'shared-session', updatedAt: new Date() },
        { upsert: true, new: true }
      );
      lastSaveTime = Date.now();
      console.log('Auto-saved shared code');
    } catch (error) {
      console.error('Error in periodic auto-save:', error);
    }
  }
};

setInterval(autoSaveSharedCode, AUTO_SAVE_INTERVAL);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('message', 'Welcome to the codenow !');

  if (sharedCode) {
    socket.emit('codeUpdate', sharedCode);
    console.log('Sent current shared code to new client');
  }

  socket.on('join', async ({ url, currentCode }) => {
    try {
      if (url && currentCode) {
        const id = url.split('/').pop() || url;
        await Code.findOneAndUpdate(
          { id },
          { id, code: currentCode, url, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        
        codeStore[id] = currentCode;
        
        if (currentCode !== sharedCode) {
          sharedCode = currentCode;
        }
      }
    } catch (error) {
      console.error('Error auto-saving code on connection:', error);
    }
  });

  socket.on('codeChange', async ({ newCode, url }) => {
    if (newCode !== undefined) {
      sharedCode = newCode;
      console.log(`Code change from URL: ${url || 'Unknown URL'}`);
      console.log(`New Code: ${newCode}`);
      
      try {
        if (url) {
          const id = url.split('/').pop() || url;
          await Code.findOneAndUpdate(
            { id },
            { id, code: newCode, url, updatedAt: new Date() },
            { upsert: true, new: true }
          );
          console.log(`Real-time code saved to MongoDB for URL: ${url}`);
        }
      } catch (error) {
        console.error('Error saving real-time code to MongoDB:', error);
      }
      
      socket.broadcast.emit('codeUpdate', newCode);
    } else {
      console.error('Received codeChange with undefined newCode');
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (sharedCode) {
      try {
        const disconnectId = 'disconnect-backup-' + Date.now();
        await Code.findOneAndUpdate(
          { id: disconnectId },
          { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() },
          { upsert: true, new: true }
        );
        console.log('Code backed up on client disconnect');
      } catch (error) {
        console.error('Error backing up code on disconnect:', error);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;

connectDB();

httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
