// Wisher API utility for Order Lifecycle integration
// Backend URL: https://order-lifecycle-8.preview.emergentagent.com

import axios from 'axios';

const ORDER_BACKEND_URL = 'https://order-lifecycle-8.preview.emergentagent.com';

// Create axios instance for order lifecycle APIs
const orderAPI = axios.create({
  baseURL: ORDER_BACKEND_URL,
  timeout: 30000,
});

// Add auth interceptor
export const setOrderAPIAuth = (token: string) => {
  orderAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

// Status color mapping
export const ORDER_STATUS_COLORS: Record<string, { color: string; bgColor: string; label: string; icon: string }> = {
  placed: { color: '#3B82F6', bgColor: '#EFF6FF', label: 'Order Placed', icon: 'time' },
  confirmed: { color: '#22C55E', bgColor: '#F0FDF4', label: 'Confirmed', icon: 'checkmark-circle' },
  preparing: { color: '#F97316', bgColor: '#FFF7ED', label: 'Preparing', icon: 'flame' },
  ready: { color: '#EAB308', bgColor: '#FEFCE8', label: 'Ready for Pickup', icon: 'cube' },
  awaiting_pickup: { color: '#8B5CF6', bgColor: '#F5F3FF', label: 'Awaiting Pickup', icon: 'hourglass' },
  picked_up: { color: '#3B82F6', bgColor: '#EFF6FF', label: 'Picked Up', icon: 'bicycle' },
  on_the_way: { color: '#0EA5E9', bgColor: '#F0F9FF', label: 'On The Way', icon: 'navigate' },
  delivered: { color: '#22C55E', bgColor: '#F0FDF4', label: 'Delivered', icon: 'checkmark-done-circle' },
  cancelled: { color: '#EF4444', bgColor: '#FEF2F2', label: 'Cancelled', icon: 'close-circle' },
};

// Order timeline steps
export const ORDER_STATUS_STEPS = [
  'placed',
  'confirmed', 
  'preparing',
  'ready',
  'awaiting_pickup',
  'picked_up',
  'on_the_way',
  'delivered'
];

// Types
export interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface CreateOrderData {
  vendor_id: string;
  items: OrderItem[];
  delivery_address: {
    address: string;
    lat?: number;
    lng?: number;
  };
  delivery_type: 'agent_delivery' | 'shop_delivery';
  special_instructions?: string;
}

export interface OrderStatusResponse {
  order_id: string;
  status: string;
  timeline: Array<{
    status: string;
    timestamp: string;
    message: string;
  }>;
  vendor: {
    id: string;
    name: string;
    image?: string;
    phone?: string;
  };
  genie?: {
    name: string;
    phone: string;
    photo: string;
    rating: number;
    vehicle_type: string;
    estimated_time: string;
    location?: {
      lat: number;
      lng: number;
    };
  };
  items: OrderItem[];
  total_amount: number;
  delivery_address: {
    address: string;
    lat?: number;
    lng?: number;
  };
  delivery_fee: number;
  created_at: string;
}

export interface WisherOrder {
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_image?: string;
  items: OrderItem[];
  total_amount: number;
  status: string;
  delivery_type: string;
  created_at: string;
}

// API functions
export const wisherAPI = {
  // Create a new order
  createOrder: async (data: CreateOrderData) => {
    const response = await orderAPI.post('/api/wisher/orders', data);
    return response.data;
  },

  // Get all orders for current user
  getOrders: async (): Promise<{ orders: WisherOrder[]; count: number }> => {
    const response = await orderAPI.get('/api/wisher/orders');
    return response.data;
  },

  // Get order status with timeline (poll every 10 seconds)
  getOrderStatus: async (orderId: string): Promise<OrderStatusResponse> => {
    const response = await orderAPI.get(`/api/orders/${orderId}/status`);
    return response.data;
  },

  // Cancel order (only before vendor accepts)
  cancelOrder: async (orderId: string, reason?: string) => {
    const response = await orderAPI.post(`/api/wisher/orders/${orderId}/cancel`, { reason });
    return response.data;
  },
};

export default wisherAPI;
