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
      console.log('Please set  your environment variables');
      return;
    }

    console.log('Attempting to connect to codenowDB...');

    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('codenowDB connected successfully');
    
    mongoose.connection.on('disconnected', () => {
      console.log('codenowDB disconnected');
      isConnected = false;
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('codenowDB connection error:', err);
      isConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('codenowDB reconnected');
      isConnected = true;
    });
    
  } catch (error) {
    console.error('codenowDB connection failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
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
    timestamp: new Date().toISOString(),
    mongodb_uri_set: !!process.env.MONGODB_URI,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', async (req: Request, res: Response) => {
  const dbTest = await safeDbOperation(async () => {
    const count = await Code.countDocuments();
    return { documentCount: count };
  }, 'health-check');

  res.json({
    status: 'ok',
    database: {
      connected: isConnected,
      uri_configured: !!process.env.MONGODB_URI,
      test_query_result: dbTest,
      connection_state: mongoose.connection.readyState // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/saveCode', async (req: Request, res: Response): Promise<void> => {
  const { id, code } = req.body;
  
  if (!id || code === undefined) {
    res.status(400).json({ error: 'Missing id or code in request body' });
    return;
  }
  
  console.log(`Saving code for ID: ${id}, Length: ${code.length} characters`);
  console.log(`Database status: ${isConnected ? 'Connected' : 'Disconnected'}`);
  
  codeStore[id] = code;
  
  const result = await safeDbOperation(async () => {
    const updatedDoc = await Code.findOneAndUpdate(
      { id },
      { id, code, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`Code saved to codenowDB for ID: ${id}`);
    return updatedDoc;
  }, `saveCode-${id}`);
  
  if (result) {
    res.status(200).json({ 
      message: 'Code saved successfully', 
      saved_to: 'both_memory_and_database',
      database_connected: true,
      id: id,
      code_length: code.length
    });
  } else {
    console.error(` Failed to save code to codenowDB for ID: ${id}`);
    res.status(200).json({ 
      message: 'Code saved to memory only (database unavailable)', 
      saved_to: 'memory_only',
      database_connected: false,
      id: id,
      code_length: code.length,
      warning: 'Database connection failed - data will be lost on server restart'
    });
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
