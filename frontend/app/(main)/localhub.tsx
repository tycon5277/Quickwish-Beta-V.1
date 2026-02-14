import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Image, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wisher-mock-promo.preview.emergentagent.com';

// Promotions Backend URL
const PROMOTIONS_BACKEND_URL = 'https://wisher-mock-promo.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// MOCK DATA FOR VISUALIZATION - These IDs should match vendor_ids from the seeded data
// The first few vendors will be shown as "FEATURED"
const MOCK_FEATURED_VENDOR_IDS = [
  'vendor-001', // Will be featured if exists
  'vendor-002', // Will be featured if exists
];

interface HubVendor {
  vendor_id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  rating: number;
  total_ratings: number;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  opening_hours: string;
  has_own_delivery: boolean;
  is_verified: boolean;
  distance_km?: number;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps' },
  { id: 'Grocery', label: 'Grocery', icon: 'cart' },
  { id: 'Restaurant', label: 'Food', icon: 'restaurant' },
  { id: 'Pharmacy', label: 'Pharmacy', icon: 'medkit' },
  { id: 'Electronics', label: 'Electronics', icon: 'phone-portrait' },
  { id: 'Fashion', label: 'Fashion', icon: 'shirt' },
  { id: 'Bakery', label: 'Bakery', icon: 'cafe' },
  { id: 'Garden & Plants', label: 'Plants', icon: 'leaf' },
];

export default function LocalHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessionToken } = useAuth();
  
  const [vendors, setVendors] = useState<HubVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [radius, setRadius] = useState(5);
  const [showRadiusSlider, setShowRadiusSlider] = useState(false);
  const [cartSummary, setCartSummary] = useState<Record<string, number>>({});
  const [orderCount, setOrderCount] = useState(0);
  const [featuredShopIds, setFeaturedShopIds] = useState<string[]>([]);

  const fetchVendors = useCallback(async () => {
    try {
      let url = `${BACKEND_URL}/api/localhub/vendors?radius_km=${radius}`;
      if (selectedCategory !== 'all') {
        url += `&category=${encodeURIComponent(selectedCategory)}`;
      }
      // Mock user location (Bangalore)
      url += `&lat=12.9716&lng=77.5946`;
      
      const response = await axios.get(url);
      setVendors(response.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, radius]);

  const fetchCartSummary = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/cart/summary`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setCartSummary(response.data);
    } catch (error) {
      console.error('Error fetching cart summary:', error);
    }
  }, [sessionToken]);

  const fetchOrderCount = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      // Count active orders (not delivered or cancelled)
      const activeOrders = response.data.filter((o: any) => 
        !['delivered', 'cancelled'].includes(o.status)
      );
      setOrderCount(activeOrders.length);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  }, [sessionToken]);

  // Fetch featured shop IDs - Using MOCK DATA for visualization
  const fetchFeaturedShops = useCallback(async () => {
    // MOCK DATA: Comment this block and uncomment the fetch below after testing
    setFeaturedShopIds(MOCK_FEATURED_VENDOR_IDS);
    return;
    
    /* LIVE API - Uncomment after testing
    try {
      const res = await fetch(`${PROMOTIONS_BACKEND_URL}/api/wisher/localhub/featured?lat=12.9716&lng=77.5946`);
      if (res.ok) {
        const data = await res.json();
        setFeaturedShopIds(data.featured_vendor_ids || []);
      }
    } catch (error) {
      console.log('Error fetching featured shops:', error);
    }
    */
  }, []);

  const seedVendors = async () => {
    try {
      setIsLoading(true);
      await axios.post(`${BACKEND_URL}/api/seed/hubvendors`);
      await fetchVendors();
    } catch (error) {
      console.error('Error seeding vendors:', error);
    }
  };

  useEffect(() => {
    fetchVendors();
    fetchFeaturedShops();
  }, [fetchVendors, fetchFeaturedShops]);

  useEffect(() => {
    fetchCartSummary();
    fetchOrderCount();
  }, [fetchCartSummary, fetchOrderCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchVendors(), fetchCartSummary(), fetchOrderCount(), fetchFeaturedShops()]);
    setRefreshing(false);
  };

  // Sort vendors to show featured first
  const sortedVendors = [...vendors].sort((a, b) => {
    const aFeatured = featuredShopIds.includes(a.vendor_id);
    const bFeatured = featuredShopIds.includes(b.vendor_id);
    if (aFeatured && !bFeatured) return -1;
    if (!aFeatured && bFeatured) return 1;
    return 0;
  });

  const filteredVendors = sortedVendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openShop = (vendor: HubVendor) => {
    router.push(`/shop/${vendor.vendor_id}`);
  };

  const totalCartItems = Object.values(cartSummary).reduce((sum, count) => sum + count, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Compact Header */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#7C3AED', '#9333EA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          {/* Top Row: Title & Actions */}
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleArea}>
              <Text style={styles.headerTitle}>Local Hub</Text>
              <Text style={styles.headerSubtitle}>Discover shops near you</Text>
            </View>
            <View style={styles.headerActions}>
              {/* My Orders Button */}
              <TouchableOpacity 
                style={styles.headerIconButton}
                onPress={() => router.push('/orders')}
              >
                <Ionicons name="receipt-outline" size={22} color="#fff" />
                {orderCount > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{orderCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Radius Button */}
              <TouchableOpacity 
                style={styles.radiusButton}
                onPress={() => setShowRadiusSlider(!showRadiusSlider)}
              >
                <Ionicons name="locate" size={18} color="#fff" />
                <Text style={styles.radiusButtonText}>{radius}km</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search shops, products..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Radius Slider */}
          {showRadiusSlider && (
            <View style={styles.radiusSliderContainer}>
              <View style={styles.radiusSliderHeader}>
                <Text style={styles.radiusSliderLabel}>Search Radius</Text>
                <Text style={styles.radiusSliderValue}>{radius} km</Text>
              </View>
              <Slider
                style={styles.radiusSlider}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={radius}
                onValueChange={setRadius}
                minimumTrackTintColor="#fff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#fff"
              />
              <View style={styles.radiusMarkers}>
                <Text style={styles.radiusMarker}>1 km</Text>
                <Text style={styles.radiusMarker}>5 km</Text>
                <Text style={styles.radiusMarker}>10 km</Text>
              </View>
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Category Filter */}
      <View style={styles.categoryWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContainer}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Ionicons 
                  name={cat.icon as any} 
                  size={14} 
                  color={isSelected ? '#fff' : '#6B7280'} 
                />
                <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loaderText}>Finding shops near you...</Text>
          </View>
        ) : filteredVendors.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIcon}>
              <Ionicons name="storefront-outline" size={44} color="#10B981" />
            </View>
            <Text style={styles.emptyStateTitle}>No shops found</Text>
            <Text style={styles.emptyStateSubtext}>
              {searchQuery 
                ? 'Try a different search term'
                : 'Try increasing your search radius or seed sample data'
              }
            </Text>
            <TouchableOpacity style={styles.seedButton} onPress={seedVendors}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.seedButtonText}>Load Sample Shops</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Results Count */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {filteredVendors.length} shop{filteredVendors.length !== 1 ? 's' : ''} found
              </Text>
              {totalCartItems > 0 && (
                <View style={styles.totalCartBadge}>
                  <Ionicons name="cart" size={14} color="#10B981" />
                  <Text style={styles.totalCartText}>{totalCartItems} items in carts</Text>
                </View>
              )}
            </View>

            {/* Vendor Cards */}
            {filteredVendors.map((vendor) => {
              const cartCount = cartSummary[vendor.vendor_id] || 0;
              const isFeatured = featuredShopIds.includes(vendor.vendor_id);
              
              return (
                <TouchableOpacity 
                  key={vendor.vendor_id} 
                  style={styles.vendorCard}
                  onPress={() => openShop(vendor)}
                  activeOpacity={0.9}
                >
                  {/* Vendor Image */}
                  <View style={styles.vendorImageContainer}>
                    {vendor.image ? (
                      <Image 
                        source={{ uri: vendor.image }} 
                        style={styles.vendorImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.vendorImagePlaceholder}>
                        <Ionicons name="storefront" size={36} color="#9CA3AF" />
                      </View>
                    )}
                    {/* Featured Badge */}
                    {isFeatured && (
                      <View style={styles.featuredBadge}>
                        <Ionicons name="star" size={10} color="#fff" />
                        <Text style={styles.featuredBadgeText}>FEATURED</Text>
                      </View>
                    )}
                    {/* Category Badge */}
                    <View style={[styles.categoryBadge, isFeatured && { top: 30 }]}>
                      <Text style={styles.categoryBadgeText}>{vendor.category}</Text>
                    </View>
                    {/* Verified Badge */}
                    {vendor.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                      </View>
                    )}
                    {/* Cart Badge on Vendor Card */}
                    {cartCount > 0 && (
                      <View style={styles.vendorCartBadge}>
                        <Ionicons name="cart" size={12} color="#fff" />
                        <Text style={styles.vendorCartBadgeText}>{cartCount}</Text>
                      </View>
                    )}
                  </View>

                  {/* Vendor Info */}
                  <View style={styles.vendorInfo}>
                    <View style={styles.vendorHeader}>
                      <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Text style={styles.ratingText}>{vendor.rating.toFixed(1)}</Text>
                        <Text style={styles.ratingCount}>({vendor.total_ratings})</Text>
                      </View>
                    </View>

                    <Text style={styles.vendorDescription} numberOfLines={2}>
                      {vendor.description}
                    </Text>

                    <View style={styles.vendorMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="location-outline" size={13} color="#6B7280" />
                        <Text style={styles.metaText}>
                          {vendor.distance_km ? `${vendor.distance_km} km` : vendor.location.address.substring(0, 25)}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={13} color="#6B7280" />
                        <Text style={styles.metaText}>{vendor.opening_hours}</Text>
                      </View>
                    </View>

                    {/* Delivery Badge */}
                    <View style={styles.deliveryBadges}>
                      {vendor.has_own_delivery && (
                        <View style={[styles.deliveryBadge, { backgroundColor: '#D1FAE5' }]}>
                          <Ionicons name="bicycle" size={11} color="#10B981" />
                          <Text style={[styles.deliveryBadgeText, { color: '#10B981' }]}>Shop Delivery</Text>
                        </View>
                      )}
                      <View style={[styles.deliveryBadge, { backgroundColor: '#DBEAFE' }]}>
                        <Ionicons name="people" size={11} color="#3B82F6" />
                        <Text style={[styles.deliveryBadgeText, { color: '#3B82F6' }]}>Agent</Text>
                      </View>
                    </View>
                  </View>

                  {/* Arrow */}
                  <View style={styles.arrowContainer}>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerWrapper: {
    overflow: 'hidden',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#F59E0B',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  radiusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
  },
  radiusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 8,
  },
  radiusSliderContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 12,
  },
  radiusSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  radiusSliderLabel: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  radiusSliderValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
  radiusSlider: {
    width: '100%',
    height: 36,
  },
  radiusMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  radiusMarker: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  categoryWrapper: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryContainer: {
    paddingHorizontal: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    gap: 5,
  },
  categoryPillSelected: {
    backgroundColor: '#10B981',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  categoryTextSelected: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  loaderText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 36,
  },
  emptyStateIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  seedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  seedButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultsCount: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  totalCartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  totalCartText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  vendorCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  vendorImageContainer: {
    width: 90,
    height: 120,
    position: 'relative',
  },
  vendorImage: {
    width: '100%',
    height: '100%',
  },
  vendorImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '600',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 2,
  },
  featuredBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  vendorCartBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  vendorCartBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  vendorInfo: {
    flex: 1,
    padding: 10,
  },
  vendorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  vendorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    marginRight: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    marginLeft: 2,
  },
  ratingCount: {
    fontSize: 9,
    color: '#9CA3AF',
    marginLeft: 2,
  },
  vendorDescription: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 15,
    marginBottom: 6,
  },
  vendorMeta: {
    marginBottom: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 4,
  },
  deliveryBadges: {
    flexDirection: 'row',
    gap: 5,
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 3,
  },
  deliveryBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  arrowContainer: {
    justifyContent: 'center',
    paddingRight: 10,
  },
  bottomPadding: {
    height: 100,
  },
});
