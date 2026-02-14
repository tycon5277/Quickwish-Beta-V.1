# Wisher App - Product Requirements Document

## Original Problem Statement
Build a "Wisher" application - a local community helper platform where users can make wishes and get help from nearby helpers (agents). The app includes:
- Wish creation and fulfillment system
- Local Hub for discovering shops/vendors
- Order lifecycle tracking
- Promotions/marketing features (banners, featured shops, explore feed)
- Agent fulfillment app (future)

## User Personas
1. **Wishers** - Users who need help with tasks (delivery, rides, errands, etc.)
2. **Agents** - Local helpers who fulfill wishes
3. **Vendors** - Local businesses/shops
4. **Promoters** - Marketing/promotional content creators

## Core Features

### Implemented ✅
1. **User Authentication** - Google Social Login via Emergent
2. **Wish System** - Create, manage, track wishes
3. **Local Hub** - Browse nearby vendors with categories
4. **Shop Details & Cart** - View products, add to cart, checkout
5. **Order Lifecycle Integration** - External API for order tracking (`https://order-lifecycle-7.preview.emergentagent.com`)
6. **Promotions Integration** - External API for marketing features (`https://promote-feature.preview.emergentagent.com`)
   - Banner carousel on Home
   - Featured shops on Local Hub
   - Explore feed with posts

### In Progress (MOCKED for visualization)
- Promotions feature uses MOCK DATA to visualize UI
- Awaiting user verification before restoring live API

### Future/Backlog
- **P0**: Fulfillment Agent App (spec at `/app/FULFILLMENT_APP_PROMPT.md`)
- **P1**: Backend for Explore Feed (vendor content creation UI)
- **P2**: Real-time chat with WebSockets
- **P2**: Payment gateway integration
- **P2**: Push notifications

## Tech Stack
- **Frontend**: React Native with Expo Router
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Emergent Google Social Login
- **External APIs**:
  - Order Lifecycle: `https://order-lifecycle-7.preview.emergentagent.com`
  - Promotions: `https://promote-feature.preview.emergentagent.com`

## Code Architecture
```
/app
├── backend/
│   └── server.py
└── frontend/
    ├── app/
    │   ├── (main)/ - Tab screens (home, explore, localhub, account)
    │   ├── orders/ - Order list and detail screens
    │   ├── shop/ - Shop detail and product screens
    │   └── wish/ - Wish creation screens
    ├── src/
    │   ├── api/wisherAPI.ts - Order lifecycle API calls
    │   └── utils/formatTime.ts - Date formatting
    └── FULFILLMENT_APP_PROMPT.md
```

## Current Status
- **Date**: February 14, 2026
- **Status**: Mock data added for Promotions visualization
- **Pending**: User verification of UI, then restore live API calls

## API Endpoints (External)

### Order Lifecycle API
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders
- `GET /api/orders/{id}` - Get order detail
- `POST /api/orders/{id}/cancel` - Cancel order

### Promotions API
- `GET /api/wisher/home/banners` - Get promotional banners
- `GET /api/wisher/localhub/featured` - Get featured shop IDs
- `GET /api/wisher/explore/promoted` - Get promoted highlights
- `GET /api/wisher/explore/feed` - Get feed posts
- `POST /api/wisher/posts/{id}/like` - Like a post
- `POST /api/wisher/shops/{id}/follow` - Follow a shop
