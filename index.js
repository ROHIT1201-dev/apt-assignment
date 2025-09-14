
import 'dotenv/config';
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Client } from 'pg';

const PORT = process.env.PORT || 3000;

const pg = new Client({
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

  
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.url.includes('orders')) {
      console.log(`${req.method} ${req.url}`, req.body || '');
    }
    next();
  });

 
  app.get('/verify-triggers', async (req, res) => {
    try {
      const triggers = await pg.query(`
        SELECT 
          trigger_name, 
          event_manipulation, 
          action_timing,
          action_statement
        FROM information_schema.triggers 
        WHERE event_object_table = 'orders'
        ORDER BY trigger_name
      `);
      
      const func = await pg.query(`
        SELECT 
          proname, 
          prosrc 
        FROM pg_proc 
        WHERE proname = 'notify_orders_change'
      `);

      res.json({
        triggers: triggers.rows,
        function_exists: func.rowCount > 0,
        function_source: func.rows?.prosrc?.substring(0, 200) + '...' || 'Not found'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // get routes
  app.get("/orders", async (req, res) => {
    try {
      const result = await pg.query("SELECT * FROM orders ORDER BY id DESC");
      res.json(result.rows);
    } catch (err) {
      console.error("Fetch error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Create route

  app.post('/orders', async (req, res) => {
    const { customer_name, product_name, status } = req.body;
    
    if (!customer_name || !product_name) {
      return res.status(400).json({ error: "customer_name and product_name required" });
    }

    try {
      console.log('Creating order:', { customer_name, product_name, status });
      
      await pg.query('BEGIN');
      
      const result = await pg.query(
        "INSERT INTO orders (customer_name, product_name, status) VALUES ($1,$2,$3) RETURNING *",
        [customer_name, product_name, status || "pending"]
      );
      
      await pg.query('COMMIT');
      console.log('Order created and committed:', result.rows);
      
      res.json(result.rows);
    } catch (err) {
      await pg.query('ROLLBACK');
      console.error("Insert error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update route
  app.put("/orders/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid order ID" });
    }
    
    if (!status) {
      return res.status(400).json({ error: "Status required" });
    }

    try {
      console.log(`Updating order ${id} to status: ${status}`);
      
      await pg.query('BEGIN');
      
      const result = await pg.query(
        "UPDATE orders SET status=$1, updated_at=now() WHERE id=$2 RETURNING *",
        [status, parseInt(id)]
      );
      
      if (result.rowCount === 0) {
        await pg.query('ROLLBACK');
        return res.status(404).json({ error: "Order not found" });
      }
      
      await pg.query('COMMIT');
      console.log('Order updated and committed:', result.rows);
      
      res.json(result.rows);
    } catch (err) {
      await pg.query('ROLLBACK');
      console.error("Update error", err);
      res.status(500).json({ error: err.message });
    }
  });

  //delete route
  app.delete("/orders/:id", async (req, res) => {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    try {
      console.log(`Deleting order ${id}`);
      
      await pg.query('BEGIN');
      
      const result = await pg.query("DELETE FROM orders WHERE id=$1 RETURNING *", [parseInt(id)]);
      
      if (result.rowCount === 0) {
        await pg.query('ROLLBACK');
        return res.status(404).json({ error: "Order not found" });
      }
      
      await pg.query('COMMIT');
      console.log('Order deleted and committed:', result.rows);
      
      res.json(result.rows);
    } catch (err) {
      await pg.query('ROLLBACK');
      console.error("Delete error", err);
      res.status(500).json({ error: err.message });
    }
  });

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
