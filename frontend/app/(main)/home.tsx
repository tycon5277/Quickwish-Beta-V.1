import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert, Image, FlatList, Dimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';
import { useAppStore } from '../../src/store';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wisher-mock-promo.preview.emergentagent.com';

// Promotions Backend URL
const PROMOTIONS_BACKEND_URL = 'https://wisher-mock-promo.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// MOCK DATA FOR VISUALIZATION - Remove after testing
const MOCK_BANNERS = [
  {
    banner_id: 'mock-1',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800',
    title: 'Fresh Groceries Delivered',
    subtitle: 'Up to 30% off on first order',
    link_type: 'shop',
    link_target: 'vendor-001',
  },
  {
    banner_id: 'mock-2',
    image: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=800',
    title: 'Fast & Reliable Delivery',
    subtitle: 'Order now, get it in 30 mins',
    link_type: 'shop',
    link_target: 'vendor-002',
  },
  {
    banner_id: 'mock-3',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
    title: 'Local Restaurants Near You',
    subtitle: 'Discover amazing food today',
    link_type: 'shop',
    link_target: 'vendor-003',
  },
];

interface Wish {
  wish_id: string;
  wish_type: string;
  title: string;
  status: string;
  remuneration: number;
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, sessionToken } = useAuth();
  const { 
    wishesRefreshTrigger, 
    setUserLocation, 
    locationPermissionChecked, 
    setLocationPermissionChecked, 
    triggerWishesRefresh,
    isReturningUser,
    checkAndSetReturningUser
  } = useAppStore();
  const [location, setLocation] = useState<string>('Fetching location...');
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);

  // Check if returning user on mount
  useEffect(() => {
    if (user?.email) {
      checkAndSetReturningUser(user.email);
    }
  }, [user?.email]);

  // Fetch promotional banners - Using MOCK DATA for visualization
  const fetchBanners = useCallback(async () => {
    // MOCK DATA: Comment this block and uncomment the fetch below after testing
    setBanners(MOCK_BANNERS);
    return;
    
    /* LIVE API - Uncomment after testing
    try {
      const res = await fetch(`${PROMOTIONS_BACKEND_URL}/api/wisher/home/banners`);
      if (res.ok) {
        const data = await res.json();
        setBanners(data);
      }
    } catch (error) {
      console.log('Error fetching banners:', error);
    }
    */
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation('Location not enabled');
        if (!locationPermissionChecked) {
          router.push('/(auth)/permissions');
          setLocationPermissionChecked(true);
        }
        return;
      }
      setLocationPermissionChecked(true);
      const loc = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (address) {
        const locationStr = [address.district, address.city, address.region]
          .filter(Boolean)
          .join(', ');
        setLocation(locationStr || 'Unknown location');
        setUserLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          address: locationStr || 'Current Location',
        });
      }
    } catch (error) {
      setLocation('Unable to get location');
    }
  }, [locationPermissionChecked, setLocationPermissionChecked, setUserLocation, router]);

  const fetchWishes = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/wishes`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setWishes(response.data);
    } catch (error) {
      console.error('Error fetching wishes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  // Initial load
  useEffect(() => {
    fetchLocation();
    fetchWishes();
    fetchBanners();
  }, []);

  // Refresh when wishesRefreshTrigger changes
  useEffect(() => {
    if (wishesRefreshTrigger > 0) {
      fetchWishes();
    }
  }, [wishesRefreshTrigger, fetchWishes]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchWishes();
    }, [fetchWishes])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLocation(), fetchWishes(), fetchBanners()]);
    setRefreshing(false);
  };

  // Handle banner press - track click and navigate
  const handleBannerPress = async (banner: any) => {
    try {
      await fetch(`${PROMOTIONS_BACKEND_URL}/api/wisher/banners/${banner.banner_id}/click`, { method: 'POST' });
    } catch (e) {}
    
    if (banner.link_type === 'shop') {
      router.push(`/shop/${banner.link_target}`);
    } else if (banner.link_type === 'product') {
      router.push(`/shop/product/${banner.link_target}`);
    }
  };

  const handleCompleteWish = async (wishId: string) => {
    Alert.alert(
      'Complete Wish',
      'Mark this wish as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await axios.put(
                `${BACKEND_URL}/api/wishes/${wishId}/complete`,
                {},
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              triggerWishesRefresh();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to complete wish');
            }
          },
        },
      ]
    );
  };

  const handleDeleteWish = async (wishId: string) => {
    Alert.alert(
      'Delete Wish',
      'Are you sure you want to delete this wish?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${BACKEND_URL}/api/wishes/${wishId}`,
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              triggerWishesRefresh();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete wish');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'accepted': return '#3B82F6';
      case 'in_progress': return '#8B5CF6';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getWishTypeIcon = (type: string) => {
    switch (type) {
      case 'delivery': return 'bicycle';
      case 'ride_request': return 'car';
      case 'commercial_ride': return 'bus';
      case 'medicine_delivery': return 'medkit';
      case 'domestic_help': return 'home';
      case 'construction': return 'construct';
      case 'home_maintenance': return 'hammer';
      case 'errands': return 'walk';
      case 'companionship': return 'people';
      case 'others': return 'ellipsis-horizontal';
      default: return 'help-circle';
    }
  };

  const activeWishes = wishes.filter(w => ['pending', 'accepted', 'in_progress'].includes(w.status));
  const displayWishes = activeWishes.slice(0, 3); // Max 3 wishes on home screen
  const hasMoreWishes = activeWishes.length > 3;

  // Get location from store if available
  const { userLocation } = useAppStore();
  const displayLocation = userLocation?.address || location;

  // Get greeting based on returning user status
  const userName = user?.name?.split(' ')[0] || 'User';
  const greeting = isReturningUser ? `Welcome back` : `Welcome`;

  // Banner Carousel Component - Redesigned for better UX
  const BANNER_WIDTH = SCREEN_WIDTH - 40; // Full width minus side margins
  const BANNER_HEIGHT = 140; // Slightly reduced height for better proportions
  
  const BannerCarousel = ({ bannerData, onBannerPress }: { bannerData: any[], onBannerPress: (banner: any) => void }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
      if (bannerData.length <= 1) return;
      
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          const next = (prev + 1) % bannerData.length;
          flatListRef.current?.scrollToIndex({ index: next, animated: true });
          return next;
        });
      }, 4000);
      
      return () => clearInterval(interval);
    }, [bannerData.length]);

    if (bannerData.length === 0) return null;

    const getItemLayout = (_: any, index: number) => ({
      length: BANNER_WIDTH,
      offset: BANNER_WIDTH * index,
      index,
    });

    return (
      <View style={styles.bannerCarouselContainer}>
        <FlatList
          ref={flatListRef}
          data={bannerData}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={BANNER_WIDTH}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={getItemLayout}
          contentContainerStyle={styles.bannerListContent}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH);
            setActiveIndex(index);
          }}
          keyExtractor={(item) => item.banner_id}
          renderItem={({ item, index }) => (
            <TouchableOpacity 
              style={[
                styles.bannerCard,
                { width: BANNER_WIDTH, height: BANNER_HEIGHT }
              ]}
              onPress={() => onBannerPress(item)}
              activeOpacity={0.95}
            >
              <Image 
                source={{ uri: item.image }} 
                style={styles.bannerImage}
                resizeMode="cover"
              />
              {/* Gradient Overlay for better text readability */}
              <View style={styles.bannerGradientOverlay} />
              
              {/* Content Container */}
              <View style={styles.bannerContentContainer}>
                {/* AD Badge - Top Left with proper spacing */}
                <View style={styles.bannerAdBadge}>
                  <Text style={styles.bannerAdText}>AD</Text>
                </View>
                
                {/* Text Content - Bottom */}
                <View style={styles.bannerTextContainer}>
                  <Text style={styles.bannerTitle} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle && (
                    <Text style={styles.bannerSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
        
        {/* Pagination Dots - Below banner with proper spacing */}
        {bannerData.length > 1 && (
          <View style={styles.bannerIndicators}>
            {bannerData.map((_: any, index: number) => (
              <View 
                key={index}
                style={[
                  styles.bannerDot,
                  activeIndex === index && styles.bannerDotActive
                ]}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerLeft}
          onPress={() => router.push('/account/profile')}
        >
          {/* User Avatar */}
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={20} color="#7C3AED" />
            </View>
          )}
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>{greeting}, <Text style={styles.userName}>{userName}</Text></Text>
            <TouchableOpacity style={styles.locationRow} onPress={(e) => {
              e.stopPropagation();
              router.push('/location-picker');
            }}>
              <Ionicons name="location" size={12} color="#7C3AED" />
              <Text style={styles.locationText} numberOfLines={1}>{displayLocation}</Text>
              <Ionicons name="chevron-down" size={12} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.wishboxButton}
          onPress={() => router.push('/wishbox')}
        >
          <View style={styles.wishboxIconContainer}>
            <Ionicons name="file-tray-full" size={22} color="#7C3AED" />
            {activeWishes.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeWishes.length}</Text>
              </View>
            )}
          </View>
          <Text style={styles.wishboxLabel}>Wish Box</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Promotional Banners Carousel */}
        {banners.length > 0 && (
          <BannerCarousel bannerData={banners} onBannerPress={handleBannerPress} />
        )}

        {/* Make a Wish Card */}
        <TouchableOpacity
          style={styles.makeWishCard}
          onPress={() => router.push('/wish/create')}
        >
          <View style={styles.makeWishIcon}>
            <Ionicons name="sparkles" size={32} color="#fff" />
          </View>
          <View style={styles.makeWishTextContainer}>
            <Text style={styles.makeWishTitle}>Make a Wish</Text>
            <Text style={styles.makeWishSubtitle}>Get help from local community</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          {[
            { type: 'delivery', label: 'Delivery', icon: 'bicycle' },
            { type: 'ride_request', label: 'Ride', icon: 'car' },
            { type: 'errands', label: 'Errands', icon: 'walk' },
            { type: 'household_chores', label: 'Chores', icon: 'home' },
          ].map((action) => (
            <TouchableOpacity
              key={action.type}
              style={styles.quickActionItem}
              onPress={() => router.push({ pathname: '/wish/create', params: { type: action.type } })}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name={action.icon as any} size={24} color="#7C3AED" />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Active Wishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Active Wishes</Text>
          {activeWishes.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/wishbox')}>
              <Text style={styles.seeAllText}>See All ({activeWishes.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color="#7C3AED" style={styles.loader} />
        ) : activeWishes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No active wishes</Text>
            <Text style={styles.emptyStateSubtext}>Make a wish to get started!</Text>
          </View>
        ) : (
          <View style={styles.wishesContainer}>
            {displayWishes.map((wish) => (
              <TouchableOpacity 
                key={wish.wish_id} 
                style={styles.wishCard}
                onPress={() => router.push(`/wish/${wish.wish_id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.wishCardMain}>
                  <View style={styles.wishCardIcon}>
                    <Ionicons name={getWishTypeIcon(wish.wish_type) as any} size={24} color="#7C3AED" />
                  </View>
                  <View style={styles.wishCardContent}>
                    <Text style={styles.wishCardTitle} numberOfLines={1}>{wish.title}</Text>
                    <View style={styles.wishCardMeta}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wish.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(wish.status) }]}>
                          {wish.status.replace('_', ' ')}
                        </Text>
                      </View>
                      <Text style={styles.remunerationText}>₹{wish.remuneration}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                </View>
                
                {/* Action Buttons */}
                <View style={styles.wishActions}>
                  <TouchableOpacity 
                    style={styles.wishActionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCompleteWish(wish.wish_id);
                    }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />
                    <Text style={styles.wishActionTextGreen}>Complete</Text>
                  </TouchableOpacity>
                  <View style={styles.actionDivider} />
                  <TouchableOpacity 
                    style={styles.wishActionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteWish(wish.wish_id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.wishActionTextRed}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
            
            {hasMoreWishes && (
              <TouchableOpacity 
                style={styles.viewMoreButton}
                onPress={() => router.push('/wishbox')}
              >
                <Text style={styles.viewMoreText}>View {activeWishes.length - 3} more wishes</Text>
                <Ionicons name="arrow-forward" size={16} color="#6366F1" />
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Swipe Hint */}
        <View style={styles.swipeHint}>
          <Ionicons name="swap-horizontal" size={16} color="#9CA3AF" />
          <Text style={styles.swipeHintText}>Swipe left or right to switch tabs</Text>
        </View>
        
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8D9F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  greetingContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6C757D',
  },
  userName: {
    fontWeight: '700',
    color: '#212529',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  locationText: {
    fontSize: 12,
    color: '#7C3AED',
    marginLeft: 4,
    marginRight: 2,
    maxWidth: 150,
  },
  wishboxButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishboxIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8D9F4',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wishboxLabel: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  makeWishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  makeWishIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  makeWishTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  makeWishTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  makeWishSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  seeAllText: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    alignItems: 'center',
    width: '23%',
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E8D9F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    color: '#6C757D',
    textAlign: 'center',
  },
  loader: {
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 8,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  wishesContainer: {
    marginTop: 4,
  },
  wishCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  wishCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  wishCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E8D9F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wishCardContent: {
    flex: 1,
    marginLeft: 10,
  },
  wishCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  wishCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  remunerationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
    marginLeft: 12,
  },
  wishActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  wishActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
  },
  wishActionTextGreen: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10B981',
    marginLeft: 6,
  },
  wishActionTextRed: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EF4444',
    marginLeft: 6,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
    marginRight: 6,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 12,
  },
  swipeHintText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  // Banner Carousel Styles - Redesigned
  bannerCarouselContainer: {
    marginTop: 12,
    marginBottom: 16,
  },
  bannerListContent: {
    paddingHorizontal: 20,
  },
  bannerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // Gradient from top and bottom for better visibility
    borderRadius: 16,
  },
  bannerContentContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12,
  },
  bannerAdBadge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bannerAdText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bannerTextContainer: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginHorizontal: -12,
    marginBottom: -12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  bannerIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  bannerDotActive: {
    width: 18,
    backgroundColor: '#7C3AED',
  },
});
