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
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
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
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('MongoDB connected successfully');
        // Handle connection events
        mongoose_1.default.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            isConnected = false;
        });
        mongoose_1.default.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            isConnected = false;
        });
        mongoose_1.default.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
            isConnected = true;
        });
    }
    catch (error) {
        console.log('MongoDB connection failed, running without database:', error);
        isConnected = false;
    }
});
const safeDbOperation = (operation, operationName) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isConnected) {
        console.log(`Database operation "${operationName || 'unknown'}" skipped - not connected to MongoDB`);
        return null;
    }
    try {
        const result = yield operation();
        return result;
    }
    catch (error) {
        console.error(`Database operation "${operationName || 'unknown'}" failed:`, error);
        return null;
    }
});
app.get('/', (req, res) => {
    res.json({
        message: 'CodeNow server is running',
        database: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});
app.post('/api/saveCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, code } = req.body;
    codeStore[id] = code;
    const result = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
        const updatedDoc = yield Code.findOneAndUpdate({ id }, { id, code, updatedAt: new Date() }, { upsert: true, new: true });
        console.log(`Code saved to MongoDB for ID: ${id}`);
        return updatedDoc;
    }), `saveCode-${id}`);
    if (result) {
        res.status(200).json({ message: 'Code saved successfully' });
    }
    else {
        console.error(`Failed to save code to MongoDB for ID: ${id}`);
        res.status(200).json({ message: 'Code saved to memory (database unavailable)' });
    }
}));
app.get('/api/getCode/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    let code = codeStore[id];
    if (!code) {
        const codeDoc = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
            return yield Code.findOne({ id });
        }), `getCode-${id}`);
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
            console.log(`New Code: ${newCode.substring(0, 100)}...`); // Log first 100 chars to avoid spam
            if (url) {
                const id = url.split('/').pop() || url;
                const result = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
                    const updatedDoc = yield Code.findOneAndUpdate({ id }, { id, code: newCode, url, updatedAt: new Date() }, { upsert: true, new: true });
                    console.log(`Code saved to MongoDB for ID: ${id}`);
                    return updatedDoc;
                }), `codeChange-${id}`);
                if (!result) {
                    console.error(`Failed to save code to MongoDB for ID: ${id}`);
                }
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
            const disconnectId = 'disconnect-backup-' + Date.now();
            const result = yield safeDbOperation(() => __awaiter(void 0, void 0, void 0, function* () {
                const backupDoc = yield Code.findOneAndUpdate({ id: disconnectId }, { id: disconnectId, code: sharedCode, url: 'disconnect-backup', updatedAt: new Date() }, { upsert: true, new: true });
                console.log(`Disconnect backup saved to MongoDB with ID: ${disconnectId}`);
                return backupDoc;
            }), `disconnect-backup-${disconnectId}`);
            if (!result) {
                console.error(`Failed to save disconnect backup to MongoDB`);
            }
        }
    }));
});
const PORT = process.env.PORT || 3001;
connectDB();
httpServer.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
