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
app.use(express_1.default.json()); // To parse JSON body in requests
// In-memory store for shared code (replace with database for production)
const codeStore = {};
app.get('/', (req, res) => {
    res.json({ message: 'CodeNow server is running' });
});
// Endpoint to save the code
app.post('/api/saveCode', (req, res) => {
    const { id, code } = req.body;
    codeStore[id] = code; // Store code using the unique ID
    res.status(200).json({ message: 'Code saved successfully' });
});
// Endpoint to get the code by ID
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
// Socket.io for real-time code updates
let sharedCode = ''; // Shared code in-memory
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('message', 'Welcome to the code sharing service!');
    socket.on('codeChange', ({ newCode, url }) => {
        if (newCode !== undefined) {
            sharedCode = newCode; // Update shared code
            console.log(`Code change from URL: ${url || 'Unknown URL'}`);
            console.log(`New Code: ${newCode}`);
            socket.broadcast.emit('codeUpdate', newCode); // Broadcast the updated code
        }
        else {
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
