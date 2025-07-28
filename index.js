import http from 'http';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import { Server } from 'socket.io';

import pool from './db.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const onlineUsers = new Map(); // userId -> socket.id
const EXTERNAL_WEBHOOK_URL = "https://hook.us2.make.com/dofk0pewchek787h49faugkr5ql7otnu";

app.use(cors());
app.use(express.json());

// -------------- Fetching correct replied messages by message Ids ----------------------
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

// ---------------- Webhook endpoint for external system to send reply -------------------
app.post('/webhook/reply', async (req, res) => {
  const { messageId, reply } = req.body;
  const convert_reply = reply.replaceAll("***", "\\n");
  try {
    // Insert new reply
    const [result] = await pool.query(
      'INSERT INTO replies (message_id, reply_content) VALUES (?, ?)',
      [messageId, convert_reply]
    );
    // Find userId for this message
    const [[msg]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
    if (msg) {
      const userId = msg.user_id;
      console.log(`user ID = ${userId}`);
      const socketId = onlineUsers.get(userId);
      if (socketId) {
        io.to(socketId).emit('reply', { messageId, convert_reply });
      } else {
        console.log("there is not socket ID");
      }
    }
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to process webhook reply:', err);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// ----------------------- Fetching all chatting history -------------------------------------
app.get('/messages', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const [messages] = await pool.query(
      `
      SELECT * FROM messages
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [userId]
    );

    // Reverse to get ascending order (oldest first)
    const sortedMessages = messages.reverse();

    const messageIds = sortedMessages.map(m => m.id);
    const repliesByMessage = await getRepliesForMessages(messageIds);

    const messagesWithReplies = sortedMessages.map(msg => ({
      ...msg,
      replies: repliesByMessage[msg.id] || []
    }));

    res.json(messagesWithReplies);
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});


// ---------------------- verify user --------------------------
app.post('/verify', async (req, res) => {
  const { telegramId } = req.body;

  const [rows] = await pool.query('SELECT * FROM driversDirectory WHERE telegramId = ?', [`@${telegramId}`]);

  if (rows.length === 0) {
    return res.status(403).json({ error: 'Access denied: Not a member.' });
  }
  return res.status(200).json({ ok: true });
});

// ---------------------- Socket communication between Frontend and Backend --------------------------
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('socket register', async (msg) => {
    try {
      onlineUsers.set(msg.userId, socket.id);
    } catch (err) {
      console.error('Failed to register socketId:', err);
    }
  });

  socket.on('chat message', async (msg) => {
    // msg: { userId, content }
    try {
      onlineUsers.set(msg.userId, socket.id);
      const [result] = await pool.query(
        'INSERT INTO messages (user_id, content) VALUES (?, ?)',
        [msg.userId, msg.content]
      );
      // Forward to external system (webhook)
      await axios.post(EXTERNAL_WEBHOOK_URL, {
        messageId: result.insertId,
        userId: msg.userId,
        content: msg.content
      });
    } catch (err) {
      console.error('Failed to save/send message:', err);
    }
  });

  socket.on('disconnect', () => {
    // Remove user from online map
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