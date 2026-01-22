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

# ===================== CART ENDPOINTS (Multi-Shop Support) =====================

@api_router.get("/cart")
async def get_cart(vendor_id: Optional[str] = None, current_user: User = Depends(require_auth)):
    """Get user's cart for a specific vendor or all carts"""
    if vendor_id:
        # Get cart for specific vendor
        cart = await db.carts.find_one(
            {"user_id": current_user.user_id, "vendor_id": vendor_id}, 
            {"_id": 0}
        )
        if not cart:
            return {"user_id": current_user.user_id, "items": [], "vendor_id": vendor_id}
        
        # Enrich with product details
        enriched_items = []
        for item in cart.get("items", []):
            product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
            if product:
                enriched_items.append({**item, "product": product})
        
        cart["items"] = enriched_items
        return cart
    else:
        # Get all carts for user
        carts = await db.carts.find({"user_id": current_user.user_id}, {"_id": 0}).to_list(100)
        enriched_carts = []
        for cart in carts:
            vendor = await db.hub_vendors.find_one({"vendor_id": cart.get("vendor_id")}, {"_id": 0})
            enriched_items = []
            for item in cart.get("items", []):
                product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
                if product:
                    enriched_items.append({**item, "product": product})
            cart["items"] = enriched_items
            cart["vendor"] = vendor
            enriched_carts.append(cart)
        return enriched_carts

@api_router.get("/cart/summary")
async def get_cart_summary(current_user: User = Depends(require_auth)):
    """Get summary of all carts (vendor_id and item count)"""
    carts = await db.carts.find({"user_id": current_user.user_id}, {"_id": 0}).to_list(100)
    summary = {}
    for cart in carts:
        vendor_id = cart.get("vendor_id")
        if vendor_id:
            total_items = sum(item.get("quantity", 0) for item in cart.get("items", []))
            summary[vendor_id] = total_items
    return summary

@api_router.post("/cart/add")
async def add_to_cart(item: CartItem, current_user: User = Depends(require_auth)):
    """Add item to cart (supports multi-shop carts)"""
    # Get product info
    product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    vendor_id = product["vendor_id"]
    
    # Get or create cart for this vendor
    cart = await db.carts.find_one({"user_id": current_user.user_id, "vendor_id": vendor_id})
    
    if not cart:
        # Create new cart for this vendor
        cart = {
            "user_id": current_user.user_id,
            "vendor_id": vendor_id,
            "items": [{"product_id": item.product_id, "quantity": item.quantity}]
        }
        await db.carts.insert_one(cart)
    else:
        # Check if product already in cart
        existing_item = next((i for i in cart.get("items", []) if i["product_id"] == item.product_id), None)
        
        if existing_item:
            # Update quantity
            await db.carts.update_one(
                {"user_id": current_user.user_id, "vendor_id": vendor_id, "items.product_id": item.product_id},
                {"$inc": {"items.$.quantity": item.quantity}}
            )
        else:
            # Add new item
            await db.carts.update_one(
                {"user_id": current_user.user_id, "vendor_id": vendor_id},
                {"$push": {"items": {"product_id": item.product_id, "quantity": item.quantity}}}
            )
    
    # Get updated cart count
    updated_cart = await db.carts.find_one({"user_id": current_user.user_id, "vendor_id": vendor_id})
    total_items = sum(i.get("quantity", 0) for i in updated_cart.get("items", []))
    
    return {"message": "Item added to cart", "cart_count": total_items, "vendor_id": vendor_id}

@api_router.put("/cart/update")
async def update_cart_item(item: CartUpdate, current_user: User = Depends(require_auth)):
    """Update cart item quantity"""
    # Get product to find vendor
    product = await db.products.find_one({"product_id": item.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    vendor_id = product["vendor_id"]
    
    if item.quantity <= 0:
        # Remove item
        await db.carts.update_one(
            {"user_id": current_user.user_id, "vendor_id": vendor_id},
            {"$pull": {"items": {"product_id": item.product_id}}}
        )
        # Check if cart is empty and delete if so
        cart = await db.carts.find_one({"user_id": current_user.user_id, "vendor_id": vendor_id})
        if cart and len(cart.get("items", [])) == 0:
            await db.carts.delete_one({"user_id": current_user.user_id, "vendor_id": vendor_id})
    else:
        await db.carts.update_one(
            {"user_id": current_user.user_id, "vendor_id": vendor_id, "items.product_id": item.product_id},
            {"$set": {"items.$.quantity": item.quantity}}
        )
    return {"message": "Cart updated"}

@api_router.delete("/cart/clear")
async def clear_cart(vendor_id: Optional[str] = None, current_user: User = Depends(require_auth)):
    """Clear cart for a specific vendor or all carts"""
    if vendor_id:
        await db.carts.delete_one({"user_id": current_user.user_id, "vendor_id": vendor_id})
    else:
        await db.carts.delete_many({"user_id": current_user.user_id})
    return {"message": "Cart cleared"}

# ===================== SHOP ORDER ENDPOINTS =====================

class OrderCreate(BaseModel):
    vendor_id: str
    delivery_address: dict
    delivery_type: str  # "shop_delivery" or "agent_delivery"
    notes: Optional[str] = None

@api_router.post("/orders")
async def create_order(order_data: OrderCreate, current_user: User = Depends(require_auth)):
    """Create an order from cart for a specific vendor"""
    # Get cart for specific vendor
    cart = await db.carts.find_one({"user_id": current_user.user_id, "vendor_id": order_data.vendor_id})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty for this vendor")
    
    # Get vendor
    vendor = await db.hub_vendors.find_one({"vendor_id": order_data.vendor_id}, {"_id": 0})
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
                "original_price": product["price"],
                "quantity": cart_item["quantity"],
                "total": item_total,
                "image": product["images"][0] if product.get("images") else None
            })
            total_amount += item_total
    
    # Calculate tax (5% GST)
    tax_rate = 0.05
    tax_amount = round(total_amount * tax_rate, 2)
    
    # Calculate delivery fee
    delivery_fee = 0
    if order_data.delivery_type == "agent_delivery":
        delivery_fee = 30  # Base delivery fee
    elif order_data.delivery_type == "shop_delivery" and not vendor.get("has_own_delivery"):
        raise HTTPException(status_code=400, detail="This vendor doesn't offer delivery")
    
    grand_total = total_amount + tax_amount + delivery_fee
    
    # Create order with tracking
    order = {
        "order_id": f"order_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "vendor_id": order_data.vendor_id,
        "vendor_name": vendor["name"],
        "vendor_image": vendor.get("image"),
        "vendor_phone": vendor.get("contact_phone"),
        "vendor_address": vendor.get("location", {}).get("address"),
        "items": items,
        "subtotal": total_amount,
        "tax_rate": tax_rate,
        "tax_amount": tax_amount,
        "delivery_fee": delivery_fee,
        "grand_total": grand_total,
        "delivery_address": order_data.delivery_address,
        "delivery_type": order_data.delivery_type,
        "assigned_agent_id": None,
        "agent_name": None,
        "agent_phone": None,
        "agent_location": None,  # For live tracking
        "status": "confirmed",  # confirmed, preparing, ready, picked_up, on_the_way, nearby, delivered, cancelled
        "status_history": [
            {"status": "confirmed", "timestamp": datetime.now(timezone.utc).isoformat(), "message": "Order confirmed"}
        ],
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat(),
        "payment_status": "paid",  # Assuming payment is done
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
    
    # Clear cart for this vendor only
    await db.carts.delete_one({"user_id": current_user.user_id, "vendor_id": order_data.vendor_id})
    
    # Return full order details for invoice
    return {
        "message": "Order placed successfully",
        "order": order
    }

@api_router.get("/orders")
async def get_orders(current_user: User = Depends(require_auth)):
    """Get user's orders with vendor details"""
    orders = await db.shop_orders.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return orders

@api_router.get("/orders/{order_id}")
async def get_order_details(order_id: str, current_user: User = Depends(require_auth)):
    """Get detailed order information including tracking"""
    order = await db.shop_orders.find_one(
        {"order_id": order_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get linked delivery wish if exists
    delivery_wish = await db.wishes.find_one(
        {"linked_order_id": order_id},
        {"_id": 0}
    )
    if delivery_wish:
        order["delivery_wish"] = delivery_wish
    
    return order

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, agent_location: Optional[dict] = None):
    """Update order status (for vendors/agents)"""
    valid_statuses = ["confirmed", "preparing", "ready", "picked_up", "on_the_way", "nearby", "delivered", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {
        "status": status,
        "$push": {
            "status_history": {
                "status": status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": f"Order {status.replace('_', ' ')}"
            }
        }
    }
    
    if agent_location:
        update_data["agent_location"] = agent_location
    
    await db.shop_orders.update_one(
        {"order_id": order_id},
        {"$set": {"status": status, "agent_location": agent_location} if agent_location else {"$set": {"status": status}}}
    )
    
    # Also push to status history
    await db.shop_orders.update_one(
        {"order_id": order_id},
        {"$push": {"status_history": {"status": status, "timestamp": datetime.now(timezone.utc).isoformat()}}}
    )
    
    return {"message": f"Order status updated to {status}"}

@api_router.put("/orders/{order_id}/agent-location")
async def update_agent_location(order_id: str, location: dict):
    """Update delivery agent's live location"""
    await db.shop_orders.update_one(
        {"order_id": order_id},
        {"$set": {"agent_location": location}}
    )
    return {"message": "Location updated"}

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

@api_router.post("/seed/hubvendors")
async def seed_hub_vendors():
    """Seed 7 sample hub vendors with products for testing"""
    
    # Define 7 different shops
    hub_vendors = [
        {
            "vendor_id": "vendor_fresh_mart",
            "name": "Fresh Mart Grocery",
            "description": "Your one-stop shop for fresh groceries, dairy, and household essentials. Quality products at affordable prices.",
            "category": "Grocery",
            "image": "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
            "rating": 4.8,
            "total_ratings": 1247,
            "location": {"lat": 12.9716, "lng": 77.5946, "address": "Shop 12, Central Market, Sector 5"},
            "contact_phone": "+91 98765 43210",
            "opening_hours": "7:00 AM - 10:00 PM",
            "has_own_delivery": True,
            "delivery_radius_km": 5.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_biryani_house",
            "name": "Hyderabadi Biryani House",
            "description": "Authentic Hyderabadi dum biryani made with aromatic basmati rice and tender meat. Family recipes since 1985.",
            "category": "Restaurant",
            "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400",
            "rating": 4.9,
            "total_ratings": 2341,
            "location": {"lat": 12.9720, "lng": 77.5950, "address": "15, Food Street, Block B"},
            "contact_phone": "+91 98765 43211",
            "opening_hours": "11:00 AM - 11:00 PM",
            "has_own_delivery": True,
            "delivery_radius_km": 8.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_medplus",
            "name": "MedPlus Pharmacy",
            "description": "Certified pharmacy with 24/7 service. Prescription medicines, healthcare products, and free health checkups.",
            "category": "Pharmacy",
            "image": "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400",
            "rating": 4.7,
            "total_ratings": 892,
            "location": {"lat": 12.9718, "lng": 77.5948, "address": "Ground Floor, Healthcare Complex"},
            "contact_phone": "+91 98765 43212",
            "opening_hours": "24 Hours",
            "has_own_delivery": False,
            "delivery_radius_km": 3.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_tech_zone",
            "name": "Tech Zone Electronics",
            "description": "Latest gadgets, mobile accessories, and electronics. Authorized service center for major brands.",
            "category": "Electronics",
            "image": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400",
            "rating": 4.5,
            "total_ratings": 567,
            "location": {"lat": 12.9725, "lng": 77.5955, "address": "Shop 45, Tech Mall, Level 2"},
            "contact_phone": "+91 98765 43213",
            "opening_hours": "10:00 AM - 9:00 PM",
            "has_own_delivery": False,
            "delivery_radius_km": 10.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_fashion_hub",
            "name": "Fashion Hub",
            "description": "Trendy clothing and accessories for men, women, and kids. Latest fashion at unbeatable prices.",
            "category": "Fashion",
            "image": "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400",
            "rating": 4.4,
            "total_ratings": 423,
            "location": {"lat": 12.9712, "lng": 77.5942, "address": "Fashion Street, Shop 8-10"},
            "contact_phone": "+91 98765 43214",
            "opening_hours": "10:00 AM - 9:00 PM",
            "has_own_delivery": False,
            "delivery_radius_km": 5.0,
            "is_verified": False,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_green_garden",
            "name": "Green Garden Nursery",
            "description": "Beautiful plants, seeds, gardening tools, and expert advice. Transform your space with greenery!",
            "category": "Garden & Plants",
            "image": "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
            "rating": 4.8,
            "total_ratings": 234,
            "location": {"lat": 12.9730, "lng": 77.5960, "address": "Green Zone, Sector 7"},
            "contact_phone": "+91 98765 43215",
            "opening_hours": "8:00 AM - 7:00 PM",
            "has_own_delivery": True,
            "delivery_radius_km": 7.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        },
        {
            "vendor_id": "vendor_sweet_treats",
            "name": "Sweet Treats Bakery",
            "description": "Freshly baked cakes, pastries, cookies, and artisan breads. Custom cakes for all occasions!",
            "category": "Bakery",
            "image": "https://images.unsplash.com/photo-1517433670267-30f41c09a4be?w=400",
            "rating": 4.9,
            "total_ratings": 1876,
            "location": {"lat": 12.9708, "lng": 77.5938, "address": "Sweet Corner, Main Road"},
            "contact_phone": "+91 98765 43216",
            "opening_hours": "8:00 AM - 10:00 PM",
            "has_own_delivery": True,
            "delivery_radius_km": 6.0,
            "is_verified": True,
            "created_at": datetime.now(timezone.utc)
        }
    ]
    
    # Define products for each vendor
    products = [
        # Fresh Mart Grocery Products
        {"product_id": "prod_fm_001", "vendor_id": "vendor_fresh_mart", "name": "Basmati Rice Premium (5kg)", "description": "Long grain aromatic basmati rice, perfect for biryani and pulao", "price": 450, "discounted_price": 399, "images": ["https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400", "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400"], "category": "Rice & Grains", "stock": 50, "likes": 234, "rating": 4.7, "total_ratings": 89},
        {"product_id": "prod_fm_002", "vendor_id": "vendor_fresh_mart", "name": "Toor Dal (1kg)", "description": "Pure and clean toor dal, rich in protein", "price": 180, "discounted_price": 165, "images": ["https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400"], "category": "Pulses", "stock": 100, "likes": 156, "rating": 4.6, "total_ratings": 67},
        {"product_id": "prod_fm_003", "vendor_id": "vendor_fresh_mart", "name": "Fresh Milk (1L)", "description": "Farm fresh pasteurized milk", "price": 65, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400"], "category": "Dairy", "stock": 200, "likes": 89, "rating": 4.8, "total_ratings": 234},
        {"product_id": "prod_fm_004", "vendor_id": "vendor_fresh_mart", "name": "Organic Honey (500g)", "description": "100% pure organic honey from forest bees", "price": 450, "discounted_price": 399, "images": ["https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400"], "category": "Organic", "stock": 30, "likes": 445, "rating": 4.9, "total_ratings": 156},
        
        # Biryani House Products
        {"product_id": "prod_bh_001", "vendor_id": "vendor_biryani_house", "name": "Chicken Dum Biryani (Full)", "description": "Authentic Hyderabadi chicken biryani with raita and salan", "price": 450, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400", "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400"], "category": "Biryani", "stock": 50, "likes": 1234, "rating": 4.9, "total_ratings": 567},
        {"product_id": "prod_bh_002", "vendor_id": "vendor_biryani_house", "name": "Mutton Dum Biryani (Full)", "description": "Tender mutton pieces in aromatic rice", "price": 550, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=400"], "category": "Biryani", "stock": 30, "likes": 987, "rating": 4.9, "total_ratings": 432},
        {"product_id": "prod_bh_003", "vendor_id": "vendor_biryani_house", "name": "Veg Biryani (Full)", "description": "Flavorful vegetable biryani with fresh veggies", "price": 280, "discounted_price": 250, "images": ["https://images.unsplash.com/photo-1599043513900-ed6fe01d3833?w=400"], "category": "Biryani", "stock": 40, "likes": 567, "rating": 4.7, "total_ratings": 234},
        {"product_id": "prod_bh_004", "vendor_id": "vendor_biryani_house", "name": "Chicken 65", "description": "Crispy spiced chicken starter", "price": 250, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=400"], "category": "Starters", "stock": 60, "likes": 789, "rating": 4.8, "total_ratings": 345},
        
        # MedPlus Pharmacy Products
        {"product_id": "prod_mp_001", "vendor_id": "vendor_medplus", "name": "Crocin Advance 500mg (15 tabs)", "description": "Fast relief from headache and fever", "price": 45, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400"], "category": "Pain Relief", "stock": 200, "likes": 234, "rating": 4.5, "total_ratings": 123},
        {"product_id": "prod_mp_002", "vendor_id": "vendor_medplus", "name": "Vitamin C 1000mg (30 tabs)", "description": "Boost immunity with high-strength Vitamin C", "price": 350, "discounted_price": 299, "images": ["https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400"], "category": "Vitamins", "stock": 100, "likes": 456, "rating": 4.7, "total_ratings": 189},
        {"product_id": "prod_mp_003", "vendor_id": "vendor_medplus", "name": "Digital Thermometer", "description": "Accurate digital thermometer with memory function", "price": 299, "discounted_price": 249, "images": ["https://images.unsplash.com/photo-1584362917165-526a968ae5c6?w=400"], "category": "Medical Devices", "stock": 50, "likes": 123, "rating": 4.6, "total_ratings": 78},
        
        # Tech Zone Products
        {"product_id": "prod_tz_001", "vendor_id": "vendor_tech_zone", "name": "Wireless Earbuds Pro", "description": "Premium wireless earbuds with active noise cancellation", "price": 2999, "discounted_price": 2499, "images": ["https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400", "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400"], "category": "Audio", "stock": 25, "likes": 678, "rating": 4.6, "total_ratings": 234},
        {"product_id": "prod_tz_002", "vendor_id": "vendor_tech_zone", "name": "USB-C Fast Charger 65W", "description": "Universal fast charger for laptops and phones", "price": 1299, "discounted_price": 999, "images": ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400"], "category": "Chargers", "stock": 40, "likes": 345, "rating": 4.5, "total_ratings": 156},
        {"product_id": "prod_tz_003", "vendor_id": "vendor_tech_zone", "name": "Smartphone Gimbal Stabilizer", "description": "3-axis gimbal for smooth video recording", "price": 4999, "discounted_price": 3999, "images": ["https://images.unsplash.com/photo-1598346762291-aee88549193f?w=400"], "category": "Accessories", "stock": 15, "likes": 234, "rating": 4.7, "total_ratings": 89},
        
        # Fashion Hub Products
        {"product_id": "prod_fh_001", "vendor_id": "vendor_fashion_hub", "name": "Men's Cotton Casual Shirt", "description": "Breathable cotton shirt, perfect for everyday wear", "price": 899, "discounted_price": 699, "images": ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400", "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=400"], "category": "Men's Wear", "stock": 50, "likes": 345, "rating": 4.4, "total_ratings": 123},
        {"product_id": "prod_fh_002", "vendor_id": "vendor_fashion_hub", "name": "Women's Kurti Set", "description": "Elegant cotton kurti with matching dupatta", "price": 1299, "discounted_price": 999, "images": ["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400"], "category": "Women's Wear", "stock": 30, "likes": 567, "rating": 4.5, "total_ratings": 234},
        {"product_id": "prod_fh_003", "vendor_id": "vendor_fashion_hub", "name": "Kids Party Dress", "description": "Beautiful party dress for girls, age 5-8 years", "price": 799, "discounted_price": 599, "images": ["https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?w=400"], "category": "Kids Wear", "stock": 25, "likes": 234, "rating": 4.6, "total_ratings": 89},
        
        # Green Garden Products
        {"product_id": "prod_gg_001", "vendor_id": "vendor_green_garden", "name": "Money Plant (Potted)", "description": "Lucky money plant in decorative ceramic pot", "price": 299, "discounted_price": 249, "images": ["https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400", "https://images.unsplash.com/photo-1463936575829-25148e1db1b8?w=400"], "category": "Indoor Plants", "stock": 40, "likes": 456, "rating": 4.8, "total_ratings": 178},
        {"product_id": "prod_gg_002", "vendor_id": "vendor_green_garden", "name": "Rose Plant (Red)", "description": "Beautiful red rose plant, blooming variety", "price": 199, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400"], "category": "Flowering Plants", "stock": 30, "likes": 678, "rating": 4.7, "total_ratings": 234},
        {"product_id": "prod_gg_003", "vendor_id": "vendor_green_garden", "name": "Gardening Tool Set", "description": "Complete 5-piece gardening tool set", "price": 599, "discounted_price": 499, "images": ["https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400"], "category": "Tools", "stock": 20, "likes": 234, "rating": 4.6, "total_ratings": 89},
        
        # Sweet Treats Products
        {"product_id": "prod_st_001", "vendor_id": "vendor_sweet_treats", "name": "Chocolate Truffle Cake (1kg)", "description": "Rich chocolate truffle cake with ganache frosting", "price": 899, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400", "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=400"], "category": "Cakes", "stock": 20, "likes": 1234, "rating": 4.9, "total_ratings": 567},
        {"product_id": "prod_st_002", "vendor_id": "vendor_sweet_treats", "name": "Assorted Cookies Box (500g)", "description": "Mix of chocolate chip, butter, and oatmeal cookies", "price": 399, "discounted_price": 349, "images": ["https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400"], "category": "Cookies", "stock": 50, "likes": 567, "rating": 4.7, "total_ratings": 234},
        {"product_id": "prod_st_003", "vendor_id": "vendor_sweet_treats", "name": "Fresh Croissants (4 pcs)", "description": "Buttery French croissants, baked fresh daily", "price": 180, "discounted_price": None, "images": ["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400"], "category": "Bakery", "stock": 30, "likes": 345, "rating": 4.8, "total_ratings": 156},
        {"product_id": "prod_st_004", "vendor_id": "vendor_sweet_treats", "name": "Red Velvet Cupcakes (6 pcs)", "description": "Classic red velvet cupcakes with cream cheese frosting", "price": 350, "discounted_price": 299, "images": ["https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=400"], "category": "Cupcakes", "stock": 25, "likes": 789, "rating": 4.9, "total_ratings": 345}
    ]
    
    # Insert vendors
    for vendor in hub_vendors:
        await db.hub_vendors.update_one(
            {"vendor_id": vendor["vendor_id"]},
            {"$set": vendor},
            upsert=True
        )
    
    # Insert products
    for product in products:
        product["is_available"] = True
        product["created_at"] = datetime.now(timezone.utc)
        await db.products.update_one(
            {"product_id": product["product_id"]},
            {"$set": product},
            upsert=True
        )
    
    return {
        "message": "Hub vendors seeded successfully!",
        "vendors_created": len(hub_vendors),
        "products_created": len(products)
    }

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
