from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Cookie
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== MODELS =====================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    phone: Optional[str] = None
    addresses: List[dict] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

class WishCreate(BaseModel):
    wish_type: str
    title: str
    description: Optional[str] = None
    location: dict  # {lat, lng, address}
    radius_km: float = 5.0
    remuneration: float
    is_immediate: bool = True
    scheduled_time: Optional[datetime] = None

class Wish(BaseModel):
    wish_id: str
    user_id: str
    wish_type: str
    title: str
    description: Optional[str] = None
    location: dict
    radius_km: float
    remuneration: float
    is_immediate: bool
    scheduled_time: Optional[datetime] = None
    status: str = "pending"  # pending, accepted, in_progress, completed, cancelled
    accepted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRoom(BaseModel):
    room_id: str
    wish_id: str
    wisher_id: str
    agent_id: str
    status: str = "active"  # active, approved, completed, cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Message(BaseModel):
    message_id: str
    room_id: str
    sender_id: str
    sender_type: str  # wisher or agent
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageCreate(BaseModel):
    content: str

# ===================== LOCAL HUB MODELS =====================

class HubVendor(BaseModel):
    vendor_id: str
    name: str
    description: str
    category: str  # grocery, restaurant, pharmacy, electronics, fashion, etc.
    image: str
    rating: float = 0.0
    total_ratings: int = 0
    location: dict  # {lat, lng, address}
    contact_phone: Optional[str] = None
    opening_hours: str = "9:00 AM - 9:00 PM"
    has_own_delivery: bool = False
    delivery_radius_km: float = 5.0
    is_verified: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Product(BaseModel):
    product_id: str
    vendor_id: str
    name: str
    description: str
    price: float
    discounted_price: Optional[float] = None
    images: List[str] = []
    category: str
    stock: int = 100
    likes: int = 0
    rating: float = 0.0
    total_ratings: int = 0
    is_available: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CartItem(BaseModel):
    product_id: str
    quantity: int = 1

class CartUpdate(BaseModel):
    product_id: str
    quantity: int

class ShopOrder(BaseModel):
    order_id: str
    user_id: str
    vendor_id: str
    items: List[dict]  # [{product_id, name, price, quantity}]
    total_amount: float
    delivery_address: dict
    delivery_type: str  # "shop_delivery" or "agent_delivery"
    delivery_fee: float = 0.0
    assigned_agent_id: Optional[str] = None
    status: str = "pending"  # pending, confirmed, preparing, ready, out_for_delivery, delivered, cancelled
    payment_status: str = "pending"  # pending, paid, failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LocalBusiness(BaseModel):
    business_id: str
    name: str
    category: str
    description: Optional[str] = None
    image: Optional[str] = None
    location: dict
    rating: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExplorePost(BaseModel):
    post_id: str
    title: str
    content: str
    post_type: str  # celebration, milestone, event, news
    image: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AddressCreate(BaseModel):
    label: str  # home, office, etc.
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None

class PhoneUpdate(BaseModel):
    phone: str

# ===================== AUTH HELPERS =====================

async def get_current_user(request: Request, session_token: Optional[str] = Cookie(default=None)) -> Optional[User]:
    """Get current user from session token (cookie or header)"""
    token = session_token
    
    # Fallback to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        return None
    
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    
    # Check expiry with timezone handling
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if user_doc:
        return User(**user_doc)
    return None

async def require_auth(request: Request, session_token: Optional[str] = Cookie(default=None)) -> User:
    """Require authenticated user"""
    user = await get_current_user(request, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ===================== AUTH ENDPOINTS =====================

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID header")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client:
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            user_data = auth_response.json()
        except Exception as e:
            logger.error(f"Auth API error: {e}")
            raise HTTPException(status_code=500, detail="Authentication service error")
    
    session_data = SessionDataResponse(**user_data)
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": session_data.email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": session_data.email,
            "name": session_data.name,
            "picture": session_data.picture,
            "phone": None,
            "addresses": [],
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_data.session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_data.session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7*24*60*60,
        path="/"
    )
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user_doc, "session_token": session_data.session_token}

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(require_auth)):
    """Get current authenticated user"""
    return current_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, session_token: Optional[str] = Cookie(default=None)):
    """Logout user"""
    token = session_token
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ===================== USER ENDPOINTS =====================

@api_router.put("/users/phone")
async def update_phone(phone_data: PhoneUpdate, current_user: User = Depends(require_auth)):
    """Update user phone number"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"phone": phone_data.phone}}
    )
    return {"message": "Phone updated successfully"}

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    picture: Optional[str] = None

@api_router.put("/users/profile")
async def update_profile(profile_data: ProfileUpdate, current_user: User = Depends(require_auth)):
    """Update user profile (name, age, picture)"""
    update_fields = {}
    if profile_data.name is not None:
        update_fields["name"] = profile_data.name
    if profile_data.age is not None:
        update_fields["age"] = profile_data.age
    if profile_data.picture is not None:
        update_fields["picture"] = profile_data.picture
    
    if update_fields:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": update_fields}
        )
    return {"message": "Profile updated successfully"}

@api_router.post("/users/addresses")
async def add_address(address: AddressCreate, current_user: User = Depends(require_auth)):
    """Add user address"""
    address_doc = address.dict()
    address_doc["id"] = str(uuid.uuid4())
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$push": {"addresses": address_doc}}
    )
    return {"message": "Address added", "address": address_doc}

@api_router.delete("/users/addresses/{address_id}")
async def delete_address(address_id: str, current_user: User = Depends(require_auth)):
    """Delete user address"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$pull": {"addresses": {"id": address_id}}}
    )
    return {"message": "Address deleted"}

# ===================== WISH ENDPOINTS =====================

@api_router.post("/wishes", response_model=Wish)
async def create_wish(wish_data: WishCreate, current_user: User = Depends(require_auth)):
    """Create a new wish"""
    wish_id = f"wish_{uuid.uuid4().hex[:12]}"
    wish = Wish(
        wish_id=wish_id,
        user_id=current_user.user_id,
        **wish_data.dict()
    )
    await db.wishes.insert_one(wish.dict())
    return wish

@api_router.get("/wishes", response_model=List[Wish])
async def get_my_wishes(current_user: User = Depends(require_auth)):
    """Get all wishes for current user"""
    wishes = await db.wishes.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return [Wish(**w) for w in wishes]

@api_router.get("/wishes/{wish_id}", response_model=Wish)
async def get_wish(wish_id: str, current_user: User = Depends(require_auth)):
    """Get a specific wish"""
    wish = await db.wishes.find_one({"wish_id": wish_id}, {"_id": 0})
    if not wish:
        raise HTTPException(status_code=404, detail="Wish not found")
    return Wish(**wish)

@api_router.put("/wishes/{wish_id}/cancel")
async def cancel_wish(wish_id: str, current_user: User = Depends(require_auth)):
    """Cancel a wish"""
    result = await db.wishes.update_one(
        {"wish_id": wish_id, "user_id": current_user.user_id, "status": "pending"},
        {"$set": {"status": "cancelled"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot cancel this wish")
    return {"message": "Wish cancelled"}

@api_router.put("/wishes/{wish_id}/complete")
async def complete_wish(wish_id: str, current_user: User = Depends(require_auth)):
    """Mark a wish as completed"""
    result = await db.wishes.update_one(
        {"wish_id": wish_id, "user_id": current_user.user_id, "status": {"$in": ["pending", "accepted", "in_progress"]}},
        {"$set": {"status": "completed"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot complete this wish")
    return {"message": "Wish marked as completed"}

@api_router.delete("/wishes/{wish_id}")
async def delete_wish(wish_id: str, current_user: User = Depends(require_auth)):
    """Delete a wish"""
    result = await db.wishes.delete_one(
        {"wish_id": wish_id, "user_id": current_user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wish not found or cannot be deleted")
    return {"message": "Wish deleted"}

@api_router.put("/wishes/{wish_id}")
async def update_wish(wish_id: str, wish_data: WishCreate, current_user: User = Depends(require_auth)):
    """Update a wish"""
    # Only allow updating pending wishes
    existing_wish = await db.wishes.find_one(
        {"wish_id": wish_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not existing_wish:
        raise HTTPException(status_code=404, detail="Wish not found")
    if existing_wish["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only edit pending wishes")
    
    update_data = wish_data.dict()
    await db.wishes.update_one(
        {"wish_id": wish_id},
        {"$set": update_data}
    )
    
    updated_wish = await db.wishes.find_one({"wish_id": wish_id}, {"_id": 0})
    return Wish(**updated_wish)

# ===================== CHAT ENDPOINTS =====================

@api_router.get("/chat/rooms", response_model=List[dict])
async def get_chat_rooms(current_user: User = Depends(require_auth)):
    """Get all chat rooms for current user (wisher)"""
    rooms = await db.chat_rooms.find(
        {"wisher_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with wish and last message info
    enriched_rooms = []
    for room in rooms:
        wish = await db.wishes.find_one({"wish_id": room["wish_id"]}, {"_id": 0})
        last_message = await db.messages.find_one(
            {"room_id": room["room_id"]},
            {"_id": 0}
        )
        if last_message:
            last_message = await db.messages.find(
                {"room_id": room["room_id"]},
                {"_id": 0}
            ).sort("created_at", -1).limit(1).to_list(1)
            last_message = last_message[0] if last_message else None
        
        enriched_rooms.append({
            **room,
            "wish": wish,
            "last_message": last_message
        })
    
    return enriched_rooms

@api_router.get("/chat/rooms/{room_id}/messages", response_model=List[Message])
async def get_messages(room_id: str, current_user: User = Depends(require_auth)):
    """Get messages for a chat room"""
    # Verify user has access to this room
    room = await db.chat_rooms.find_one(
        {"room_id": room_id, "wisher_id": current_user.user_id},
        {"_id": 0}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    messages = await db.messages.find(
        {"room_id": room_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    return [Message(**m) for m in messages]

@api_router.post("/chat/rooms/{room_id}/messages", response_model=Message)
async def send_message(room_id: str, msg: MessageCreate, current_user: User = Depends(require_auth)):
    """Send a message in a chat room"""
    # Verify user has access
    room = await db.chat_rooms.find_one(
        {"room_id": room_id, "wisher_id": current_user.user_id},
        {"_id": 0}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    message = Message(
        message_id=f"msg_{uuid.uuid4().hex[:12]}",
        room_id=room_id,
        sender_id=current_user.user_id,
        sender_type="wisher",
        content=msg.content
    )
    await db.messages.insert_one(message.dict())
    return message

@api_router.put("/chat/rooms/{room_id}/approve")
async def approve_deal(room_id: str, current_user: User = Depends(require_auth)):
    """Approve a deal with fulfillment agent"""
    room = await db.chat_rooms.find_one(
        {"room_id": room_id, "wisher_id": current_user.user_id},
        {"_id": 0}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Update room status
    await db.chat_rooms.update_one(
        {"room_id": room_id},
        {"$set": {"status": "approved"}}
    )
    
    # Update wish status
    await db.wishes.update_one(
        {"wish_id": room["wish_id"]},
        {"$set": {"status": "in_progress", "accepted_by": room["agent_id"]}}
    )
    
    return {"message": "Deal approved!"}

# ===================== EXPLORE ENDPOINTS =====================

@api_router.get("/explore", response_model=List[ExplorePost])
async def get_explore_posts():
    """Get explore posts (public)"""
    posts = await db.explore_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [ExplorePost(**p) for p in posts]

# ===================== LOCAL HUB ENDPOINTS =====================

@api_router.get("/localhub", response_model=List[LocalBusiness])
async def get_local_businesses(category: Optional[str] = None):
    """Get local businesses"""
    query = {}
    if category:
        query["category"] = category
    
    businesses = await db.local_businesses.find(query, {"_id": 0}).to_list(100)
    return [LocalBusiness(**b) for b in businesses]

@api_router.get("/localhub/categories")
async def get_business_categories():
    """Get all business categories"""
    categories = await db.local_businesses.distinct("category")
    return categories

# ===================== HUB VENDOR SHOP ENDPOINTS =====================

@api_router.get("/localhub/vendors")
async def get_hub_vendors(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 5.0,
    category: Optional[str] = None
):
    """Get hub vendors with radius filtering (max 10km)"""
    radius_km = min(radius_km, 10.0)  # Max 10km
    
    query = {}
    if category:
        query["category"] = category
    
    vendors = await db.hub_vendors.find(query, {"_id": 0}).to_list(100)
    
    # If location provided, filter by distance
    if lat and lng:
        from math import radians, sin, cos, sqrt, atan2
        
        def haversine(lat1, lng1, lat2, lng2):
            R = 6371  # Earth's radius in km
            dlat = radians(lat2 - lat1)
            dlng = radians(lng2 - lng1)
            a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            return R * c
        
        filtered = []
        for vendor in vendors:
            if "location" in vendor:
                distance = haversine(lat, lng, vendor["location"]["lat"], vendor["location"]["lng"])
                if distance <= radius_km:
                    vendor["distance_km"] = round(distance, 2)
                    filtered.append(vendor)
        
        # Sort by distance
        vendors = sorted(filtered, key=lambda x: x.get("distance_km", 999))
    
    return vendors

@api_router.get("/localhub/vendors/{vendor_id}")
async def get_vendor_details(vendor_id: str):
    """Get detailed vendor information"""
    vendor = await db.hub_vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor

@api_router.get("/localhub/vendors/{vendor_id}/products")
async def get_vendor_products(vendor_id: str, category: Optional[str] = None):
    """Get all products for a vendor"""
    query = {"vendor_id": vendor_id, "is_available": True}
    if category:
        query["category"] = category
    
    products = await db.products.find(query, {"_id": 0}).to_list(100)
    return products

@api_router.get("/localhub/products/{product_id}")
async def get_product_details(product_id: str):
    """Get detailed product information"""
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.post("/localhub/products/{product_id}/like")
async def like_product(product_id: str, current_user: User = Depends(require_auth)):
    """Like a product"""
    result = await db.products.update_one(
        {"product_id": product_id},
        {"$inc": {"likes": 1}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product liked"}

# ===================== CART ENDPOINTS =====================

@api_router.get("/cart")
async def get_cart(current_user: User = Depends(require_auth)):
    """Get user's cart"""
    cart = await db.carts.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not cart:
        return {"user_id": current_user.user_id, "items": [], "vendor_id": None}
    
    # Enrich with product details
    enriched_items = []
    for item in cart.get("items", []):
        product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if product:
            enriched_items.append({
                **item,
                "product": product
            })
    
    cart["items"] = enriched_items
    return cart

@api_router.post("/cart/add")
async def add_to_cart(item: CartItem, current_user: User = Depends(require_auth)):
    """Add item to cart"""
    # Get product info
    product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Get or create cart
    cart = await db.carts.find_one({"user_id": current_user.user_id})
    
    if not cart:
        # Create new cart
        cart = {
            "user_id": current_user.user_id,
            "vendor_id": product["vendor_id"],
            "items": [{"product_id": item.product_id, "quantity": item.quantity}]
        }
        await db.carts.insert_one(cart)
    else:
        # Check if same vendor
        if cart.get("vendor_id") and cart["vendor_id"] != product["vendor_id"]:
            raise HTTPException(
                status_code=400, 
                detail="Cannot add items from different vendors. Please clear cart first."
            )
        
        # Check if product already in cart
        existing_item = next((i for i in cart.get("items", []) if i["product_id"] == item.product_id), None)
        
        if existing_item:
            # Update quantity
            await db.carts.update_one(
                {"user_id": current_user.user_id, "items.product_id": item.product_id},
                {"$inc": {"items.$.quantity": item.quantity}}
            )
        else:
            # Add new item
            await db.carts.update_one(
                {"user_id": current_user.user_id},
                {
                    "$push": {"items": {"product_id": item.product_id, "quantity": item.quantity}},
                    "$set": {"vendor_id": product["vendor_id"]}
                }
            )
    
    return {"message": "Item added to cart"}

@api_router.put("/cart/update")
async def update_cart_item(item: CartUpdate, current_user: User = Depends(require_auth)):
    """Update cart item quantity"""
    if item.quantity <= 0:
        # Remove item
        await db.carts.update_one(
            {"user_id": current_user.user_id},
            {"$pull": {"items": {"product_id": item.product_id}}}
        )
    else:
        await db.carts.update_one(
            {"user_id": current_user.user_id, "items.product_id": item.product_id},
            {"$set": {"items.$.quantity": item.quantity}}
        )
    return {"message": "Cart updated"}

@api_router.delete("/cart/clear")
async def clear_cart(current_user: User = Depends(require_auth)):
    """Clear entire cart"""
    await db.carts.delete_one({"user_id": current_user.user_id})
    return {"message": "Cart cleared"}

# ===================== SHOP ORDER ENDPOINTS =====================

class OrderCreate(BaseModel):
    delivery_address: dict
    delivery_type: str  # "shop_delivery" or "agent_delivery"
    notes: Optional[str] = None

@api_router.post("/orders")
async def create_order(order_data: OrderCreate, current_user: User = Depends(require_auth)):
    """Create an order from cart"""
    # Get cart
    cart = await db.carts.find_one({"user_id": current_user.user_id})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")
    
    # Get vendor
    vendor = await db.hub_vendors.find_one({"vendor_id": cart["vendor_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # Build order items with product details
    items = []
    total_amount = 0
    
    for cart_item in cart["items"]:
        product = await db.products.find_one({"product_id": cart_item["product_id"]}, {"_id": 0})
        if product:
            price = product.get("discounted_price") or product["price"]
            item_total = price * cart_item["quantity"]
            items.append({
                "product_id": product["product_id"],
                "name": product["name"],
                "price": price,
                "quantity": cart_item["quantity"],
                "total": item_total
            })
            total_amount += item_total
    
    # Calculate delivery fee
    delivery_fee = 0
    if order_data.delivery_type == "agent_delivery":
        delivery_fee = 30  # Base delivery fee
    elif order_data.delivery_type == "shop_delivery" and not vendor.get("has_own_delivery"):
        raise HTTPException(status_code=400, detail="This vendor doesn't offer delivery")
    
    # Create order
    order = {
        "order_id": f"order_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "vendor_id": cart["vendor_id"],
        "vendor_name": vendor["name"],
        "items": items,
        "total_amount": total_amount,
        "delivery_fee": delivery_fee,
        "grand_total": total_amount + delivery_fee,
        "delivery_address": order_data.delivery_address,
        "delivery_type": order_data.delivery_type,
        "assigned_agent_id": None,
        "status": "pending",
        "payment_status": "pending",
        "notes": order_data.notes,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.shop_orders.insert_one(order)
    
    # If agent delivery, create a delivery wish
    if order_data.delivery_type == "agent_delivery":
        delivery_wish = {
            "wish_id": f"wish_{uuid.uuid4().hex[:12]}",
            "user_id": current_user.user_id,
            "wish_type": "delivery",
            "title": f"Delivery from {vendor['name']}",
            "description": f"Pick up order #{order['order_id'][-8:]} from {vendor['name']} and deliver to customer",
            "location": vendor.get("location", {}),
            "destination": order_data.delivery_address,
            "radius_km": 5.0,
            "remuneration": delivery_fee,
            "is_immediate": True,
            "scheduled_time": None,
            "status": "pending",
            "linked_order_id": order["order_id"],
            "accepted_by": None,
            "created_at": datetime.now(timezone.utc)
        }
        await db.wishes.insert_one(delivery_wish)
    
    # Clear cart
    await db.carts.delete_one({"user_id": current_user.user_id})
    
    return {
        "message": "Order placed successfully",
        "order_id": order["order_id"],
        "grand_total": order["grand_total"]
    }

@api_router.get("/orders")
async def get_orders(current_user: User = Depends(require_auth)):
    """Get user's orders"""
    orders = await db.shop_orders.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return orders

@api_router.get("/orders/{order_id}")
async def get_order_details(order_id: str, current_user: User = Depends(require_auth)):
    """Get order details"""
    order = await db.shop_orders.find_one(
        {"order_id": order_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

# ===================== SEED DATA =====================

@api_router.post("/seed")
async def seed_data():
    """Seed sample data for testing"""
    # Seed explore posts
    explore_posts = [
        {
            "post_id": f"post_{uuid.uuid4().hex[:8]}",
            "title": "Local Hero: Ramesh completes 1000th delivery! 🎉",
            "content": "Ramesh Kumar, a fulfillment agent from Sector 5, has completed his 1000th delivery task. Community members praised his dedication and reliability.",
            "post_type": "milestone",
            "image": None,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "post_id": f"post_{uuid.uuid4().hex[:8]}",
            "title": "Weekend Community Market",
            "content": "Join us this Saturday at Central Park for our monthly community market. Fresh produce, handicrafts, and local delicacies!",
            "post_type": "event",
            "image": None,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "post_id": f"post_{uuid.uuid4().hex[:8]}",
            "title": "New Feature: Schedule Your Wishes!",
            "content": "You can now schedule your wishes for a later time. Perfect for planning ahead!",
            "post_type": "news",
            "image": None,
            "created_at": datetime.now(timezone.utc)
        }
    ]
    
    for post in explore_posts:
        await db.explore_posts.update_one(
            {"post_id": post["post_id"]},
            {"$set": post},
            upsert=True
        )
    
    # Seed local businesses
    businesses = [
        {
            "business_id": f"biz_{uuid.uuid4().hex[:8]}",
            "name": "Fresh Fruits by Lakshmi",
            "category": "Fruits & Vegetables",
            "description": "Fresh seasonal fruits delivered to your doorstep",
            "image": None,
            "location": {"lat": 12.9716, "lng": 77.5946, "address": "Sector 3, Local Market"},
            "rating": 4.8,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "business_id": f"biz_{uuid.uuid4().hex[:8]}",
            "name": "Amma's Kitchen",
            "category": "Home Kitchen",
            "description": "Authentic home-cooked meals with love",
            "image": None,
            "location": {"lat": 12.9720, "lng": 77.5950, "address": "Block B, Apartment 204"},
            "rating": 4.9,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "business_id": f"biz_{uuid.uuid4().hex[:8]}",
            "name": "Ravi's Handicrafts",
            "category": "Artisan",
            "description": "Handmade traditional crafts and decorations",
            "image": None,
            "location": {"lat": 12.9710, "lng": 77.5940, "address": "Craft Lane, Shop 12"},
            "rating": 4.7,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "business_id": f"biz_{uuid.uuid4().hex[:8]}",
            "name": "Quick Pharmacy",
            "category": "Pharmacy",
            "description": "24/7 medicine delivery in your area",
            "image": None,
            "location": {"lat": 12.9725, "lng": 77.5955, "address": "Main Road, Near Bus Stop"},
            "rating": 4.6,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "business_id": f"biz_{uuid.uuid4().hex[:8]}",
            "name": "Green Grocery",
            "category": "Grocery",
            "description": "Daily essentials and grocery items",
            "image": None,
            "location": {"lat": 12.9718, "lng": 77.5948, "address": "Sector 2, Shop 5"},
            "rating": 4.5,
            "created_at": datetime.now(timezone.utc)
        }
    ]
    
    for biz in businesses:
        await db.local_businesses.update_one(
            {"business_id": biz["business_id"]},
            {"$set": biz},
            upsert=True
        )
    
    return {"message": "Sample data seeded successfully"}

@api_router.post("/seed/chats")
async def seed_chat_data(current_user: User = Depends(require_auth)):
    """Seed sample chat data for testing the chat UI"""
    user_id = current_user.user_id
    
    # Create sample wishes first
    sample_wishes = [
        {
            "wish_id": f"wish_demo_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "wish_type": "delivery",
            "title": "Need groceries from local market",
            "description": "Need rice, dal, and vegetables from the nearby market",
            "location": {"lat": 12.9716, "lng": 77.5946, "address": "Sector 5, Block A"},
            "radius_km": 5.0,
            "remuneration": 150,
            "is_immediate": True,
            "scheduled_time": None,
            "status": "accepted",
            "accepted_by": "agent_rahul",
            "created_at": datetime.now(timezone.utc) - timedelta(hours=2)
        },
        {
            "wish_id": f"wish_demo_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "wish_type": "ride_request",
            "title": "Need a ride to airport",
            "description": "Flight at 6 PM, need to leave by 3 PM",
            "location": {"lat": 12.9720, "lng": 77.5950, "address": "My Home, Tower B"},
            "radius_km": 10.0,
            "remuneration": 800,
            "is_immediate": False,
            "scheduled_time": datetime.now(timezone.utc) + timedelta(hours=5),
            "status": "pending",
            "accepted_by": None,
            "created_at": datetime.now(timezone.utc) - timedelta(hours=1)
        },
        {
            "wish_id": f"wish_demo_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "wish_type": "medicine_delivery",
            "title": "Urgent medicine from Apollo Pharmacy",
            "description": "Need Crocin and Vitamin C tablets",
            "location": {"lat": 12.9718, "lng": 77.5948, "address": "Green Park, Flat 302"},
            "radius_km": 3.0,
            "remuneration": 100,
            "is_immediate": True,
            "scheduled_time": None,
            "status": "in_progress",
            "accepted_by": "agent_priya",
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=30)
        },
        {
            "wish_id": f"wish_demo_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "wish_type": "home_maintenance",
            "title": "Plumber needed for tap repair",
            "description": "Kitchen tap is leaking, need immediate repair",
            "location": {"lat": 12.9715, "lng": 77.5945, "address": "Sunrise Apartments, Unit 5"},
            "radius_km": 5.0,
            "remuneration": 300,
            "is_immediate": True,
            "scheduled_time": None,
            "status": "completed",
            "accepted_by": "agent_vikram",
            "created_at": datetime.now(timezone.utc) - timedelta(days=1)
        }
    ]
    
    # Insert wishes
    for wish in sample_wishes:
        await db.wishes.update_one(
            {"wish_id": wish["wish_id"]},
            {"$set": wish},
            upsert=True
        )
    
    # Create sample agents (mock data)
    agents = [
        {"agent_id": "agent_rahul", "name": "Rahul Sharma", "rating": 4.8, "completed": 47},
        {"agent_id": "agent_priya", "name": "Priya Menon", "rating": 4.9, "completed": 89},
        {"agent_id": "agent_vikram", "name": "Vikram Patel", "rating": 4.7, "completed": 156},
        {"agent_id": "agent_sneha", "name": "Sneha Reddy", "rating": 4.6, "completed": 32}
    ]
    
    # Create chat rooms with messages
    chat_data = [
        {
            "room": {
                "room_id": f"room_demo_{uuid.uuid4().hex[:8]}",
                "wish_id": sample_wishes[0]["wish_id"],
                "wisher_id": user_id,
                "agent_id": "agent_rahul",
                "status": "active",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=2)
            },
            "messages": [
                {"sender": "agent", "content": "Hi! I can help with your grocery shopping. I'm near the market now.", "time_offset": -110},
                {"sender": "wisher", "content": "Great! I need rice (5kg), dal (1kg), and some vegetables", "time_offset": -105},
                {"sender": "agent", "content": "Sure! Any specific brand preference for rice and dal?", "time_offset": -100},
                {"sender": "wisher", "content": "India Gate basmati rice and Tata dal please", "time_offset": -95},
                {"sender": "agent", "content": "Got it! I'll get fresh vegetables too. Budget around ₹500-600?", "time_offset": -90},
                {"sender": "wisher", "content": "Yes that works. Please get tomatoes, onions, and potatoes", "time_offset": -85},
                {"sender": "agent", "content": "Perfect! I'll be at the market in 10 minutes. Will send photos of the produce before buying.", "time_offset": -80},
            ]
        },
        {
            "room": {
                "room_id": f"room_demo_{uuid.uuid4().hex[:8]}",
                "wish_id": sample_wishes[1]["wish_id"],
                "wisher_id": user_id,
                "agent_id": "agent_sneha",
                "status": "active",
                "created_at": datetime.now(timezone.utc) - timedelta(hours=1)
            },
            "messages": [
                {"sender": "agent", "content": "Hello! I saw your airport ride request. I have a comfortable sedan.", "time_offset": -55},
                {"sender": "wisher", "content": "Hi! What car do you have?", "time_offset": -50},
                {"sender": "agent", "content": "It's a Honda City. AC, clean and well maintained. 4.9 rating for rides!", "time_offset": -45},
                {"sender": "wisher", "content": "Sounds good. Can you confirm pickup at 3 PM?", "time_offset": -40},
                {"sender": "agent", "content": "Yes confirmed! I'll be there 10 minutes early. Can you share your exact location?", "time_offset": -35},
                {"sender": "wisher", "content": "Tower B, Gate 2. I'll wait near the security booth.", "time_offset": -30},
                {"sender": "agent", "content": "Perfect! See you tomorrow at 2:50 PM. Have a safe flight! ✈️", "time_offset": -25},
            ]
        },
        {
            "room": {
                "room_id": f"room_demo_{uuid.uuid4().hex[:8]}",
                "wish_id": sample_wishes[2]["wish_id"],
                "wisher_id": user_id,
                "agent_id": "agent_priya",
                "status": "approved",
                "created_at": datetime.now(timezone.utc) - timedelta(minutes=30)
            },
            "messages": [
                {"sender": "agent", "content": "Hi! I'm near Apollo Pharmacy. Which medicines do you need?", "time_offset": -28},
                {"sender": "wisher", "content": "Crocin tablets and Vitamin C. The 500mg ones.", "time_offset": -26},
                {"sender": "agent", "content": "Got it! Do you have a prescription or are these OTC?", "time_offset": -24},
                {"sender": "wisher", "content": "OTC. No prescription needed for these.", "time_offset": -22},
                {"sender": "agent", "content": "Perfect! I'm picking them up now. Total is ₹185. Will be there in 15 mins.", "time_offset": -20},
                {"sender": "wisher", "content": "Thank you so much! 🙏", "time_offset": -18},
                {"sender": "agent", "content": "On my way now! ETA 10 minutes. 🏃‍♀️", "time_offset": -15},
            ]
        },
        {
            "room": {
                "room_id": f"room_demo_{uuid.uuid4().hex[:8]}",
                "wish_id": sample_wishes[3]["wish_id"],
                "wisher_id": user_id,
                "agent_id": "agent_vikram",
                "status": "completed",
                "created_at": datetime.now(timezone.utc) - timedelta(days=1)
            },
            "messages": [
                {"sender": "agent", "content": "Hello! I'm a certified plumber. I can fix your tap today.", "time_offset": -1440},
                {"sender": "wisher", "content": "Great! When can you come?", "time_offset": -1435},
                {"sender": "agent", "content": "I can be there in 30 minutes. Is that okay?", "time_offset": -1430},
                {"sender": "wisher", "content": "Yes please! The leak is getting worse.", "time_offset": -1425},
                {"sender": "agent", "content": "On my way! I'll bring all necessary tools.", "time_offset": -1420},
                {"sender": "agent", "content": "Reached! I'm at your gate.", "time_offset": -1390},
                {"sender": "wisher", "content": "Coming down to let you in!", "time_offset": -1388},
                {"sender": "agent", "content": "Tap fixed! It was a worn out washer. All good now! 👍", "time_offset": -1350},
                {"sender": "wisher", "content": "Thank you so much! Great work! ⭐⭐⭐⭐⭐", "time_offset": -1345},
            ]
        }
    ]
    
    # Insert chat rooms and messages
    for chat in chat_data:
        room = chat["room"]
        await db.chat_rooms.update_one(
            {"room_id": room["room_id"]},
            {"$set": room},
            upsert=True
        )
        
        for idx, msg in enumerate(chat["messages"]):
            message = {
                "message_id": f"msg_demo_{uuid.uuid4().hex[:8]}",
                "room_id": room["room_id"],
                "sender_id": room["agent_id"] if msg["sender"] == "agent" else user_id,
                "sender_type": msg["sender"] if msg["sender"] == "agent" else "wisher",
                "content": msg["content"],
                "created_at": datetime.now(timezone.utc) + timedelta(minutes=msg["time_offset"])
            }
            await db.messages.insert_one(message)
    
    return {
        "message": "Chat data seeded successfully!",
        "wishes_created": len(sample_wishes),
        "chat_rooms_created": len(chat_data),
        "total_messages": sum(len(c["messages"]) for c in chat_data)
    }

# ===================== HEALTH CHECK =====================

@api_router.get("/")
async def root():
    return {"message": "QuickWish API is running", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
