import express, { Request, Response } from 'express';
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
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('codenow connected successfully');
    
    mongoose.connection.on('disconnected', () => {
      console.log('codenow disconnected');
      isConnected = false;
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
    });
    
  } catch (error) {
    console.log('MongoDB connection failed, running without database:', error);
    isConnected = false;
  }
};

const safeDbOperation = async (operation: () => Promise<any>, operationName?: string) => {
  if (!isConnected) {
    console.log(`Database operation "${operationName || 'unknown'}" skipped - not connected to MongoDB`);
    return null;
  }
  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error(`Database operation "${operationName || 'unknown'}" failed:`, error);
    return null;
  }
};

app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'CodeNow server is running',
    database: isConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/saveCode', async (req: Request, res: Response) => {
  const { id, code } = req.body;
  codeStore[id] = code;
  
  const result = await safeDbOperation(async () => {
    const updatedDoc = await Code.findOneAndUpdate(
      { id },
      { id, code, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`Code saved to MongoDB for ID: ${id}`);
    return updatedDoc;
  }, `saveCode-${id}`);
  
  if (result) {
    res.status(200).json({ message: 'Code saved successfully' });
  } else {
    console.error(`Failed to save code to MongoDB for ID: ${id}`);
    res.status(200).json({ message: 'Code saved to memory (database unavailable)' });
  }
});

app.get('/api/getCode/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  let code = codeStore[id];
  
  if (!code) {
    const codeDoc = await safeDbOperation(async () => {
      return await Code.findOne({ id });
    }, `getCode-${id}`);
    
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
      console.log(`New Code: ${newCode.substring(0, 100)}...`); // Log first 100 chars to avoid spam
      
      if (url) {
        const id = url.split('/').pop() || url;
        const result = await safeDbOperation(async () => {
          const updatedDoc = await Code.findOneAndUpdate(
            { id },
            { id, code: newCode, url, updatedAt: new Date() },
            { upsert: true, new: true }
          );
          console.log(`Code saved to MongoDB for ID: ${id}`);
          return updatedDoc;
        }, `codeChange-${id}`);
        
        if (!result) {
          console.error(`Failed to save code to MongoDB for ID: ${id}`);
        }
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
      const result = await safeDbOperation(async () => {
        const backupDoc = await Code.findOneAndUpdate(
          { id: disconnectId },
          { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() },
          { upsert: true, new: true }
        );
        console.log(`Disconnect backup saved to MongoDB with ID: ${disconnectId}`);
        return backupDoc;
      }, `disconnect-backup-${disconnectId}`);
      
      if (!result) {
        console.error(`Failed to save disconnect backup to MongoDB`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;

connectDB();

httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
