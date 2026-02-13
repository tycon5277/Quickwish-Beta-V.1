import axios from 'axios';

// External Order Lifecycle API
const ORDER_API_BASE = 'https://order-lifecycle-7.preview.emergentagent.com';

const orderApi = axios.create({
  baseURL: ORDER_API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface DeliveryAddress {
  address: string;
  lat?: number;
  lng?: number;
}

export interface CreateOrderData {
  vendor_id: string;
  items: OrderItem[];
  delivery_address: DeliveryAddress;
  delivery_type: 'agent_delivery' | 'shop_delivery';
  special_instructions?: string;
}

export interface TimelineEvent {
  status: string;
  timestamp: string;
  message: string;
}

export interface GenieInfo {
  name: string;
  phone: string;
  photo: string;
  rating: number;
  vehicle_type: string;
  estimated_time: string;
}

export interface VendorInfo {
  id: string;
  name: string;
}

export interface OrderStatus {
  order_id: string;
  status: 'placed' | 'confirmed' | 'preparing' | 'ready' | 'awaiting_pickup' | 'picked_up' | 'delivered' | 'cancelled';
  timeline: TimelineEvent[];
  vendor: VendorInfo;
  genie?: GenieInfo;
  total_amount: number;
}

export interface Order {
  order_id: string;
  vendor_id: string;
  vendor_name?: string;
  status: string;
  total_amount: number;
  created_at: string;
  items?: OrderItem[];
  delivery_address?: DeliveryAddress;
}

export interface OrdersResponse {
  orders: Order[];
  count: number;
}

// Wisher API functions
export const wisherAPI = {
  // Create a new order
  createOrder: async (data: CreateOrderData, sessionToken: string) => {
    const response = await orderApi.post('/api/wisher/orders', data, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return response.data;
  },

  // Get all orders for the current user
  getOrders: async (sessionToken: string): Promise<OrdersResponse> => {
    const response = await orderApi.get('/api/wisher/orders', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return response.data;
  },

  // Get order status (for polling)
  getOrderStatus: async (orderId: string, sessionToken: string): Promise<OrderStatus> => {
    const response = await orderApi.get(`/api/orders/${orderId}/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return response.data;
  },

  // Cancel an order
  cancelOrder: async (orderId: string, reason: string, sessionToken: string) => {
    const response = await orderApi.post(
      `/api/wisher/orders/${orderId}/cancel`,
      { reason },
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    );
    return response.data;
  },
};

// Status color mapping
export const STATUS_COLORS: Record<string, { color: string; bgColor: string; label: string; icon: string }> = {
  placed: { color: '#3B82F6', bgColor: '#EFF6FF', label: 'Order Placed', icon: 'time' },
  confirmed: { color: '#10B981', bgColor: '#D1FAE5', label: 'Confirmed', icon: 'checkmark-circle' },
  preparing: { color: '#F97316', bgColor: '#FFF7ED', label: 'Preparing', icon: 'flame' },
  ready: { color: '#EAB308', bgColor: '#FEFCE8', label: 'Ready', icon: 'cube' },
  awaiting_pickup: { color: '#8B5CF6', bgColor: '#F3E8FF', label: 'Awaiting Pickup', icon: 'hourglass' },
  picked_up: { color: '#3B82F6', bgColor: '#EFF6FF', label: 'Picked Up', icon: 'bicycle' },
  delivered: { color: '#10B981', bgColor: '#D1FAE5', label: 'Delivered', icon: 'checkmark-done-circle' },
  cancelled: { color: '#EF4444', bgColor: '#FEE2E2', label: 'Cancelled', icon: 'close-circle' },
};

// Status steps for timeline
export const STATUS_STEPS = ['placed', 'confirmed', 'preparing', 'ready', 'awaiting_pickup', 'picked_up', 'delivered'];

export default wisherAPI;
