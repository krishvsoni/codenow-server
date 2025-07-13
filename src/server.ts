import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/database';
import { Code } from './models/Code';

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

connectDB();

app.get('/', (req, res) => {
  res.json({ message: 'CodeNow server is running' });
});

app.post('/api/saveCode', async (req, res) => {
  try {
    const { id, code } = req.body;
    const existingCode = await Code.findOne({ id });
    if (existingCode) {
      existingCode.code = code;
      await existingCode.save();
      res.status(200).json({ message: 'Code updated successfully' });
    } else {
      const newCode = new Code({ id, code });
      await newCode.save();
      res.status(201).json({ message: 'Code saved successfully' });
    }
  } catch (error) {
    console.error('Error saving code:', error);
    res.status(500).json({ error: 'Failed to save code' });
  }
});

app.get('/api/getCode/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const codeEntry = await Code.findOne({ id });
    if (codeEntry) {
      res.status(200).json({ code: codeEntry.code });
    } else {
      res.status(404).json({ error: 'Code not found' });
    }
  } catch (error) {
    console.error('Error retrieving code:', error);
    res.status(500).json({ error: 'Failed to retrieve code' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.status(200).json({
      message: 'Server is running',
      database: states[dbState] || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

let sharedCode = '';

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('message', 'Welcome to the code sharing service!');
  socket.on('codeChange', async ({ newCode, url }) => {
    if (newCode !== undefined) {
      sharedCode = newCode;
      console.log(`Code change from URL: ${url || 'Unknown URL'}`);
      console.log(`New Code: ${newCode}`);
      if (url) {
        try {
          const codeId = url.split('/').pop() || url;
          const existingCode = await Code.findOne({ id: codeId });
          if (existingCode) {
            existingCode.code = newCode;
            existingCode.url = url;
            await existingCode.save();
          } else {
            const newCodeEntry = new Code({ id: codeId, code: newCode, url });
            await newCodeEntry.save();
          }
          console.log(`Code saved to database for ID: ${codeId}`);
        } catch (error) {
          console.error('Error saving code to database:', error);
        }
      }
      socket.broadcast.emit('codeUpdate', newCode);
    } else {
      console.error('Received codeChange with undefined newCode');
    }
  });
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
