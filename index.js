import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pool from './db.js'; // Note the `.js` extension is required in ES modules


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const onlineUsers = new Map(); // userId -> socket.id

app.use(cors());
app.use(express.json());

app.get('/test', (req, res) => res.send('Chat server running!'));

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

// Webhook endpoint for external system to send reply
app.post('/webhook/reply', async (req, res) => {
  const { messageId, reply } = req.body;
  try {
    // Insert new reply
    const [result] = await pool.query(
      'INSERT INTO replies (message_id, reply_content) VALUES (?, ?)',
      [messageId, reply]
    );
    // Find userId for this message
    const [[msg]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
    if (msg) {
      const userId = msg.user_id;
      const socketId = onlineUsers.get(userId);
      if (socketId) {
        io.to(socketId).emit('reply', { messageId, reply });
        await pool.query('UPDATE replies SET delivered = TRUE WHERE id = ?', [result.insertId]);
      }
    }
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to process webhook reply:', err);
    res.status(500).json({ error: 'Failed to process reply' });
  }
});

// History endpoint
app.get('/messages', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const [messages] = await pool.query(
      'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );
    const messageIds = messages.map(m => m.id);
    const repliesByMessage = await getRepliesForMessages(messageIds);
    const messagesWithReplies = messages.map(msg => ({
      ...msg,
      replies: repliesByMessage[msg.id] || []
    }));
    res.json(messagesWithReplies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', async (userId) => {
    onlineUsers.set(userId, socket.id);
    // No longer emit undelivered replies here; frontend will fetch history via /messages
  });

  socket.on('chat message', async (msg) => {
    // msg: { userId, content }
    try {
      const [result] = await pool.query(
        'INSERT INTO messages (user_id, content) VALUES (?, ?)',
        [msg.userId, msg.content]
      );
      // Forward to external system (webhook)
      // TODO: Replace with actual webhook URL
      // const axios = require('axios');
      // await axios.post(process.env.EXTERNAL_WEBHOOK_URL, {
      //   messageId: result.insertId,
      //   userId: msg.userId,
      //   content: msg.content
      // });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 