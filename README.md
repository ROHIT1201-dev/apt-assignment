# 🟢 Real-Time Orders Dashboard

A **real-time order management system** built with **Node.js**, **PostgreSQL LISTEN/NOTIFY**, **WebSockets**, and optimized for **Neon Database** deployments.

---

## 🚀 Features

- ✅ Real-time order notifications using PostgreSQL triggers  
- 🔔 WebSocket-based live updates for instant UI synchronization  
- 💾 Full CRUD operations (Create, Read, Update, Delete) for orders  
- 🔄 Auto-reconnection logic for robust remote database connections  
- 🎯 Optimized for **Neon Database** with auto-suspend prevention  
- 📱 Responsive web interface with connection status indicators  
- 🧪 Built-in testing endpoints for debugging and validation  

---

## 📁 Project Structure



```text
real-time-orders/
├── server.js          # Main Express server with WebSocket support
├── public/
│   └── index.html     # Frontend dashboard with real-time updates
├── db.sql             # PostgreSQL schema and triggers
├── package.json       # Node.js dependencies
├── .env               # Environment configuration
└── README.md          # Project documentation

```


## 🛠️ Technology Stack

| Component | Technology | Why Chosen |
|-----------|------------|------------|
| **Backend** | Node.js + Express | Fast development, excellent PostgreSQL integration |
| **Database** | PostgreSQL + Neon | LISTEN/NOTIFY support, serverless scaling |
| **Real-time** | WebSockets + pg NOTIFY | Low latency, native database integration |
| **Frontend** | Vanilla JavaScript | Lightweight, no build process needed |
| **Database Driver** | node-postgres (pg) | Direct connection support for LISTEN/NOTIFY |

## ⚡ Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Neon Database** account (or any PostgreSQL 12+)
- **Git** for cloning

### 1. Clone & Install

```text
git clone <your-repo-url>
cd real-time-orders
npm install

```

### 2. Environment Setup

Create a `.env` file:

**For Neon Database:**

```text
DATABASE_URL=postgresql://user:pass@ep-name.region.neon.tech/dbname?sslmode=require
PORT=3000

```


### 3. Database Setup

Run the SQL schema in your PostgreSQL database:

Connect to your database and run:
```text
psql $DATABASE_URL -f db.sql

```
Or copy-paste the contents of `db.sql` into your database client.

### 4. Start the Server

```text
npm start
Visit [**http://localhost:3000**](http://localhost:3000) to see the real-time dashboard!

```


## 🎯 How It Works
```text
Client Browser ──WebSocket──→ Node.js Server ──LISTEN──→ PostgreSQL
↑ │
──Broadcast──←──NOTIFY──←─ Triggers

```


### Database Triggers

Every data modification automatically triggers notifications

-- When order is created/updated/deleted
```text
INSERT INTO orders (...) --> Trigger fires --> pg_notify() --> WebSocket broadcast

```

### Connection Management

**Problem:** Remote databases like Neon auto-suspend after 5 minutes of inactivity.

**Solution:** 25-second keepalive pings to maintain active connections.


## 🔧 API Endpoints

### Orders CRUD


| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/orders` | Fetch all orders |
| `GET` | `/orders/:id` | Fetch specific order |
| `POST` | `/orders` | Create new order |
| `PUT` | `/orders/:id` | Update order status |
| `DELETE` | `/orders/:id` | Delete order |


### Request Examples
**Create Order:**
```text
curl -X POST http://localhost:3000/orders
-H "Content-Type: application/json"
-d '{"customer_name":"John Doe","product_name":"Laptop","status":"pending"}'

  ```

**Update Order Status:**
```text
curl -X PUT http://localhost:3000/orders/1
-H "Content-Type: application/json"
-d '{"status":"shipped"}'

```

**Delete Order Status:**
```text
curl -X DELETE http://localhost:3000/orders/1
-H "Content-Type: application/json"
-d '{"status":"shipped"}'

```

## 🏗️ Technical Approach

### Why PostgreSQL LISTEN/NOTIFY?

**Alternative Options Considered:**
- ❌ **Polling**: High database load, delayed updates
- ❌ **Message Queues** (Redis/RabbitMQ): Additional infrastructure complexity  
- ❌ **Server-Sent Events**: One-way communication only
- ✅ **PostgreSQL LISTEN/NOTIFY**: Native, efficient, real-time

**Benefits:**
- **Zero additional infrastructure** - uses existing database
- **Atomic consistency** - notifications sent within transactions
- **Low latency** - direct database-to-application messaging
- **Reliable delivery** - PostgreSQL handles message queuing

### Neon Database Optimizations

**Challenge:** Neon databases auto-suspend after 5 minutes, breaking LISTEN connections.

**Solutions Implemented:**
1. **Keepalive pings** every 25 seconds
2. **Connection health monitoring** 
3. **Automatic reconnection** with exponential backoff
4. **Transaction-scoped operations** to ensure data consistency

### WebSocket Management

**Connection Resilience:**
- Client-side automatic reconnection
- Connection status indicators
- Graceful degradation when offline
- Message buffering during reconnection

**Performance Optimizations:**
- Message broadcasting to multiple clients
- Connection health checks (ping/pong)
- Memory-efficient client management

## 📚 Additional Resources

- [PostgreSQL LISTEN/NOTIFY Documentation](https://www.postgresql.org/docs/current/sql-notify.html)
- [Neon Database Guides](https://neon.com/guides/pg-notify)
- [WebSocket API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [node-postgres Documentation](https://node-postgres.com/)


**Built for real-time applications**

  

