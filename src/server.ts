import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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

app.post('/api/saveCode', (req, res) => {
  const { id, code } = req.body;
  codeStore[id] = code;
  res.status(200).json({ message: 'Code saved successfully' });
});

app.get('/api/getCode/:id', (req, res) => {
  const { id } = req.params;
  const code = codeStore[id];
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

  socket.on('codeChange', ({ newCode, url }) => {
    if (newCode !== undefined) {
      sharedCode = newCode;
      console.log(`Code change from URL: ${url || 'Unknown URL'}`);
      console.log(`New Code: ${newCode}`);
      
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