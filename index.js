import http, { request } from 'http';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import { Server } from 'socket.io';

import pool from './db.js';
import { timeStamp } from 'console';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 20000,
  pingInterval: 10000
});

const onlineUsers = new Map(); // userId -> socket.id
const EXTERNAL_WEBHOOK_URL = "https://hook.us2.make.com/dofk0pewchek787h49faugkr5ql7otnu";
app.use(cors());
app.use(express.json());

// ✅ asyncHandler utility
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ✅ Fetching correct replied messages by message Ids
const getRepliesForMessages = async (messageIds) => {
  if (messageIds.length === 0) return {};
  const [rows] = await pool.query(
    'SELECT * FROM replies WHERE message_id IN (?) ORDER BY reply_at ASC',
    [messageIds]
  );
  const repliesByMessage = {};
  rows.forEach(reply => {
    if (!repliesByMessage[reply.message_id]) repliesByMessage[reply.message_id] = [];
    repliesByMessage[reply.message_id].push(reply);
  });
  return repliesByMessage;
};

// ✅ Webhook endpoint for external system to send reply
app.post('/webhook/reply', asyncHandler(async (req, res) => {
  const { messageId, reply } = req.body;
  if (!messageId || typeof reply !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const [result] = await pool.query(
    'INSERT INTO replies (message_id, reply_content, reply_at) VALUES (?, ?, ?)',
    [messageId, reply, currentTime]
  );

  const [[msg]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
  if (msg) {
    const userId = msg.user_id;
    const socketId = onlineUsers.get(userId);
    if (socketId) {
      io.to(socketId).emit('reply', { messageId, reply, currentTime });
    } else {
      console.log("No active socket for user:", userId);
    }
  }

  res.json({ status: 'ok' });
}));

// ✅ Fetching all chatting history with pagination
app.get('/messages', asyncHandler(async (req, res) => {
  const userId = req.query.userId;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  if (!userId) return res.status(400).json({ error: 'userId required' });

  const [messages] = await pool.query(
    `
    SELECT * FROM messages
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [userId, limit, offset]
  );

  const sortedMessages = messages.reverse();
  const messageIds = sortedMessages.map(m => m.id);
  const repliesByMessage = await getRepliesForMessages(messageIds);

  const messagesWithReplies = sortedMessages.map(msg => ({
    ...msg,
    replies: repliesByMessage[msg.id] || []
  }));

  res.json(messagesWithReplies);
}));

// ✅ Verify user
app.post('/verify', asyncHandler(async (req, res) => {
  const { telegramId } = req.body;

  const [rows] = await pool.query('SELECT * FROM driversDirectory WHERE telegramId = ?', [`@${telegramId}`]);

  if (rows.length === 0) {
    return res.status(403).json({ error: 'Access denied: Not a member.' });
  }
  return res.status(200).json({ ok: true });
}));

// ✅ Socket communication
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('socket register', async (msg) => {
    try {
      if (!msg.userId) return;
      onlineUsers.set(msg.userId, socket.id);
    } catch (err) {
      console.error('Failed to register socketId:', err);
    }
  });

  socket.on('chat message', async (msg, callback) => {
    if (!msg.userId || typeof msg.content !== 'string') {
      console.warn("Invalid chat message payload:", msg);
      return;
    }

    try {
      const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const [result] = await pool.query(
        'INSERT INTO messages (user_id, content, created_at) VALUES (?, ?, ?)',
        [msg.userId, msg.content, currentTime]
      );

      await axios.post(EXTERNAL_WEBHOOK_URL, {
        messageId: result.insertId,
        userId: msg.userId,
        content: msg.content
      });

      callback({ success: true, request: msg.content, timestamp: currentTime });
    } catch (err) {
      // console.error('Failed to save/send message:', err);
      callback({ success: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
