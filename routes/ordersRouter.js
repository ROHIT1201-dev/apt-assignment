import express from 'express';
import {
  verifyTriggers,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder
} from '../controllers/ordersController.js';

const router = express.Router();

router.get('/verify-triggers', verifyTriggers);
router.get('/orders', getOrders);
router.post('/orders', createOrder);
router.put('/orders/:id', updateOrder);
router.delete('/orders/:id', deleteOrder);

export default router;
