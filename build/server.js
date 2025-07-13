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
/*
Official File For CodeNow Server
This file handles the server-side logic for CodeNow, including real-time code sharing, saving code
and retrieving code from MongoDB, and managing WebSocket connections.
It sets up the Express server, connects to MongoDB, and listens for client connections.

Architecture: Modular
Author: Krish Soni
GitHub: krishvsoni
Website: https://krishsoni.co
License: MIT License
*/
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./config/database");
const Code_1 = require("./models/Code");
dotenv_1.default.config();
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
const codeStore = {};
app.get('/', (req, res) => {
    res.json({ message: 'CodeNow server is running' });
});
// Get all saved codes (for backup/admin purposes)
app.get('/api/getAllCodes', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const codes = yield Code_1.Code.find({}).sort({ updatedAt: -1 }).limit(100);
        res.status(200).json({ codes });
    }
    catch (error) {
        console.error('Error retrieving all codes:', error);
        res.status(500).json({ error: 'Failed to retrieve codes' });
    }
}));
// Get recent backups (auto-saved codes)
app.get('/api/getRecentBackups', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const backups = yield Code_1.Code.find({
            $or: [
                { url: 'shared-session' },
                { url: 'disconnect-backup' },
                { id: { $regex: '^(shared-session|disconnect-backup)' } }
            ]
        }).sort({ updatedAt: -1 }).limit(20);
        res.status(200).json({ backups });
    }
    catch (error) {
        console.error('Error retrieving recent backups:', error);
        res.status(500).json({ error: 'Failed to retrieve backups' });
    }
}));
app.delete('/api/deleteCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        delete codeStore[id];
        yield Code_1.Code.findOneAndDelete({ id });
        res.status(200).json({ message: 'Code deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting code:', error);
        res.status(500).json({ error: 'Failed to delete code' });
    }
}));
app.post('/api/saveCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, code } = req.body;
        codeStore[id] = code;
        yield Code_1.Code.findOneAndUpdate({ id }, { id, code, updatedAt: new Date() }, { upsert: true, new: true });
        console.log(`Code saved to MongoDB for ID: ${id}`);
        res.status(200).json({ message: 'Code saved successfully' });
    }
    catch (error) {
        console.error('Error saving code to MongoDB:', error);
        res.status(500).json({ error: 'Failed to save code' });
    }
}));
app.get('/api/getCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        let code = codeStore[id];
        if (!code) {
            const codeDoc = yield Code_1.Code.findOne({ id });
            if (codeDoc) {
                code = codeDoc.code;
                codeStore[id] = code;
            }
        }
        if (code) {
            res.status(200).json({ code });
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
let sharedCode = '';
let lastSaveTime = 0;
const AUTO_SAVE_INTERVAL = 3000;
const autoSaveSharedCode = () => __awaiter(void 0, void 0, void 0, function* () {
    if (sharedCode && Date.now() - lastSaveTime > AUTO_SAVE_INTERVAL) {
        try {
            const defaultId = 'shared-session-' + new Date().toISOString().split('T')[0];
            yield Code_1.Code.findOneAndUpdate({ id: defaultId }, { id: defaultId, code: sharedCode, url: 'shared-session', updatedAt: new Date() }, { upsert: true, new: true });
            lastSaveTime = Date.now();
            console.log('Auto-saved shared code');
        }
        catch (error) {
            console.error('Error in periodic auto-save:', error);
        }
    }
});
setInterval(autoSaveSharedCode, AUTO_SAVE_INTERVAL);
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('message', 'Welcome to the codenow !');
    if (sharedCode) {
        socket.emit('codeUpdate', sharedCode);
        console.log('Sent current shared code to new client');
    }
    socket.on('join', (_a) => __awaiter(void 0, [_a], void 0, function* ({ url, currentCode }) {
        try {
            if (url && currentCode) {
                const id = url.split('/').pop() || url;
                yield Code_1.Code.findOneAndUpdate({ id }, { id, code: currentCode, url, updatedAt: new Date() }, { upsert: true, new: true });
                codeStore[id] = currentCode;
                if (currentCode !== sharedCode) {
                    sharedCode = currentCode;
                }
            }
        }
        catch (error) {
            console.error('Error auto-saving code on connection:', error);
        }
    }));
    socket.on('codeChange', (_a) => __awaiter(void 0, [_a], void 0, function* ({ newCode, url }) {
        if (newCode !== undefined) {
            sharedCode = newCode;
            console.log(`Code change from URL: ${url || 'Unknown URL'}`);
            console.log(`New Code: ${newCode}`);
            try {
                if (url) {
                    const id = url.split('/').pop() || url;
                    yield Code_1.Code.findOneAndUpdate({ id }, { id, code: newCode, url, updatedAt: new Date() }, { upsert: true, new: true });
                    console.log(`Real-time code saved to MongoDB for URL: ${url}`);
                }
            }
            catch (error) {
                console.error('Error saving real-time code to MongoDB:', error);
            }
            socket.broadcast.emit('codeUpdate', newCode);
        }
        else {
            console.error('Received codeChange with undefined newCode');
        }
    }));
    socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`Client disconnected: ${socket.id}`);
        if (sharedCode) {
            try {
                const disconnectId = 'disconnect-backup-' + Date.now();
                yield Code_1.Code.findOneAndUpdate({ id: disconnectId }, { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() }, { upsert: true, new: true });
                console.log('Code backed up on client disconnect');
            }
            catch (error) {
                console.error('Error backing up code on disconnect:', error);
            }
        }
    }));
});
const PORT = process.env.PORT || 3001;
(0, database_1.connectDB)();
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
