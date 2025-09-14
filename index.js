import 'dotenv/config';
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Client } from 'pg';
import ordersRouter from './routes/ordersRouter.js';

const PORT = process.env.PORT || 3000;


export const pg = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
});


let isConnected = false;
let reconnectTimer = null;
let keepAliveTimer = null;

async function connectToDatabase() {
  try {
    if (isConnected) return;
    
    console.log('🔄 Connecting to PostgreSQL...');
    await pg.connect();
    
    
    const result = await pg.query(`
      SELECT 
        current_database() as db,
        session_user as user,
        version() as version,
        now() as connected_at
    `);
    console.log('Connected to:', result.rows);
    
    
    await pg.query('LISTEN messages_channel');
    console.log('Listening on channel: messages_channel');
    
    
    const listening = await pg.query(`
      SELECT 
        pid,
        application_name,
        state,
        query_start
      FROM pg_stat_activity 
      WHERE pid = pg_backend_pid()
    `);
    console.log('Connection status:', listening.rows);
    
    isConnected = true;
    startKeepAlive();
    
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
  } catch (err) {
    console.error('Connection failed:', err.message);
    isConnected = false;
    scheduleReconnect();
  }
}

function startKeepAlive() {
  
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  
  keepAliveTimer = setInterval(async () => {
    if (!isConnected) return;
    
    try {
     
      await pg.query('SELECT 1 as keepalive, now() as ping_time');
      console.log('Keepalive ping successful');
    } catch (err) {
      console.error('Keepalive failed:', err.message);
      isConnected = false;
      stopKeepAlive();
      scheduleReconnect();
    }
  }, 25000); 
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  
  console.log('Scheduling reconnection in 5 seconds...');
  reconnectTimer = setTimeout(async () => {
    console.log(' Attempting reconnection...');
    reconnectTimer = null;
    await connectToDatabase();
  }, 5000);
}

async function main() {
  
  await connectToDatabase();

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static('public'));

  // Log non-GET or non-orders requests
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.url.includes('orders')) {
      console.log(`${req.method} ${req.url}`, req.body || '');
    }
    next();
  });

  // Use the orders router for all order and trigger routes
  app.use('/', ordersRouter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.isAlive = true;
    
    ws.send(JSON.stringify({ 
      info: 'connected', 
      when: new Date().toISOString(),
      server_time: new Date().toLocaleString()
    }));

    ws.on('pong', () => ws.isAlive = true);
    ws.on('error', (err) => console.error('WebSocket error:', err));
    ws.on('close', () => console.log('🔌 WebSocket client disconnected'));
  });

  
  const wsInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

 
  function broadcast(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    const clientCount = wss.clients.size;
    
    if (clientCount === 0) {
      console.log('📭 No WebSocket clients connected');
      return;
    }
    
    let sentCount = 0;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    
    console.log(`Broadcasted to ${sentCount}/${clientCount} clients`);
  }


  pg.on('error', (err) => {
    console.error('PostgreSQL error:', err.message);
    isConnected = false;
    stopKeepAlive();
    scheduleReconnect();
  });
    //notifications
  pg.on('notification', (msg) => {
    try {
      console.log(' Raw notification received:', {
        channel: msg.channel,
        payload_length: msg.payload?.length,
        payload_preview: msg.payload?.substring(0, 100)
      });
      
      const payload = JSON.parse(msg.payload);
      console.log('Parsed notification:', {
        operation: payload.operation,
        table: payload.table,
        row_id: payload.row?.id,
        customer: payload.row?.customer_name
      });
      
      broadcast(payload);
    } catch (err) {
      console.error(' Notification parsing failed:', err.message);
      console.error('Raw payload:', msg.payload);
      
      broadcast({
        error: 'Parse failed',
        raw_payload: msg.payload,
        when: new Date().toISOString()
      });
    }
  });

 
  process.on('SIGINT', () => {
    console.log('\n Shutting down...');
    stopKeepAlive();
    clearInterval(wsInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    
    pg.end().then(() => {
      console.log('🔌 Database disconnected');
      process.exit(0);
    });
  });

  server.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
   
  });
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
