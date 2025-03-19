"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: ["http://localhost:3000", "https://codenow.vercel.app"],
        methods: ["GET", "POST"],
    },
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const codeStore = {};
const connectionCounts = {};
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
    }
    else {
        res.status(404).json({ error: 'Code not found' });
    }
});
app.get('/api/connectionCount/:room', (req, res) => {
    const { room } = req.params;
    const count = connectionCounts[room] || 0;
    res.status(200).json({ room, connectionCount: count });
});
let sharedCode = '';
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('message', 'codenow service running');
    socket.on('joinURL', (room) => {
        if (room) {
            socket.join(room);
            connectionCounts[room] = (connectionCounts[room] || 0) + 1;
            console.log(`Client ${socket.id} joined room: ${room}`);
            console.log(`Current connections for ${room}: ${connectionCounts[room]}`);
            // Notify room members of the updated count
            io.to(room).emit('updateConnectionCount', connectionCounts[room]);
        }
    });
    socket.on('codeChange', ({ newCode, room, id }) => {
        if (newCode !== undefined) {
            sharedCode = newCode;
            codeStore[id] = newCode;
            console.log(`Code change from room: ${room || 'Unknown room'}`);
            console.log(`New Code: ${newCode}`);
            socket.to(room).emit('codeUpdate', newCode);
        }
        else {
            console.error('Received codeChange with undefined newCode');
        }
    });
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Get all rooms the socket was in
        const rooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
        for (const room of rooms) {
            if (connectionCounts[room]) {
                connectionCounts[room] = Math.max(0, connectionCounts[room] - 1);
                console.log(`Client ${socket.id} left room: ${room}`);
                console.log(`Updated connections for ${room}: ${connectionCounts[room]}`);
                // Notify room members of the updated count
                io.to(room).emit('updateConnectionCount', connectionCounts[room]);
            }
        }
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
