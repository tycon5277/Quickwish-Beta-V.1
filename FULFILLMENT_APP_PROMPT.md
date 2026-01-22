# QuickWish Fulfillment Agent App - Development Context

## 🎯 Overview

I need to build a **Fulfillment Agent App** for the QuickWish platform. This is a companion app to the existing QuickWish consumer app. The Fulfillment Agent app is for delivery agents/drivers who will:
- Accept and fulfill delivery orders from the Local Hub marketplace
- Accept and fulfill "Wishes" (custom delivery/errand requests)
- Update order statuses in real-time
- Share live location during deliveries
- Communicate with customers via chat
- Track their earnings

## 🏗️ Existing Architecture

### Tech Stack (Already Built)
- **Backend**: FastAPI (Python) running on port 8001
- **Database**: MongoDB
- **Consumer App**: Expo React Native (already built)
- **Authentication**: Google OAuth via Emergent Social Login

### Backend Location
The backend is already built and running at `/app/backend/server.py`. The Fulfillment app will **share the same backend** - you just need to add new agent-specific endpoints.

### API Base URL
All API routes are prefixed with `/api` and the backend runs on port 8001.
- Example: `GET /api/orders` → fetches orders
- The frontend uses `EXPO_PUBLIC_BACKEND_URL` environment variable

---

## 📊 Database Collections (MongoDB)

### 1. `users` Collection
```javascript
{
  _id: ObjectId,
  email: string,
  name: string,
  picture: string (URL),
  phone: string (optional),
  addresses: [{ id, label, address, is_default }],
  created_at: datetime,
  // NEW FIELDS TO ADD FOR AGENTS:
  is_agent: boolean,
  agent_status: "available" | "busy" | "offline",
  agent_vehicle: "bike" | "scooter" | "car",
  agent_rating: float,
  agent_total_deliveries: int,
  agent_earnings: float
}
```

### 2. `shop_orders` Collection
```javascript
{
  order_id: string,
  user_id: string,           // Customer's email
  vendor_id: string,
  vendor_name: string,
  items: [{ product_id, name, price, quantity, image }],
  total_amount: float,
  delivery_address: { address, lat, lng },
  delivery_type: "shop_delivery" | "agent_delivery",
  delivery_fee: float,
  assigned_agent_id: string (optional),  // Agent's email when assigned
  status: string,  // See status flow below
  payment_status: "pending" | "paid" | "failed",
  status_history: [{ status, timestamp, message }],
  agent_location: { lat, lng, timestamp },  // Live location
  created_at: datetime
}
```

### Order Status Flow:
```
pending → confirmed → preparing → ready → picked_up → on_the_way → nearby → delivered
                                                                          ↓
                                                                     cancelled
```

### 3. `wishes` Collection
```javascript
{
  wish_id: string,
  user_id: string,
  wish_type: "delivery" | "ride_request" | "errands" | "medicine_delivery" | etc,
  title: string,
  description: string,
  pickup_address: { address, lat, lng },
  delivery_address: { address, lat, lng },
  scheduled_time: datetime,
  remuneration: float,        // Payment offered
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled",
  accepted_by: string,        // Agent's email
  created_at: datetime
}
```

### 4. `chat_rooms` Collection
```javascript
{
  room_id: string,
  wish_id: string,
  participants: [user_email, agent_email],
  wish_title: string,
  status: "negotiating" | "deal_approved" | "completed",
  created_at: datetime
}
```

### 5. `messages` Collection
```javascript
{
  message_id: string,
  room_id: string,
  sender_id: string,
  content: string,
  type: "text" | "location" | "image",
  created_at: datetime
}
```

---

## 🔌 Existing API Endpoints (Already Built)

### Authentication
- `POST /api/auth/session` - Create session (Google OAuth)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Orders (Consumer-facing, but agents can use)
- `GET /api/orders` - Get user's orders
- `GET /api/orders/{order_id}` - Get order details
- `PUT /api/orders/{order_id}/status?status=xxx` - Update order status ⭐
- `PUT /api/orders/{order_id}/agent-location` - Update agent's live location ⭐

### Wishes
- `GET /api/wishes` - Get wishes
- `GET /api/wishes/{wish_id}` - Get wish details
- `PUT /api/wishes/{wish_id}` - Update wish

### Chat
- `GET /api/chat/rooms` - Get chat rooms
- `GET /api/chat/rooms/{room_id}/messages` - Get messages
- `POST /api/chat/rooms/{room_id}/messages` - Send message
- `PUT /api/chat/rooms/{room_id}/approve` - Approve deal

### Local Hub
- `GET /api/localhub/vendors` - Get vendors list
- `GET /api/localhub/vendors/{vendor_id}` - Get vendor details

---

## 🆕 New API Endpoints Needed (To Build)

### Agent Authentication & Profile
```python
PUT /api/agent/profile
# Update agent profile (vehicle type, availability)

PUT /api/agent/status
# Update agent status: available/busy/offline
Body: { "status": "available" }

GET /api/agent/stats
# Get agent's stats (total deliveries, earnings, rating)
```

### Agent Order Management
```python
GET /api/agent/available-orders
# Get all orders waiting for agent pickup (delivery_type="agent_delivery", status="ready")

POST /api/agent/orders/{order_id}/accept
# Agent accepts an order
# Sets assigned_agent_id and status to "picked_up"

GET /api/agent/orders
# Get agent's assigned orders (past and current)

GET /api/agent/orders/active
# Get agent's current active deliveries
```

### Agent Wish Management
```python
GET /api/agent/available-wishes
# Get all pending wishes in agent's area

POST /api/agent/wishes/{wish_id}/accept
# Agent accepts a wish
# Creates chat room, sets accepted_by

GET /api/agent/wishes
# Get agent's accepted wishes
```

### Earnings
```python
GET /api/agent/earnings
# Get earnings summary (today, week, month, total)

GET /api/agent/earnings/history
# Get detailed earnings history
```

---

## 📱 Fulfillment App Screens Needed

### 1. **Login Screen**
- Google OAuth (same as consumer app)
- After login, check if user is_agent, if not, show "Become an Agent" registration

### 2. **Agent Registration** (if not already agent)
- Vehicle type selection (bike/scooter/car)
- ID verification (placeholder for now)
- Phone number verification

### 3. **Home Dashboard**
- Toggle: Online/Offline status
- Today's earnings summary
- Active deliveries count
- Quick stats (total deliveries, rating)

### 4. **Available Orders Tab**
- List of orders ready for pickup (agent_delivery type)
- Each card shows: Vendor name, items count, delivery address, estimated earnings
- "Accept" button on each

### 5. **Available Wishes Tab**
- List of pending wishes nearby
- Each card shows: Wish type, description, pickup→delivery, offered payment
- "Make Offer" button → opens chat

### 6. **My Deliveries Tab**
- Active deliveries (in progress)
- Order card with status stepper
- "Update Status" buttons: Picked Up → On the Way → Nearby → Delivered
- "Share Live Location" toggle
- "Navigate" button (opens maps)
- "Call Customer" button

### 7. **Chat Screen**
- Same as consumer app but from agent perspective
- For wish negotiations

### 8. **Earnings Screen**
- Today/Week/Month toggle
- Earnings chart
- Transaction history

### 9. **Profile Screen**
- Profile photo, name, rating
- Vehicle type
- Total deliveries
- Documents (placeholder)
- Settings

---

## 🎨 Design Guidelines

### Color Palette (Match Consumer App)
```
Primary Purple: #7C3AED
Secondary Blue: #0EA5E9
Accent Amber: #F59E0B
Background: #F8F9FA
Text Primary: #212529
Text Secondary: #6C757D
Pastel Lavender: #E8D9F4
Pastel Blue: #D0E9F7
Pastel Yellow: #FCE9C6
```

### Agent-Specific Colors
```
Online/Available: #22C55E (green)
Busy: #F59E0B (amber)
Offline: #9CA3AF (gray)
```

---

## 🔗 Integration Points

### 1. Order Flow Integration
When consumer places order with `delivery_type: "agent_delivery"`:
1. Order created with `status: "pending"`
2. Vendor confirms → `status: "preparing"`
3. Vendor marks ready → `status: "ready"`
4. **Agent sees in "Available Orders"**
5. Agent accepts → `assigned_agent_id` set, `status: "picked_up"`
6. Agent updates: `on_the_way` → `nearby` → `delivered`
7. Consumer sees live tracking on their app

### 2. Wish Flow Integration
When consumer creates a Wish:
1. Wish created with `status: "pending"`
2. **Agent sees in "Available Wishes"**
3. Agent clicks "Make Offer" → Chat room created
4. Negotiation in chat
5. Consumer approves deal → `status: "deal_approved"`
6. Agent completes → `status: "completed"`

### 3. Live Location Sharing
```javascript
// Agent app sends location every 10 seconds during delivery
PUT /api/orders/{order_id}/agent-location
Body: { "lat": 12.9716, "lng": 77.5946, "timestamp": "2024-01-22T..." }

// Consumer app polls or uses websocket to get updates
GET /api/orders/{order_id}
// Returns agent_location in response
```

---

## 📁 File Structure Recommendation

```
/app/frontend-agent/          # NEW - Agent app frontend
├── app/
│   ├── (auth)/
│   │   └── login.tsx
│   ├── (main)/
│   │   ├── _layout.tsx       # Tab navigator
│   │   ├── home.tsx          # Dashboard
│   │   ├── orders.tsx        # Available orders
│   │   ├── wishes.tsx        # Available wishes
│   │   ├── deliveries.tsx    # My active deliveries
│   │   └── profile.tsx       # Agent profile
│   ├── delivery/
│   │   └── [id].tsx          # Active delivery detail with tracking
│   ├── chat/
│   │   └── [roomId].tsx      # Chat screen
│   └── _layout.tsx           # Root layout with auth
├── src/
│   └── store.ts              # Zustand store
├── package.json
└── app.json

/app/backend/server.py        # EXISTING - Add agent endpoints here
```

---

## ⚠️ Important Notes

1. **Same Backend**: Don't create a new backend. Add agent endpoints to existing `/app/backend/server.py`

2. **Auth Token**: Use same session-based auth. The `is_agent` field in user document differentiates agents.

3. **Real-time Updates**: Currently using HTTP polling. WebSocket can be added later.

4. **Location Permissions**: Agent app needs background location permission for live tracking.

5. **Start Simple**: Build MVP first:
   - Agent login/registration
   - View & accept available orders
   - Update delivery status
   - Basic earnings view

---

## 🚀 Suggested Build Order

1. **Phase 1**: Agent auth + registration
2. **Phase 2**: View available orders + accept
3. **Phase 3**: Delivery tracking (status updates + location)
4. **Phase 4**: Earnings dashboard
5. **Phase 5**: Wish acceptance + chat
6. **Phase 6**: Polish & notifications

---

## 📋 Quick Start Commands

```bash
# Backend is already running at port 8001
# Check health: curl http://localhost:8001/api/health

# Create new Expo app for agent
cd /app
npx create-expo-app frontend-agent --template blank-typescript
cd frontend-agent
npx expo install expo-router expo-location react-native-safe-area-context ...
```

Good luck building! 🎉
