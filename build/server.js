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
        origin: "http://localhost:3000", // Replace with your client URL
        methods: ["GET", "POST"],
    },
});
app.use((0, cors_1.default)());
app.get('/', (req, res) => {
    res.json({ message: 'CodeNow server is running' });
});
let sharedCode = ''; // Variable to hold the shared code
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // Emit a welcome message when the client connects
    socket.emit('message', 'Welcome to the code sharing service!');
    // Capture 'codeChange' events with URL or identifier from the client
    socket.on('codeChange', ({ newCode, url }) => {
        if (newCode !== undefined) {
            sharedCode = newCode; // Update shared code
            console.log(`Code change from URL: ${url || 'Unknown URL'}`);
            console.log(`New Code: ${newCode}`);
            // Broadcast the new code to other connected clients
            socket.broadcast.emit('codeUpdate', newCode);
        }
        else {
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
    console.log(`Server listening on http://localhost:${PORT}`);
});
