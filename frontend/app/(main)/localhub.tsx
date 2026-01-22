import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import axios from 'axios';
import Constants from 'expo-constants';

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
  const [vendors, setVendors] = useState<HubVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [radius, setRadius] = useState(5);
  const [showRadiusSlider, setShowRadiusSlider] = useState(false);

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
  }, [fetchVendors]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVendors();
    setRefreshing(false);
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openShop = (vendor: HubVendor) => {
    router.push(`/shop/${vendor.vendor_id}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#10B981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Local Hub</Text>
              <Text style={styles.headerSubtitle}>Discover shops near you</Text>
            </View>
            <TouchableOpacity 
              style={styles.radiusButton}
              onPress={() => setShowRadiusSlider(!showRadiusSlider)}
            >
              <Ionicons name="locate" size={20} color="#fff" />
              <Text style={styles.radiusButtonText}>{radius} km</Text>
            </TouchableOpacity>
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
                  size={16} 
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
              <Ionicons name="storefront-outline" size={48} color="#10B981" />
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
            </View>

            {/* Vendor Cards */}
            {filteredVendors.map((vendor) => (
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
                      <Ionicons name="storefront" size={40} color="#9CA3AF" />
                    </View>
                  )}
                  {/* Category Badge */}
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{vendor.category}</Text>
                  </View>
                  {/* Verified Badge */}
                  {vendor.is_verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    </View>
                  )}
                </View>

                {/* Vendor Info */}
                <View style={styles.vendorInfo}>
                  <View style={styles.vendorHeader}>
                    <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.ratingText}>{vendor.rating.toFixed(1)}</Text>
                      <Text style={styles.ratingCount}>({vendor.total_ratings})</Text>
                    </View>
                  </View>

                  <Text style={styles.vendorDescription} numberOfLines={2}>
                    {vendor.description}
                  </Text>

                  <View style={styles.vendorMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={14} color="#6B7280" />
                      <Text style={styles.metaText}>
                        {vendor.distance_km ? `${vendor.distance_km} km away` : vendor.location.address}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{vendor.opening_hours}</Text>
                    </View>
                  </View>

                  {/* Delivery Badge */}
                  <View style={styles.deliveryBadges}>
                    {vendor.has_own_delivery && (
                      <View style={[styles.deliveryBadge, { backgroundColor: '#D1FAE5' }]}>
                        <Ionicons name="bicycle" size={12} color="#10B981" />
                        <Text style={[styles.deliveryBadgeText, { color: '#10B981' }]}>Shop Delivery</Text>
                      </View>
                    )}
                    <View style={[styles.deliveryBadge, { backgroundColor: '#DBEAFE' }]}>
                      <Ionicons name="people" size={12} color="#3B82F6" />
                      <Text style={[styles.deliveryBadgeText, { color: '#3B82F6' }]}>Agent Delivery</Text>
                    </View>
                  </View>
                </View>

                {/* Arrow */}
                <View style={styles.arrowContainer}>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            ))}
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
    backgroundColor: '#F3F4F6',
  },
  headerWrapper: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  radiusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  radiusButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 10,
  },
  radiusSliderContainer: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 14,
  },
  radiusSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  radiusSliderLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  radiusSliderValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  radiusSlider: {
    width: '100%',
    height: 40,
  },
  radiusMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  radiusMarker: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  categoryWrapper: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryContainer: {
    paddingHorizontal: 16,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    gap: 6,
  },
  categoryPillSelected: {
    backgroundColor: '#10B981',
  },
  categoryText: {
    fontSize: 13,
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
    paddingVertical: 60,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  seedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  seedButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  resultsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  resultsCount: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  vendorCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  vendorImageContainer: {
    width: 100,
    height: 140,
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
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 2,
  },
  vendorInfo: {
    flex: 1,
    padding: 12,
  },
  vendorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    marginRight: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
    marginLeft: 3,
  },
  ratingCount: {
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 2,
  },
  vendorDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  vendorMeta: {
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
  },
  deliveryBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  deliveryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  arrowContainer: {
    justifyContent: 'center',
    paddingRight: 12,
  },
  bottomPadding: {
    height: 100,
  },
});
