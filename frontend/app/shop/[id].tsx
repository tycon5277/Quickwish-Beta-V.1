import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Dimensions, Animated, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';
import { wisherAPI, CreateOrderData } from '../../utils/api';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://order-lifecycle-8.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HubVendor {
  vendor_id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  rating: number;
  total_ratings: number;
  location: { lat: number; lng: number; address: string };
  contact_phone: string;
  opening_hours: string;
  has_own_delivery: boolean;
  delivery_radius_km: number;
  is_verified: boolean;
}

interface Product {
  product_id: string;
  vendor_id: string;
  name: string;
  description: string;
  price: number;
  discounted_price?: number;
  images: string[];
  category: string;
  stock: number;
  likes: number;
  rating: number;
  total_ratings: number;
  is_available: boolean;
}

interface CartItem {
  product_id: string;
  quantity: number;
  product?: Product;
}

interface UserAddress {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

// Toast Component
const Toast = ({ visible, message, onHide }: { visible: boolean; message: string; onHide: () => void }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 50, duration: 200, useNativeDriver: true }),
        ]).start(() => onHide());
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
      <Ionicons name="checkmark-circle" size={20} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

// Confetti animation 
const Confetti = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <View style={styles.confettiContainer}>
      {[...Array(20)].map((_, i) => (
        <Animated.View 
          key={i} 
          style={[
            styles.confettiPiece, 
            { 
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 50}%`,
              backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'][i % 5],
              transform: [{ rotate: `${Math.random() * 360}deg` }]
            }
          ]} 
        />
      ))}
    </View>
  );
};

export default function ShopScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const vendorId = typeof params.id === 'string' ? params.id : params.id?.[0] || '';
  const { sessionToken, user } = useAuth();
  
  const [vendor, setVendor] = useState<HubVendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartMap, setCartMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<'shop_delivery' | 'agent_delivery'>('agent_delivery');
  const [userAddresses, setUserAddresses] = useState<UserAddress[]>([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [placedOrder, setPlacedOrder] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [newAddressText, setNewAddressText] = useState('');

  const fetchVendor = useCallback(async () => {
    if (!vendorId) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/localhub/vendors/${vendorId}`);
      setVendor(response.data);
    } catch (error) {
      console.error('Error fetching vendor:', error);
    }
  }, [vendorId]);

  const fetchProducts = useCallback(async () => {
    if (!vendorId) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/localhub/vendors/${vendorId}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  const fetchCart = useCallback(async () => {
    if (!sessionToken || !vendorId) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/cart?vendor_id=${vendorId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const items = response.data.items || [];
      setCart(items);
      
      // Build cart map for quick lookup
      const map: Record<string, number> = {};
      items.forEach((item: CartItem) => {
        map[item.product_id] = item.quantity;
      });
      setCartMap(map);
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  }, [sessionToken, vendorId]);

  const fetchUserAddresses = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const addresses = response.data.addresses || [];
      setUserAddresses(addresses);
      // Auto-select first address if available
      if (addresses.length > 0 && !selectedAddressId) {
        setSelectedAddressId(addresses[0].id);
        setDeliveryAddress(addresses[0].address);
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (vendorId) {
      fetchVendor();
      fetchProducts();
      fetchCart();
      fetchUserAddresses();
    }
  }, [vendorId, fetchVendor, fetchProducts, fetchCart, fetchUserAddresses]);

  const productCategories = ['all', ...new Set(products.map(p => p.category))];
  
  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  const addToCart = async (product: Product) => {
    if (!sessionToken) {
      showToast('Please login to add items');
      return;
    }

    try {
      await axios.post(`${BACKEND_URL}/api/cart/add`, 
        { product_id: product.product_id, quantity: 1 },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      await fetchCart();
      showToast(`${product.name.substring(0, 20)}... added`);
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Failed to add');
    }
  };

  const updateCartItem = async (productId: string, quantity: number) => {
    if (!sessionToken) return;
    try {
      await axios.put(`${BACKEND_URL}/api/cart/update`,
        { product_id: productId, quantity },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      await fetchCart();
    } catch (error) {
      console.error('Error updating cart:', error);
    }
  };

  const clearCart = async () => {
    if (!sessionToken) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/cart/clear?vendor_id=${vendorId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setCart([]);
      setCartMap({});
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location permission denied');
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const [reverseGeocode] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (reverseGeocode) {
        const address = [
          reverseGeocode.name,
          reverseGeocode.street,
          reverseGeocode.district,
          reverseGeocode.city,
          reverseGeocode.region,
          reverseGeocode.postalCode
        ].filter(Boolean).join(', ');
        
        setDeliveryAddress(address);
        setSelectedAddressId(null);
        showToast('Location detected!');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      showToast('Failed to get location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const addNewAddress = async () => {
    if (!sessionToken || !newAddressText.trim()) return;
    
    try {
      const response = await axios.post(`${BACKEND_URL}/api/users/addresses`,
        { label: newAddressLabel || 'Home', address: newAddressText },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      
      await fetchUserAddresses();
      setShowAddAddressModal(false);
      setNewAddressLabel('');
      setNewAddressText('');
      
      // Select the new address
      if (response.data.address) {
        setSelectedAddressId(response.data.address.id);
        setDeliveryAddress(response.data.address.address);
      }
      
      showToast('Address saved!');
    } catch (error) {
      console.error('Error adding address:', error);
      showToast('Failed to save address');
    }
  };

  const placeOrder = async () => {
    if (!sessionToken) {
      showToast('Please login to place order');
      return;
    }

    if (!deliveryAddress.trim()) {
      showToast('Please enter delivery address');
      return;
    }

    if (!vendorId) {
      showToast('Invalid vendor');
      return;
    }

    if (cart.length === 0) {
      showToast('Cart is empty');
      return;
    }

    setIsPlacingOrder(true);

    try {
      console.log('Placing order with:', { vendorId, deliveryAddress, deliveryType });
      
      // Build order items from cart
      const orderItems = cart.map(item => {
        const product = products.find(p => p.product_id === item.product_id);
        return {
          product_id: item.product_id,
          name: product?.name || 'Unknown Item',
          quantity: item.quantity,
          price: product?.discounted_price || product?.price || 0,
        };
      });

      // Calculate totals for local display
      const subtotal = getCartTotal();
      const taxAmount = Math.round(subtotal * 0.05);
      const deliveryFee = deliveryType === 'agent_delivery' ? 30 : 0;
      const grandTotal = subtotal + taxAmount + deliveryFee;

      // Prepare order data for the new external API
      const orderData: CreateOrderData = {
        vendor_id: vendorId,
        items: orderItems,
        delivery_address: { 
          address: deliveryAddress,
          lat: 0, // Optional - can be filled if GPS was used
          lng: 0,
        },
        delivery_type: deliveryType,
        special_instructions: '',
      };
      
      // Call the new external Order Lifecycle API
      const response = await wisherAPI.createOrder(orderData, sessionToken);
      
      console.log('Order response:', response);
      
      // Clear cart from the original backend as well
      await axios.delete(`${BACKEND_URL}/api/cart/clear?vendor_id=${vendorId}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      
      setShowCheckoutModal(false);
      setCart([]);
      setCartMap({});
      
      // Build placed order object for invoice display
      setPlacedOrder({
        order_id: response.order_id || response.id || 'new-order',
        vendor_name: vendor?.name || 'Shop',
        vendor_image: vendor?.image,
        vendor_address: vendor?.location?.address,
        items: orderItems.map(item => ({
          ...item,
          total: item.price * item.quantity,
        })),
        subtotal: subtotal,
        tax_rate: 0.05,
        tax_amount: taxAmount,
        delivery_fee: deliveryFee,
        grand_total: grandTotal,
        delivery_address: { address: deliveryAddress },
        delivery_type: deliveryType,
      });
      
      setShowConfetti(true);
      setShowInvoiceModal(true);
      
      // Hide confetti after animation
      setTimeout(() => setShowConfetti(false), 3000);
    } catch (error: any) {
      console.error('Error placing order:', error.response?.data || error);
      showToast(error.response?.data?.detail || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => {
      const product = products.find(p => p.product_id === item.product_id);
      if (product) {
        const price = product.discounted_price || product.price;
        return sum + (price * item.quantity);
      }
      return sum;
    }, 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const openProductDetails = (product: Product) => {
    setSelectedProduct(product);
    setCurrentImageIndex(0);
    setShowProductModal(true);
  };

  const handleAddressSelect = (addr: UserAddress) => {
    setSelectedAddressId(addr.id);
    setDeliveryAddress(addr.address);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading shop...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Toast Notification */}
      <Toast visible={toastVisible} message={toastMessage} onHide={() => setToastVisible(false)} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{vendor?.name}</Text>
          {vendor?.is_verified && (
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          )}
        </View>
        <TouchableOpacity style={styles.cartButton} onPress={() => setShowCartModal(true)}>
          <Ionicons name="cart" size={24} color="#1F2937" />
          {getCartItemCount() > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{getCartItemCount()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Vendor Banner */}
        {vendor && (
          <View style={styles.vendorBanner}>
            {vendor.image ? (
              <Image source={{ uri: vendor.image }} style={styles.bannerImage} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#10B981', '#059669']} style={styles.bannerImage}>
                <Ionicons name="storefront" size={60} color="rgba(255,255,255,0.5)" />
              </LinearGradient>
            )}
            <LinearGradient 
              colors={['transparent', 'rgba(0,0,0,0.8)']} 
              style={styles.bannerOverlay}
            >
              <View style={styles.bannerContent}>
                <Text style={styles.vendorName}>{vendor.name}</Text>
                <View style={styles.vendorMeta}>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>{vendor.rating.toFixed(1)}</Text>
                    <Text style={styles.ratingCount}>({vendor.total_ratings})</Text>
                  </View>
                  <Text style={styles.vendorCategory}>{vendor.category}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Vendor Info */}
        {vendor && (
          <View style={styles.vendorInfoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <Text style={styles.infoText}>{vendor.location.address}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={styles.infoText}>{vendor.opening_hours}</Text>
            </View>
            <View style={styles.deliveryOptions}>
              {vendor.has_own_delivery && (
                <View style={[styles.deliveryTag, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="bicycle" size={14} color="#10B981" />
                  <Text style={[styles.deliveryTagText, { color: '#10B981' }]}>Shop Delivery</Text>
                </View>
              )}
              <View style={[styles.deliveryTag, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="people" size={14} color="#3B82F6" />
                <Text style={[styles.deliveryTagText, { color: '#3B82F6' }]}>Agent Delivery</Text>
              </View>
            </View>
          </View>
        )}

        {/* Category Filter */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilter}
        >
          {productCategories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipSelected]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextSelected]}>
                {cat === 'all' ? 'All Products' : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Products Grid */}
        <View style={styles.productsSection}>
          <Text style={styles.sectionTitle}>
            {filteredProducts.length} Product{filteredProducts.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.productsGrid}>
            {filteredProducts.map((product) => {
              const inCart = cartMap[product.product_id] || 0;
              
              return (
                <TouchableOpacity 
                  key={product.product_id} 
                  style={styles.productCard}
                  onPress={() => openProductDetails(product)}
                >
                  {/* Product Image */}
                  <View style={styles.productImageContainer}>
                    {product.images.length > 0 ? (
                      <Image 
                        source={{ uri: product.images[0] }} 
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.productImagePlaceholder}>
                        <Ionicons name="cube" size={30} color="#9CA3AF" />
                      </View>
                    )}
                    {product.discounted_price && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountText}>
                          {Math.round((1 - product.discounted_price / product.price) * 100)}% OFF
                        </Text>
                      </View>
                    )}
                    {product.images.length > 1 && (
                      <View style={styles.multiImageBadge}>
                        <Ionicons name="images" size={12} color="#fff" />
                        <Text style={styles.multiImageText}>{product.images.length}</Text>
                      </View>
                    )}
                  </View>

                  {/* Product Info */}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    <View style={styles.productRating}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.productRatingText}>{product.rating.toFixed(1)}</Text>
                      <Text style={styles.productLikes}>• {product.likes} likes</Text>
                    </View>
                    <View style={styles.productPricing}>
                      <Text style={styles.productPrice}>
                        ₹{product.discounted_price || product.price}
                      </Text>
                      {product.discounted_price && (
                        <Text style={styles.productOriginalPrice}>₹{product.price}</Text>
                      )}
                    </View>
                    
                    {/* Add to Cart / Quantity Controls */}
                    {inCart > 0 ? (
                      <View style={styles.quantityControlsInline}>
                        <TouchableOpacity 
                          style={styles.qtyBtn}
                          onPress={(e) => { e.stopPropagation(); updateCartItem(product.product_id, inCart - 1); }}
                        >
                          <Ionicons name="remove" size={16} color="#10B981" />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{inCart}</Text>
                        <TouchableOpacity 
                          style={styles.qtyBtn}
                          onPress={(e) => { e.stopPropagation(); updateCartItem(product.product_id, inCart + 1); }}
                        >
                          <Ionicons name="add" size={16} color="#10B981" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity 
                        style={styles.addToCartButton}
                        onPress={(e) => { e.stopPropagation(); addToCart(product); }}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.addToCartText}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Cart Bar */}
      {getCartItemCount() > 0 && (
        <TouchableOpacity 
          style={[styles.floatingCart, { bottom: Math.max(20, insets.bottom + 10) }]} 
          onPress={() => setShowCartModal(true)}
        >
          <View style={styles.floatingCartLeft}>
            <View style={styles.floatingCartBadge}>
              <Text style={styles.floatingCartBadgeText}>{getCartItemCount()}</Text>
            </View>
            <Text style={styles.floatingCartText}>View Cart</Text>
          </View>
          <Text style={styles.floatingCartTotal}>₹{getCartTotal()}</Text>
        </TouchableOpacity>
      )}

      {/* Product Detail Modal */}
      <Modal visible={showProductModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.productModal}>
            {selectedProduct && (
              <>
                <TouchableOpacity 
                  style={styles.modalClose}
                  onPress={() => setShowProductModal(false)}
                >
                  <Ionicons name="close" size={24} color="#1F2937" />
                </TouchableOpacity>

                {/* Product Images Carousel */}
                <ScrollView 
                  horizontal 
                  pagingEnabled 
                  showsHorizontalScrollIndicator={false}
                  style={styles.imageCarousel}
                  onScroll={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 40));
                    setCurrentImageIndex(index);
                  }}
                  scrollEventThrottle={16}
                >
                  {selectedProduct.images.map((img, idx) => (
                    <Image 
                      key={idx}
                      source={{ uri: img }} 
                      style={styles.carouselImage}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
                
                {/* Image Indicators */}
                {selectedProduct.images.length > 1 && (
                  <View style={styles.imageIndicators}>
                    {selectedProduct.images.map((_, idx) => (
                      <View 
                        key={idx}
                        style={[styles.indicator, currentImageIndex === idx && styles.indicatorActive]}
                      />
                    ))}
                  </View>
                )}

                <ScrollView style={styles.productDetails}>
                  <Text style={styles.modalProductName}>{selectedProduct.name}</Text>
                  
                  <View style={styles.modalProductMeta}>
                    <View style={styles.modalRating}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text style={styles.modalRatingText}>{selectedProduct.rating.toFixed(1)}</Text>
                      <Text style={styles.modalRatingCount}>({selectedProduct.total_ratings} ratings)</Text>
                    </View>
                    <View style={styles.modalLikes}>
                      <Ionicons name="heart" size={16} color="#EF4444" />
                      <Text style={styles.modalLikesText}>{selectedProduct.likes} likes</Text>
                    </View>
                  </View>

                  <Text style={styles.modalDescription}>{selectedProduct.description}</Text>

                  <View style={styles.modalPricing}>
                    <Text style={styles.modalPrice}>₹{selectedProduct.discounted_price || selectedProduct.price}</Text>
                    {selectedProduct.discounted_price && (
                      <>
                        <Text style={styles.modalOriginalPrice}>₹{selectedProduct.price}</Text>
                        <View style={styles.modalSaveBadge}>
                          <Text style={styles.modalSaveText}>
                            Save ₹{selectedProduct.price - selectedProduct.discounted_price}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.stockInfo}>
                    <Ionicons name="cube-outline" size={16} color="#6B7280" />
                    <Text style={styles.stockText}>
                      {selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Out of stock'}
                    </Text>
                  </View>
                </ScrollView>

                <View style={styles.modalActions}>
                  {cartMap[selectedProduct.product_id] > 0 ? (
                    <View style={styles.modalQuantityControls}>
                      <TouchableOpacity 
                        style={styles.modalQtyBtn}
                        onPress={() => updateCartItem(selectedProduct.product_id, cartMap[selectedProduct.product_id] - 1)}
                      >
                        <Ionicons name="remove" size={24} color="#10B981" />
                      </TouchableOpacity>
                      <Text style={styles.modalQtyText}>{cartMap[selectedProduct.product_id]} in cart</Text>
                      <TouchableOpacity 
                        style={styles.modalQtyBtn}
                        onPress={() => updateCartItem(selectedProduct.product_id, cartMap[selectedProduct.product_id] + 1)}
                      >
                        <Ionicons name="add" size={24} color="#10B981" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.modalAddButton}
                      onPress={() => { addToCart(selectedProduct); setShowProductModal(false); }}
                    >
                      <Ionicons name="cart" size={20} color="#fff" />
                      <Text style={styles.modalAddText}>Add to Cart</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Cart Modal */}
      <Modal visible={showCartModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.cartModal}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Your Cart</Text>
              <TouchableOpacity onPress={() => setShowCartModal(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={60} color="#D1D5DB" />
                <Text style={styles.emptyCartText}>Your cart is empty</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.cartItems}>
                  {cart.map((item) => {
                    const product = products.find(p => p.product_id === item.product_id);
                    if (!product) return null;
                    const price = product.discounted_price || product.price;
                    
                    return (
                      <View key={item.product_id} style={styles.cartItem}>
                        {product.images.length > 0 && (
                          <Image source={{ uri: product.images[0] }} style={styles.cartItemImage} />
                        )}
                        <View style={styles.cartItemInfo}>
                          <Text style={styles.cartItemName} numberOfLines={2}>{product.name}</Text>
                          <Text style={styles.cartItemPrice}>₹{price} × {item.quantity}</Text>
                        </View>
                        <View style={styles.quantityControls}>
                          <TouchableOpacity 
                            style={styles.quantityButton}
                            onPress={() => updateCartItem(item.product_id, item.quantity - 1)}
                          >
                            <Ionicons name="remove" size={16} color="#6B7280" />
                          </TouchableOpacity>
                          <Text style={styles.quantityText}>{item.quantity}</Text>
                          <TouchableOpacity 
                            style={styles.quantityButton}
                            onPress={() => updateCartItem(item.product_id, item.quantity + 1)}
                          >
                            <Ionicons name="add" size={16} color="#6B7280" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.cartFooter}>
                  <View style={styles.cartTotalRow}>
                    <Text style={styles.cartTotalLabel}>Subtotal</Text>
                    <Text style={styles.cartTotalValue}>₹{getCartTotal()}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.checkoutButton}
                    onPress={() => { setShowCartModal(false); setShowCheckoutModal(true); }}
                  >
                    <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.clearCartButton} onPress={clearCart}>
                    <Text style={styles.clearCartText}>Clear Cart</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Checkout Modal */}
      <Modal visible={showCheckoutModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.checkoutModal}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Checkout</Text>
              <TouchableOpacity onPress={() => setShowCheckoutModal(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.checkoutContent}>
              {/* Saved Addresses */}
              <View style={styles.checkoutSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.checkoutSectionTitle}>Delivery Address</Text>
                  <TouchableOpacity onPress={() => setShowAddAddressModal(true)}>
                    <Text style={styles.addNewText}>+ Add New</Text>
                  </TouchableOpacity>
                </View>

                {/* GPS Location Button */}
                <TouchableOpacity 
                  style={styles.gpsButton}
                  onPress={getCurrentLocation}
                  disabled={isGettingLocation}
                >
                  {isGettingLocation ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="locate" size={20} color="#3B82F6" />
                  )}
                  <Text style={styles.gpsButtonText}>
                    {isGettingLocation ? 'Getting location...' : 'Use Current Location'}
                  </Text>
                </TouchableOpacity>

                {/* Saved Addresses List */}
                {userAddresses.length > 0 && (
                  <View style={styles.savedAddresses}>
                    {userAddresses.map((addr) => (
                      <TouchableOpacity 
                        key={addr.id}
                        style={[styles.addressOption, selectedAddressId === addr.id && styles.addressOptionSelected]}
                        onPress={() => handleAddressSelect(addr)}
                      >
                        <View style={[styles.radioOuter, selectedAddressId === addr.id && styles.radioOuterSelected]}>
                          {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                        </View>
                        <View style={styles.addressOptionContent}>
                          <Text style={styles.addressLabel}>{addr.label}</Text>
                          <Text style={styles.addressText} numberOfLines={2}>{addr.address}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Manual Address Input */}
                <Text style={styles.orText}>Or enter address manually</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter your full delivery address..."
                  placeholderTextColor="#9CA3AF"
                  value={deliveryAddress}
                  onChangeText={(text) => {
                    setDeliveryAddress(text);
                    setSelectedAddressId(null);
                  }}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Delivery Type */}
              <View style={styles.checkoutSection}>
                <Text style={styles.checkoutSectionTitle}>Delivery Option</Text>
                
                {vendor?.has_own_delivery && (
                  <TouchableOpacity 
                    style={[styles.deliveryOption, deliveryType === 'shop_delivery' && styles.deliveryOptionSelected]}
                    onPress={() => setDeliveryType('shop_delivery')}
                  >
                    <View style={styles.deliveryOptionLeft}>
                      <View style={[styles.radioOuter, deliveryType === 'shop_delivery' && styles.radioOuterSelected]}>
                        {deliveryType === 'shop_delivery' && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.deliveryOptionInfo}>
                        <Text style={styles.deliveryOptionTitle}>Shop's Own Delivery</Text>
                        <Text style={styles.deliveryOptionDesc}>Delivered by {vendor.name}</Text>
                      </View>
                    </View>
                    <Text style={styles.deliveryOptionPrice}>Free</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={[styles.deliveryOption, deliveryType === 'agent_delivery' && styles.deliveryOptionSelected]}
                  onPress={() => setDeliveryType('agent_delivery')}
                >
                  <View style={styles.deliveryOptionLeft}>
                    <View style={[styles.radioOuter, deliveryType === 'agent_delivery' && styles.radioOuterSelected]}>
                      {deliveryType === 'agent_delivery' && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.deliveryOptionInfo}>
                      <Text style={styles.deliveryOptionTitle}>Independent Fulfillment Agent</Text>
                      <Text style={styles.deliveryOptionDesc}>A nearby agent in your area will deliver</Text>
                    </View>
                  </View>
                  <Text style={styles.deliveryOptionPrice}>₹30</Text>
                </TouchableOpacity>

                {/* Agent Delivery Explanation */}
                {deliveryType === 'agent_delivery' && (
                  <View style={styles.agentDeliveryInfo}>
                    <Ionicons name="information-circle" size={18} color="#3B82F6" />
                    <Text style={styles.agentDeliveryText}>
                      An independent fulfillment agent nearby will pick up your order and deliver it to you. Track in real-time!
                    </Text>
                  </View>
                )}
              </View>

              {/* Order Summary */}
              <View style={styles.checkoutSection}>
                <Text style={styles.checkoutSectionTitle}>Order Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Items ({getCartItemCount()})</Text>
                  <Text style={styles.summaryValue}>₹{getCartTotal()}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>GST (5%)</Text>
                  <Text style={styles.summaryValue}>₹{Math.round(getCartTotal() * 0.05)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>
                    {deliveryType === 'shop_delivery' ? 'Free' : '₹30'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>
                    ₹{getCartTotal() + Math.round(getCartTotal() * 0.05) + (deliveryType === 'agent_delivery' ? 30 : 0)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.checkoutFooter}>
              <TouchableOpacity 
                style={[styles.placeOrderButton, (isPlacingOrder || !deliveryAddress.trim()) && styles.placeOrderButtonDisabled]} 
                onPress={placeOrder}
                disabled={isPlacingOrder || !deliveryAddress.trim()}
              >
                {isPlacingOrder ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.placeOrderText}>Place Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Address Modal */}
      <Modal visible={showAddAddressModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.addAddressModal}>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Add New Address</Text>
              <TouchableOpacity onPress={() => setShowAddAddressModal(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <View style={styles.addAddressContent}>
              <Text style={styles.inputLabel}>Label</Text>
              <TextInput
                style={styles.labelInput}
                placeholder="e.g., Home, Office, etc."
                placeholderTextColor="#9CA3AF"
                value={newAddressLabel}
                onChangeText={setNewAddressLabel}
              />

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={styles.addressInput}
                placeholder="Enter your full address..."
                placeholderTextColor="#9CA3AF"
                value={newAddressText}
                onChangeText={setNewAddressText}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity 
                style={[styles.saveAddressButton, !newAddressText.trim() && styles.saveAddressButtonDisabled]}
                onPress={addNewAddress}
                disabled={!newAddressText.trim()}
              >
                <Text style={styles.saveAddressText}>Save Address</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invoice Modal */}
      <Modal visible={showInvoiceModal} animationType="fade" transparent>
        <View style={styles.invoiceOverlay}>
          <Confetti visible={showConfetti} />
          <View style={styles.invoiceModal}>
            <View style={styles.invoiceHeader}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </View>
              <Text style={styles.invoiceTitle}>Order Placed! 🎉</Text>
              <Text style={styles.invoiceOrderId}>#{placedOrder?.order_id?.slice(-8)}</Text>
            </View>

            <ScrollView style={styles.invoiceContent}>
              {/* Shop Details */}
              <View style={styles.invoiceSection}>
                <View style={styles.invoiceShopRow}>
                  {placedOrder?.vendor_image && (
                    <Image source={{ uri: placedOrder.vendor_image }} style={styles.invoiceShopImage} />
                  )}
                  <View>
                    <Text style={styles.invoiceShopName}>{placedOrder?.vendor_name}</Text>
                    <Text style={styles.invoiceShopAddress}>{placedOrder?.vendor_address}</Text>
                  </View>
                </View>
              </View>

              {/* Items */}
              <View style={styles.invoiceSection}>
                <Text style={styles.invoiceSectionTitle}>Items</Text>
                {placedOrder?.items?.map((item: any, idx: number) => (
                  <View key={idx} style={styles.invoiceItem}>
                    <View style={styles.invoiceItemLeft}>
                      <Text style={styles.invoiceItemQty}>{item.quantity}x</Text>
                      <Text style={styles.invoiceItemName}>{item.name}</Text>
                    </View>
                    <Text style={styles.invoiceItemPrice}>₹{item.total}</Text>
                  </View>
                ))}
              </View>

              {/* Totals */}
              <View style={styles.invoiceSection}>
                <View style={styles.invoiceTotalRow}>
                  <Text style={styles.invoiceTotalLabel}>Subtotal</Text>
                  <Text style={styles.invoiceTotalValue}>₹{placedOrder?.subtotal}</Text>
                </View>
                <View style={styles.invoiceTotalRow}>
                  <Text style={styles.invoiceTotalLabel}>GST ({(placedOrder?.tax_rate || 0) * 100}%)</Text>
                  <Text style={styles.invoiceTotalValue}>₹{placedOrder?.tax_amount}</Text>
                </View>
                <View style={styles.invoiceTotalRow}>
                  <Text style={styles.invoiceTotalLabel}>Delivery</Text>
                  <Text style={styles.invoiceTotalValue}>
                    {placedOrder?.delivery_fee > 0 ? `₹${placedOrder?.delivery_fee}` : 'Free'}
                  </Text>
                </View>
                <View style={[styles.invoiceTotalRow, styles.invoiceGrandTotal]}>
                  <Text style={styles.invoiceGrandTotalLabel}>Grand Total</Text>
                  <Text style={styles.invoiceGrandTotalValue}>₹{placedOrder?.grand_total}</Text>
                </View>
              </View>

              {/* Delivery Info */}
              <View style={styles.invoiceSection}>
                <Text style={styles.invoiceSectionTitle}>Delivery To</Text>
                <Text style={styles.invoiceDeliveryAddress}>{placedOrder?.delivery_address?.address}</Text>
                <View style={styles.invoiceDeliveryType}>
                  <Ionicons 
                    name={placedOrder?.delivery_type === 'agent_delivery' ? 'people' : 'bicycle'} 
                    size={16} 
                    color="#6B7280" 
                  />
                  <Text style={styles.invoiceDeliveryTypeText}>
                    {placedOrder?.delivery_type === 'agent_delivery' ? 'Independent Fulfillment Agent' : 'Shop Delivery'}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.invoiceFooter}>
              <TouchableOpacity 
                style={styles.trackOrderButton}
                onPress={() => {
                  setShowInvoiceModal(false);
                  router.push(`/orders/${placedOrder?.order_id}`);
                }}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.trackOrderText}>Track Order</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.doneButton}
                onPress={() => {
                  setShowInvoiceModal(false);
                  router.back();
                }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  
  // Toast
  toast: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  
  // Confetti
  confettiContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, pointerEvents: 'none' },
  confettiPiece: { position: 'absolute', width: 10, height: 10, borderRadius: 2 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  cartButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cartBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#EF4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  
  content: { flex: 1 },
  vendorBanner: { height: 160, position: 'relative' },
  bannerImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  bannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12 },
  bannerContent: {},
  vendorName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  vendorMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 13, fontWeight: '700', color: '#F59E0B', marginLeft: 4 },
  ratingCount: { fontSize: 11, color: '#6B7280', marginLeft: 2 },
  vendorCategory: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  
  vendorInfoCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: -16, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  infoText: { fontSize: 13, color: '#4B5563', flex: 1 },
  deliveryOptions: { flexDirection: 'row', marginTop: 8, gap: 8 },
  deliveryTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6 },
  deliveryTagText: { fontSize: 11, fontWeight: '600' },
  
  categoryFilter: { paddingHorizontal: 16, paddingVertical: 12 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#E5E7EB', borderRadius: 20, marginRight: 8 },
  categoryChipSelected: { backgroundColor: '#10B981' },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  categoryChipTextSelected: { color: '#fff' },
  
  productsSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: { width: (SCREEN_WIDTH - 42) / 2, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  productImageContainer: { height: 110, position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  productImagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  discountBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  discountText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  multiImageBadge: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  multiImageText: { fontSize: 9, color: '#fff', fontWeight: '600' },
  
  productInfo: { padding: 10 },
  productName: { fontSize: 12, fontWeight: '600', color: '#1F2937', height: 32, lineHeight: 16 },
  productRating: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  productRatingText: { fontSize: 10, color: '#F59E0B', fontWeight: '600', marginLeft: 3 },
  productLikes: { fontSize: 10, color: '#9CA3AF', marginLeft: 4 },
  productPricing: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  productPrice: { fontSize: 15, fontWeight: '700', color: '#10B981' },
  productOriginalPrice: { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
  
  addToCartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, marginTop: 8, gap: 4 },
  addToCartText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  
  quantityControlsInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D1FAE5', borderRadius: 8, marginTop: 8, paddingVertical: 4 },
  qtyBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#10B981', minWidth: 30, textAlign: 'center' },
  
  bottomPadding: { height: 140 },
  
  floatingCart: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: '#10B981', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  floatingCartLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatingCartBadge: { backgroundColor: '#fff', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  floatingCartBadgeText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  floatingCartText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  floatingCartTotal: { fontSize: 18, fontWeight: '700', color: '#fff' },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  productModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, backgroundColor: '#fff', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  imageCarousel: { height: 220 },
  carouselImage: { width: SCREEN_WIDTH, height: 220 },
  imageIndicators: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 6 },
  indicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  indicatorActive: { backgroundColor: '#10B981', width: 20 },
  productDetails: { padding: 16, maxHeight: 200 },
  modalProductName: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  modalProductMeta: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  modalRating: { flexDirection: 'row', alignItems: 'center' },
  modalRatingText: { fontSize: 14, fontWeight: '600', color: '#F59E0B', marginLeft: 4 },
  modalRatingCount: { fontSize: 12, color: '#9CA3AF', marginLeft: 4 },
  modalLikes: { flexDirection: 'row', alignItems: 'center' },
  modalLikesText: { fontSize: 14, color: '#6B7280', marginLeft: 4 },
  modalDescription: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 12 },
  modalPricing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalPrice: { fontSize: 26, fontWeight: '800', color: '#10B981' },
  modalOriginalPrice: { fontSize: 16, color: '#9CA3AF', textDecorationLine: 'line-through' },
  modalSaveBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modalSaveText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  stockInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockText: { fontSize: 12, color: '#6B7280' },
  modalActions: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  modalAddButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, gap: 8 },
  modalAddText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalQuantityControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D1FAE5', borderRadius: 12, paddingVertical: 10 },
  modalQtyBtn: { width: 50, height: 40, justifyContent: 'center', alignItems: 'center' },
  modalQtyText: { fontSize: 16, fontWeight: '700', color: '#10B981', minWidth: 100, textAlign: 'center' },
  
  // Cart Modal
  cartModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cartTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  emptyCart: { alignItems: 'center', paddingVertical: 50 },
  emptyCartText: { fontSize: 15, color: '#9CA3AF', marginTop: 12 },
  cartItems: { maxHeight: 280 },
  cartItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cartItemImage: { width: 56, height: 56, borderRadius: 8 },
  cartItemInfo: { flex: 1, marginLeft: 12 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  cartItemPrice: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quantityButton: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  quantityText: { fontSize: 14, fontWeight: '600', color: '#1F2937', minWidth: 24, textAlign: 'center' },
  cartFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cartTotalLabel: { fontSize: 15, color: '#6B7280' },
  cartTotalValue: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  checkoutButton: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  checkoutButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  clearCartButton: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
  clearCartText: { fontSize: 13, color: '#EF4444' },
  
  // Checkout Modal
  checkoutModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  checkoutContent: { padding: 16 },
  checkoutSection: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  checkoutSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  addNewText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  gpsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', paddingVertical: 12, borderRadius: 10, marginBottom: 12, gap: 8 },
  gpsButtonText: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
  savedAddresses: { marginBottom: 12 },
  orText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 },
  addressOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 2, borderColor: 'transparent', gap: 12 },
  addressOptionSelected: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  addressOptionContent: { flex: 1 },
  addressLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  addressText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  addressInput: { backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, fontSize: 14, color: '#1F2937', minHeight: 70, textAlignVertical: 'top' },
  deliveryOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  deliveryOptionSelected: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  deliveryOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  deliveryOptionInfo: { flex: 1 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected: { borderColor: '#10B981' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  deliveryOptionTitle: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  deliveryOptionDesc: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  deliveryOptionPrice: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  agentDeliveryInfo: { flexDirection: 'row', backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8, gap: 8, marginTop: 6 },
  agentDeliveryText: { flex: 1, fontSize: 11, color: '#1E40AF', lineHeight: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 6, paddingTop: 10 },
  summaryTotalLabel: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  summaryTotalValue: { fontSize: 18, fontWeight: '700', color: '#10B981' },
  checkoutFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  placeOrderButton: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  placeOrderButtonDisabled: { opacity: 0.5 },
  placeOrderText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  
  // Add Address Modal
  addAddressModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  addAddressContent: { padding: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginBottom: 8 },
  labelInput: { backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, fontSize: 14, color: '#1F2937', marginBottom: 16 },
  saveAddressButton: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveAddressButtonDisabled: { opacity: 0.5 },
  saveAddressText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  
  // Invoice Modal
  invoiceOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  invoiceModal: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxHeight: '85%', overflow: 'hidden' },
  invoiceHeader: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#F0FDF4' },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  invoiceTitle: { fontSize: 22, fontWeight: '800', color: '#1F2937' },
  invoiceOrderId: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  invoiceContent: { padding: 16 },
  invoiceSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  invoiceSectionTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase' },
  invoiceShopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  invoiceShopImage: { width: 48, height: 48, borderRadius: 8 },
  invoiceShopName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  invoiceShopAddress: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  invoiceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  invoiceItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  invoiceItemQty: { fontSize: 13, fontWeight: '600', color: '#10B981', minWidth: 30 },
  invoiceItemName: { fontSize: 13, color: '#1F2937', flex: 1 },
  invoiceItemPrice: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  invoiceTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  invoiceTotalLabel: { fontSize: 13, color: '#6B7280' },
  invoiceTotalValue: { fontSize: 13, color: '#1F2937' },
  invoiceGrandTotal: { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 8, paddingTop: 10 },
  invoiceGrandTotalLabel: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  invoiceGrandTotalValue: { fontSize: 20, fontWeight: '800', color: '#10B981' },
  invoiceDeliveryAddress: { fontSize: 13, color: '#1F2937', lineHeight: 18 },
  invoiceDeliveryType: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  invoiceDeliveryTypeText: { fontSize: 12, color: '#6B7280' },
  invoiceFooter: { padding: 16, gap: 10 },
  trackOrderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, gap: 8 },
  trackOrderText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  doneButton: { alignItems: 'center', paddingVertical: 12 },
  doneButtonText: { fontSize: 14, color: '#6B7280' },
});
