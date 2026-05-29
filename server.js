const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const morgan   = require('morgan');
const path     = require('path');
const http     = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// ── Socket.io — WebRTC Signaling Server ──────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Map: "userId:userType" -> socketId
const onlineUsers = new Map();

io.on('connection', (socket) => {
  // User registers their socket after login
  socket.on('register', ({ userId, userType }) => {
    if (!userId || !userType) return;
    const key = `${userId}:${userType}`;
    onlineUsers.set(key, socket.id);
    console.log(`📞 Registered ${key} -> ${socket.id}`);
  });

  // Caller initiates a call
  socket.on('call-user', ({ toUserId, toUserType, fromUserId, fromUserType, fromName, offer }) => {
    const key      = `${toUserId}:${toUserType}`;
    const toSocket = onlineUsers.get(key);
    if (toSocket) {
      io.to(toSocket).emit('call-incoming', { fromUserId, fromUserType, fromName, offer });
      console.log(`📞 Call from ${fromUserId} to ${toUserId}`);
    } else {
      socket.emit('call-unavailable');
      console.log(`📞 ${toUserId} not online`);
    }
  });

  // Callee accepts the call
  socket.on('call-accepted', ({ toUserId, toUserType, answer }) => {
    const key      = `${toUserId}:${toUserType}`;
    const toSocket = onlineUsers.get(key);
    if (toSocket) io.to(toSocket).emit('call-accepted', { answer });
  });

  // Callee rejects the call
  socket.on('call-rejected', ({ toUserId, toUserType }) => {
    const key      = `${toUserId}:${toUserType}`;
    const toSocket = onlineUsers.get(key);
    if (toSocket) io.to(toSocket).emit('call-rejected');
  });

  // ICE candidate exchange
  socket.on('ice-candidate', ({ toUserId, toUserType, candidate }) => {
    const key      = `${toUserId}:${toUserType}`;
    const toSocket = onlineUsers.get(key);
    if (toSocket) io.to(toSocket).emit('ice-candidate', { candidate });
  });

  // Either party ends the call
  socket.on('call-ended', ({ toUserId, toUserType }) => {
    const key      = `${toUserId}:${toUserType}`;
    const toSocket = onlineUsers.get(key);
    if (toSocket) io.to(toSocket).emit('call-ended');
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    onlineUsers.forEach((sid, key) => {
      if (sid === socket.id) {
        onlineUsers.delete(key);
        console.log(`📞 Disconnected: ${key}`);
      }
    });
  });
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// ── Serve local uploads ───────────────────────────────────────
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/properties',    require('./routes/properties'));
app.use('/api/visits',        require('./routes/visits'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/admin',         require('./routes/admin'));
require('./models/Chat');
require('./models/Message');
require('./models/Favourite');
app.use('/api/customers',     require('./routes/customers'));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
