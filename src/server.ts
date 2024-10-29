import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://codenow.vercel.app"],
    methods: ["GET", "POST"],
  },
});

app.use(cors());

app.get('/', (req, res) => {
  res.json({ message: 'CodeNow server is running' });
});

// Store peer connections for each room
const rooms: { [key: string]: any[] } = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Emit a welcome message when the client connects
  socket.emit('message', 'Welcome to the code sharing service!');

  // Join a room
  socket.on('joinRoom', (roomCode: string) => {
    socket.join(roomCode);
    console.log(`${socket.id} joined room: ${roomCode}`);

    // Create a new room if it doesn't exist
    if (!rooms[roomCode]) {
      rooms[roomCode] = [];
    }

    rooms[roomCode].push(socket.id);

    // Notify others in the room
    socket.to(roomCode).emit('userConnected', socket.id);
  });

  // Handle video/audio signaling
  socket.on('signal', (roomCode: string, signal: any) => {
    socket.to(roomCode).emit('signal', { senderId: socket.id, signal });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Remove user from rooms and notify others
    for (const roomCode in rooms) {
      const index = rooms[roomCode].indexOf(socket.id);
      if (index !== -1) {
        rooms[roomCode].splice(index, 1);
        socket.to(roomCode).emit('userDisconnected', socket.id);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
