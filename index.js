import http from 'http';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';

import pool from './db.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.FRONTEND_URL || '*',
    credentials: true 
  },
  transports: ['websocket', 'polling']
});

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Global variables
const onlineUsers = new Map(); // userId -> socket.id
const EXTERNAL_WEBHOOK_URL = process.env.EXTERNAL_WEBHOOK_URL || "https://hook.us2.make.com/dofk0pewchek787h49faugkr5ql7otnu";

// Utility functions
const logger = {
  info: (message, data = {}) => console.log(`[INFO] ${new Date().toISOString()}: ${message}`, data),
  error: (message, error = {}) => console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error),
  warn: (message, data = {}) => console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, data)
};

const validateInput = (data, requiredFields) => {
  const missing = requiredFields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  return true;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

// Database utility functions
const getRepliesForMessages = async (messageIds) => {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return {};
  
  try {
    const [rows] = await pool.query(
      'SELECT * FROM replies WHERE message_id IN (?) ORDER BY reply_at ASC',
      [messageIds]
    );
    
    const repliesByMessage = {};
    rows.forEach(reply => {
      if (!repliesByMessage[reply.message_id]) {
        repliesByMessage[reply.message_id] = [];
      }
      repliesByMessage[reply.message_id].push(reply);
    });
    
    return repliesByMessage;
  } catch (error) {
    logger.error('Failed to fetch replies for messages', error);
    throw new Error('Database error while fetching replies');
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    onlineUsers: onlineUsers.size
  });
});

// Webhook endpoint for external system to send reply
app.post('/webhook/reply', async (req, res) => {
  try {
    const { messageId, reply } = req.body;
    
    // Validate input
    validateInput({ messageId, reply }, ['messageId', 'reply']);
    
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }
    
    const sanitizedReply = sanitizeInput(reply);
    if (!sanitizedReply || sanitizedReply.length > 1000) {
      return res.status(400).json({ error: 'Invalid reply content' });
    }

    // Insert new reply
    const [result] = await pool.query(
      'INSERT INTO replies (message_id, reply_content) VALUES (?, ?)',
      [messageId, sanitizedReply]
    );

    // Find userId for this message
    const [[msg]] = await pool.query('SELECT user_id FROM messages WHERE id = ?', [messageId]);
    
    if (!msg) {
      logger.warn(`Message not found for ID: ${messageId}`);
      return res.status(404).json({ error: 'Message not found' });
    }

    const userId = msg.user_id;
    logger.info(`Processing reply for user: ${userId}, message: ${messageId}`);
    
    const socketId = onlineUsers.get(userId);
    if (socketId) {
      io.to(socketId).emit('reply', { 
        messageId, 
        reply: sanitizedReply,
        timestamp: new Date().toISOString()
      });
      logger.info(`Reply sent to socket: ${socketId}`);
    } else {
      logger.warn(`User ${userId} not online, reply stored for later delivery`);
    }

    res.json({ 
      status: 'ok', 
      replyId: result.insertId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to process webhook reply', error);
    res.status(500).json({ 
      error: 'Failed to process reply',
      message: error.message 
    });
  }
});

// Fetch chat history
app.get('/messages', async (req, res) => {
  try {
    const { userId, limit = 20, offset = 0 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sanitizedUserId = sanitizeInput(userId);
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    const [messages] = await pool.query(
      `SELECT * FROM messages 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [sanitizedUserId, limitNum, offsetNum]
    );

    // Reverse to get ascending order (oldest first)
    const sortedMessages = messages.reverse();

    const messageIds = sortedMessages.map(m => m.id);
    const repliesByMessage = await getRepliesForMessages(messageIds);

    const messagesWithReplies = sortedMessages.map(msg => ({
      ...msg,
      replies: repliesByMessage[msg.id] || []
    }));

    logger.info(`Fetched ${messagesWithReplies.length} messages for user: ${sanitizedUserId}`);
    res.json({
      messages: messagesWithReplies,
      pagination: {
        total: messagesWithReplies.length,
        limit: limitNum,
        offset: offsetNum
      }
    });
  } catch (error) {
    logger.error('Error fetching messages', error);
    res.status(500).json({ 
      error: 'Failed to fetch messages',
      message: error.message 
    });
  }
});

// User verification endpoint
app.post('/verify', async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId is required' });
    }

    const sanitizedTelegramId = sanitizeInput(telegramId);
    const formattedId = sanitizedTelegramId.startsWith('@') ? sanitizedTelegramId : `@${sanitizedTelegramId}`;

    const [rows] = await pool.query(
      'SELECT * FROM driversDirectory WHERE telegramId = ?', 
      [formattedId]
    );

    if (rows.length === 0) {
      logger.warn(`Access denied for telegramId: ${formattedId}`);
      return res.status(403).json({ 
        error: 'Access denied: Not a member.',
        code: 'UNAUTHORIZED'
      });
    }

    logger.info(`User verified successfully: ${formattedId}`);
    res.json({ 
      ok: true, 
      user: {
        telegramId: formattedId,
        verified: true
      }
    });
  } catch (error) {
    logger.error('Error during user verification', error);
    res.status(500).json({ 
      error: 'Verification failed',
      message: error.message 
    });
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);

  socket.on('socket register', async (msg) => {
    try {
      const { userId } = msg;
      
      if (!userId) {
        socket.emit('error', { message: 'userId is required' });
        return;
      }

      const sanitizedUserId = sanitizeInput(userId);
      onlineUsers.set(sanitizedUserId, socket.id);
      logger.info(`Socket registered for user: ${sanitizedUserId}`);
      
      socket.emit('registered', { userId: sanitizedUserId });
    } catch (error) {
      logger.error('Failed to register socketId', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });

  socket.on('chat message', async (msg) => {
    try {
      const { userId, content } = msg;
      
      if (!userId || !content) {
        socket.emit('error', { message: 'userId and content are required' });
        return;
      }

      const sanitizedUserId = sanitizeInput(userId);
      const sanitizedContent = sanitizeInput(content);
      
      if (!sanitizedContent || sanitizedContent.length > 1000) {
        socket.emit('error', { message: 'Invalid message content' });
        return;
      }

      onlineUsers.set(sanitizedUserId, socket.id);
      logger.info(`Chat message from user: ${sanitizedUserId}`);

      const [result] = await pool.query(
        'INSERT INTO messages (user_id, content) VALUES (?, ?)',
        [sanitizedUserId, sanitizedContent]
      );

      // Forward to external system (webhook)
      try {
        await axios.post(EXTERNAL_WEBHOOK_URL, {
          messageId: result.insertId,
          userId: sanitizedUserId,
          content: sanitizedContent,
          timestamp: new Date().toISOString()
        }, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        logger.info(`Message forwarded to external system: ${result.insertId}`);
      } catch (webhookError) {
        logger.error('Failed to forward message to external system', webhookError);
        // Don't fail the request if webhook fails
      }

      socket.emit('message sent', { 
        messageId: result.insertId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to save/send message', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    // Remove user from online map
    for (const [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        logger.info(`User disconnected: ${userId}`);
        break;
      }
    }
  });

  socket.on('error', (error) => {
    logger.error('Socket error', error);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`Server running on ${HOST}:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 