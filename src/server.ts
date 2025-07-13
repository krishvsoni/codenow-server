import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

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
      console.log(`New Code: ${newCode}`);
      
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
    } else {
      console.error('Received codeChange with undefined newCode');
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

connectDB();

httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
