
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

let sharedCode = ''; // Variable to hold the shared code

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('message', 'Welcome to the code sharing service!');

  socket.on('codeChange', ({ newCode, url }) => {
    if (newCode !== undefined) {
      sharedCode = newCode; // Update shared code
      console.log(`Code change from URL: ${url || 'Unknown URL'}`);
      console.log(`New Code: ${newCode}`);
      
      socket.broadcast.emit('codeUpdate', newCode);
    } else {
      console.error('Received codeChange with undefined newCode');
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
