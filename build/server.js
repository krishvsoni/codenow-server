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
        origin: "*", // Allow all origins for testing; restrict in production
        methods: ["GET", "POST"],
    },
});
app.use((0, cors_1.default)());
app.get('/', (req, res) => {
    res.send("Server is running");
});
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on('joinRoom', (roomCode) => {
        socket.join(roomCode);
        console.log(`${socket.id} joined room: ${roomCode}`);
    });
    socket.on('codeChange', ({ roomCode, newCode }) => {
        socket.to(roomCode).emit('codeUpdate', newCode); // Broadcast code to everyone except sender
    });
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
