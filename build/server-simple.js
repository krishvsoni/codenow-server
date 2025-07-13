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
CodeNow Server - Vercel Compatible Version
Based on the working simple version with MongoDB integration
*/
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
// MongoDB Schema
const codeSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    url: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
});
const Code = mongoose_1.default.model('Code', codeSchema);
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
// Database connection with error handling
let isConnected = false;
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    if (isConnected)
        return;
    try {
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            console.log('MongoDB URI not found, running without database');
            return;
        }
        yield mongoose_1.default.connect(MONGODB_URI, {
            bufferCommands: false,
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('MongoDB connected successfully');
    }
    catch (error) {
        console.log('MongoDB connection failed, running without database:', error);
    }
});
// Helper function to safely use database
const safeDbOperation = (operation) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isConnected)
        return null;
    try {
        return yield operation();
    }
    catch (error) {
        console.error('Database operation failed:', error);
        return null;
    }
});
app.get('/', (req, res) => {
    res.json({ message: 'CodeNow server is running' });
});
app.post('/api/saveCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, code } = req.body;
    codeStore[id] = code;
    // Try to save to database, but don't fail if it doesn't work
    yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        yield Code.findOneAndUpdate({ id }, { id, code, updatedAt: new Date() }, { upsert: true, new: true });
        console.log(`Code saved to MongoDB for ID: ${id}`);
    }));
    res.status(200).json({ message: 'Code saved successfully' });
}));
app.get('/api/getCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    let code = codeStore[id];
    // If not in memory, try database
    if (!code) {
        const codeDoc = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
            return yield Code.findOne({ id });
        }));
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
}));
// Additional endpoints for the full functionality
app.get('/api/getAllCodes', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const codes = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        return yield Code.find({}).sort({ updatedAt: -1 }).limit(100);
    }));
    res.status(200).json({ codes: codes || [] });
}));
app.get('/api/getRecentBackups', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const backups = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        return yield Code.find({
            $or: [
                { url: 'shared-session' },
                { url: 'disconnect-backup' },
                { id: { $regex: '^(shared-session|disconnect-backup)' } }
            ]
        }).sort({ updatedAt: -1 }).limit(20);
    }));
    res.status(200).json({ backups: backups || [] });
}));
app.delete('/api/deleteCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    delete codeStore[id];
    yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        yield Code.findOneAndDelete({ id });
    }));
    res.status(200).json({ message: 'Code deleted successfully' });
}));
app.post('/api/autoSave', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code, type = 'shared-session' } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }
    const defaultId = `${type}-${new Date().toISOString().split('T')[0]}`;
    yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        yield Code.findOneAndUpdate({ id: defaultId }, { id: defaultId, code, url: type, updatedAt: new Date() }, { upsert: true, new: true });
    }));
    res.status(200).json({ message: 'Code auto-saved successfully' });
}));
let sharedCode = '';
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('message', 'Welcome to the code sharing service!');
    if (sharedCode) {
        socket.emit('codeUpdate', sharedCode);
    }
    socket.on('codeChange', (_a) => __awaiter(void 0, [_a], void 0, function* ({ newCode, url }) {
        if (newCode !== undefined) {
            sharedCode = newCode;
            console.log(`Code change from URL: ${url || 'Unknown URL'}`);
            // Save to database if available
            if (url) {
                const id = url.split('/').pop() || url;
                yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
                    yield Code.findOneAndUpdate({ id }, { id, code: newCode, url, updatedAt: new Date() }, { upsert: true, new: true });
                }));
            }
            socket.broadcast.emit('codeUpdate', newCode);
        }
    }));
    socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`Client disconnected: ${socket.id}`);
        if (sharedCode) {
            const disconnectId = 'disconnect-backup-' + Date.now();
            yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
                yield Code.findOneAndUpdate({ id: disconnectId }, { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() }, { upsert: true, new: true });
            }));
        }
    }));
});
const PORT = process.env.PORT || 3001;
// Initialize database connection
connectDB();
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
