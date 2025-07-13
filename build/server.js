"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("./config/database");
const Code_1 = require("./models/Code");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: ["http://localhost:3000", "https://codenow.vercel.app", "https://codenow.krishsoni.co"],
        methods: ["GET", "POST"],
    },
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
(0, database_1.connectDB)();
app.get('/', (req, res) => {
    res.json({ message: 'CodeNow server is running' });
});
app.post('/api/saveCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, code } = req.body;
        const existingCode = yield Code_1.Code.findOne({ id });
        if (existingCode) {
            existingCode.code = code;
            yield existingCode.save();
            res.status(200).json({ message: 'Code updated successfully' });
        }
        else {
            const newCode = new Code_1.Code({ id, code });
            yield newCode.save();
            res.status(201).json({ message: 'Code saved successfully' });
        }
    }
    catch (error) {
        console.error('Error saving code:', error);
        res.status(500).json({ error: 'Failed to save code' });
    }
}));
app.get('/api/getCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const codeEntry = yield Code_1.Code.findOne({ id });
        if (codeEntry) {
            res.status(200).json({ code: codeEntry.code });
        }
        else {
            res.status(404).json({ error: 'Code not found' });
        }
    }
    catch (error) {
        console.error('Error retrieving code:', error);
        res.status(500).json({ error: 'Failed to retrieve code' });
    }
}));
app.get('/api/health', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dbState = mongoose_1.default.connection.readyState;
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        res.status(200).json({
            message: 'Server is running',
            database: states[dbState] || 'unknown',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Health check failed' });
    }
}));
let sharedCode = '';
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('message', 'Welcome to the code sharing service!');
    socket.on('codeChange', (_a) => __awaiter(void 0, [_a], void 0, function* ({ newCode, url }) {
        if (newCode !== undefined) {
            sharedCode = newCode;
            console.log(`Code change from URL: ${url || 'Unknown URL'}`);
            console.log(`New Code: ${newCode}`);
            if (url) {
                try {
                    const codeId = url.split('/').pop() || url;
                    const existingCode = yield Code_1.Code.findOne({ id: codeId });
                    if (existingCode) {
                        existingCode.code = newCode;
                        existingCode.url = url;
                        yield existingCode.save();
                    }
                    else {
                        const newCodeEntry = new Code_1.Code({ id: codeId, code: newCode, url });
                        yield newCodeEntry.save();
                    }
                    console.log(`Code saved to database for ID: ${codeId}`);
                }
                catch (error) {
                    console.error('Error saving code to database:', error);
                }
            }
            socket.broadcast.emit('codeUpdate', newCode);
        }
        else {
            console.error('Received codeChange with undefined newCode');
        }
    }));
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
