-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'shipped', 'delivered')) DEFAULT 'pending',
  updated_at TIMESTAMPTZ DEFAULT now()
);

--Trigger Function for changes
CREATE OR REPLACE FUNCTION notify_orders_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
 
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    payload := json_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'when', now(),
      'row', json_build_object(
        'id', NEW.id,
        'customer_name', NEW.customer_name,
        'product_name', NEW.product_name,
        'status', NEW.status,
        'updated_at', NEW.updated_at
      )
    );

  
  ELSIF (TG_OP = 'DELETE') THEN
    payload := json_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'when', now(),
      'row', json_build_object(
        'id', OLD.id,
        'customer_name', OLD.customer_name,
        'product_name', OLD.product_name,
        'status', OLD.status,
        'updated_at', OLD.updated_at
      )
    );
  END IF;

  
  PERFORM pg_notify('messages_channel', payload::text);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS orders_notify_insert ON orders;
DROP TRIGGER IF EXISTS orders_notify_update ON orders;
DROP TRIGGER IF EXISTS orders_notify_delete ON orders;


CREATE TRIGGER orders_notify_insert
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION notify_orders_change();

CREATE TRIGGER orders_notify_update
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION notify_orders_change();

CREATE TRIGGER orders_notify_delete
AFTER DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION notify_orders_change();
