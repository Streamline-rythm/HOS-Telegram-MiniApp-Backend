# Chat Backend Starter (Express + Socket.IO + Google Cloud SQL/MySQL)

## Features
- Express server
- Real-time chat with Socket.IO
- MySQL (Google Cloud SQL) integration
- REST endpoint for fetching messages and all replies
- Environment variable configuration

## Setup

1. **Clone the repo and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your Google Cloud SQL credentials.

3. **Create MySQL tables:**
   ```sql
   CREATE TABLE messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id TEXT,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE replies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      reply_content TEXT,
      reply_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
   );
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Endpoints:**
   - `GET /` — Health check
   - `GET /messages?userId=...` — Fetch all chat messages and all replies for the user
   - Socket.IO event: `chat message` — Send message
   - Socket.IO event: `reply` — Receive reply in real-time
   - `POST /webhook/reply` — Webhook for external system to send replies (supports multiple replies per message)

---

**Note:**
- For production, restrict your Cloud SQL instance’s authorized networks.
- Add authentication and validation as needed.
- The backend now supports multiple replies per message via the `replies` table. 