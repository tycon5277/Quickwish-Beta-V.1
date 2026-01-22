import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, TextInput, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wishmarket.preview.emergentagent.com';

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

export default function ShopScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { sessionToken } = useAuth();
  
  const [vendor, setVendor] = useState<HubVendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'shop_delivery' | 'agent_delivery'>('agent_delivery');

  const fetchVendor = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/localhub/vendors/${id}`);
      setVendor(response.data);
    } catch (error) {
      console.error('Error fetching vendor:', error);
    }
  }, [id]);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/localhub/vendors/${id}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchCart = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/cart`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setCart(response.data.items || []);
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchVendor();
    fetchProducts();
    fetchCart();
  }, [fetchVendor, fetchProducts, fetchCart]);

  const productCategories = ['all', ...new Set(products.map(p => p.category))];
  
  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  const addToCart = async (product: Product) => {
    if (!sessionToken) {
      Alert.alert('Login Required', 'Please login to add items to cart.');
      return;
    }

    try {
      await axios.post(`${BACKEND_URL}/api/cart/add`, 
        { product_id: product.product_id, quantity: 1 },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      await fetchCart();
      Alert.alert('Added to Cart', `${product.name} added to your cart!`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add to cart');
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
      await axios.delete(`${BACKEND_URL}/api/cart/clear`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setCart([]);
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  const placeOrder = async () => {
    if (!sessionToken) {
      Alert.alert('Login Required', 'Please login to place an order.');
      return;
    }

    if (!deliveryAddress.trim()) {
      Alert.alert('Address Required', 'Please enter a delivery address.');
      return;
    }

    try {
      const response = await axios.post(`${BACKEND_URL}/api/orders`,
        {
          delivery_address: { address: deliveryAddress },
          delivery_type: deliveryType,
        },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      
      setShowCheckoutModal(false);
      setCart([]);
      Alert.alert(
        '🎉 Order Placed!',
        `Order #${response.data.order_id.slice(-8)} placed successfully!\nTotal: ₹${response.data.grand_total}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to place order');
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
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color="#6B7280" />
              <Text style={styles.infoText}>{vendor.contact_phone}</Text>
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
            {filteredProducts.map((product) => (
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
                  <TouchableOpacity 
                    style={styles.addToCartButton}
                    onPress={(e) => { e.stopPropagation(); addToCart(product); }}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.addToCartText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Cart Bar */}
      {getCartItemCount() > 0 && (
        <TouchableOpacity style={styles.floatingCart} onPress={() => setShowCartModal(true)}>
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
                  <TouchableOpacity 
                    style={styles.modalAddButton}
                    onPress={() => { addToCart(selectedProduct); setShowProductModal(false); }}
                  >
                    <Ionicons name="cart" size={20} color="#fff" />
                    <Text style={styles.modalAddText}>Add to Cart</Text>
                  </TouchableOpacity>
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
              {/* Delivery Address */}
              <View style={styles.checkoutSection}>
                <Text style={styles.checkoutSectionTitle}>Delivery Address</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter your full delivery address..."
                  placeholderTextColor="#9CA3AF"
                  value={deliveryAddress}
                  onChangeText={setDeliveryAddress}
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
                      <View>
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
                    <View>
                      <Text style={styles.deliveryOptionTitle}>QuickWish Agent Delivery</Text>
                      <Text style={styles.deliveryOptionDesc}>A nearby fulfillment agent will deliver</Text>
                    </View>
                  </View>
                  <Text style={styles.deliveryOptionPrice}>₹30</Text>
                </TouchableOpacity>

                {/* Agent Delivery Explanation */}
                {deliveryType === 'agent_delivery' && (
                  <View style={styles.agentDeliveryInfo}>
                    <Ionicons name="information-circle" size={18} color="#3B82F6" />
                    <Text style={styles.agentDeliveryText}>
                      A QuickWish fulfillment agent in your area will pick up your order from the shop and deliver it to you. You can track the delivery in real-time.
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
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={styles.summaryValue}>
                    {deliveryType === 'shop_delivery' ? 'Free' : '₹30'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>
                    ₹{getCartTotal() + (deliveryType === 'agent_delivery' ? 30 : 0)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.checkoutFooter}>
              <TouchableOpacity style={styles.placeOrderButton} onPress={placeOrder}>
                <Text style={styles.placeOrderText}>Place Order</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  cartButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cartBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#EF4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  content: { flex: 1 },
  vendorBanner: { height: 180, position: 'relative' },
  bannerImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  bannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 16 },
  bannerContent: {},
  vendorName: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  vendorMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 14, fontWeight: '700', color: '#F59E0B', marginLeft: 4 },
  ratingCount: { fontSize: 12, color: '#6B7280', marginLeft: 2 },
  vendorCategory: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  vendorInfoCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: -20, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  infoText: { fontSize: 14, color: '#4B5563', flex: 1 },
  deliveryOptions: { flexDirection: 'row', marginTop: 8, gap: 8 },
  deliveryTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6 },
  deliveryTagText: { fontSize: 12, fontWeight: '600' },
  categoryFilter: { paddingHorizontal: 16, paddingVertical: 12 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E5E7EB', borderRadius: 20, marginRight: 8 },
  categoryChipSelected: { backgroundColor: '#10B981' },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  categoryChipTextSelected: { color: '#fff' },
  productsSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: (SCREEN_WIDTH - 44) / 2, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  productImageContainer: { height: 120, position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  productImagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  discountBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  discountText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  multiImageBadge: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  multiImageText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  productInfo: { padding: 10 },
  productName: { fontSize: 13, fontWeight: '600', color: '#1F2937', height: 36, lineHeight: 18 },
  productRating: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  productRatingText: { fontSize: 11, color: '#F59E0B', fontWeight: '600', marginLeft: 3 },
  productLikes: { fontSize: 11, color: '#9CA3AF', marginLeft: 4 },
  productPricing: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  productPrice: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  productOriginalPrice: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through' },
  addToCartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, marginTop: 8, gap: 4 },
  addToCartText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  bottomPadding: { height: 100 },
  floatingCart: { position: 'absolute', bottom: 90, left: 16, right: 16, backgroundColor: '#10B981', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  floatingCartLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatingCartBadge: { backgroundColor: '#fff', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  floatingCartBadgeText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  floatingCartText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  floatingCartTotal: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  productModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, backgroundColor: '#fff', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  imageCarousel: { height: 250 },
  carouselImage: { width: SCREEN_WIDTH, height: 250 },
  imageIndicators: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  indicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  indicatorActive: { backgroundColor: '#10B981', width: 20 },
  productDetails: { padding: 20, maxHeight: 250 },
  modalProductName: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 10 },
  modalProductMeta: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  modalRating: { flexDirection: 'row', alignItems: 'center' },
  modalRatingText: { fontSize: 14, fontWeight: '600', color: '#F59E0B', marginLeft: 4 },
  modalRatingCount: { fontSize: 12, color: '#9CA3AF', marginLeft: 4 },
  modalLikes: { flexDirection: 'row', alignItems: 'center' },
  modalLikesText: { fontSize: 14, color: '#6B7280', marginLeft: 4 },
  modalDescription: { fontSize: 14, color: '#6B7280', lineHeight: 22, marginBottom: 16 },
  modalPricing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  modalPrice: { fontSize: 28, fontWeight: '800', color: '#10B981' },
  modalOriginalPrice: { fontSize: 18, color: '#9CA3AF', textDecorationLine: 'line-through' },
  modalSaveBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modalSaveText: { fontSize: 12, fontWeight: '600', color: '#10B981' },
  stockInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockText: { fontSize: 13, color: '#6B7280' },
  modalActions: { padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  modalAddButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, gap: 8 },
  modalAddText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cartModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cartTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  emptyCart: { alignItems: 'center', paddingVertical: 60 },
  emptyCartText: { fontSize: 16, color: '#9CA3AF', marginTop: 12 },
  cartItems: { maxHeight: 300 },
  cartItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cartItemImage: { width: 60, height: 60, borderRadius: 8 },
  cartItemInfo: { flex: 1, marginLeft: 12 },
  cartItemName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  cartItemPrice: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  quantityText: { fontSize: 15, fontWeight: '600', color: '#1F2937', minWidth: 24, textAlign: 'center' },
  cartFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  cartTotalLabel: { fontSize: 16, color: '#6B7280' },
  cartTotalValue: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  checkoutButton: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  checkoutButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  clearCartButton: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  clearCartText: { fontSize: 14, color: '#EF4444' },
  checkoutModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  checkoutContent: { padding: 20 },
  checkoutSection: { marginBottom: 24 },
  checkoutSectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  addressInput: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 15, color: '#1F2937', minHeight: 80, textAlignVertical: 'top' },
  deliveryOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  deliveryOptionSelected: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  deliveryOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected: { borderColor: '#10B981' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  deliveryOptionTitle: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  deliveryOptionDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  deliveryOptionPrice: { fontSize: 14, fontWeight: '700', color: '#10B981' },
  agentDeliveryInfo: { flexDirection: 'row', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, gap: 10, marginTop: 8 },
  agentDeliveryText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { fontSize: 14, color: '#6B7280' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 8, paddingTop: 12 },
  summaryTotalLabel: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  summaryTotalValue: { fontSize: 20, fontWeight: '700', color: '#10B981' },
  checkoutFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  placeOrderButton: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  placeOrderText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
