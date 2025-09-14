// Controller for orders and triggers
import {pg }from '../index.js';

export const verifyTriggers = async (req, res) => {
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
};

export const getOrders = async (req, res) => {
  try {
    const result = await pg.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createOrder = async (req, res) => {
  const { customer_name, product_name, status } = req.body;
  if (!customer_name || !product_name) {
    return res.status(400).json({ error: 'customer_name and product_name required' });
  }
  try {
    await pg.query('BEGIN');
    const result = await pg.query(
      'INSERT INTO orders (customer_name, product_name, status) VALUES ($1,$2,$3) RETURNING *',
      [customer_name, product_name, status || 'pending']
    );
    await pg.query('COMMIT');
    res.json(result.rows);
  } catch (err) {
    await pg.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
};

export const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  if (!status) {
    return res.status(400).json({ error: 'Status required' });
  }
  try {
    await pg.query('BEGIN');
    const result = await pg.query(
      'UPDATE orders SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [status, parseInt(id)]
    );
    if (result.rowCount === 0) {
      await pg.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    await pg.query('COMMIT');
    res.json(result.rows);
  } catch (err) {
    await pg.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
};

export const deleteOrder = async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  try {
    await pg.query('BEGIN');
    const result = await pg.query('DELETE FROM orders WHERE id=$1 RETURNING *', [parseInt(id)]);
    if (result.rowCount === 0) {
      await pg.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    await pg.query('COMMIT');
    res.json(result.rows);
  } catch (err) {
    await pg.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
};
