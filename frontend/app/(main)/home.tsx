import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
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
                   'https://quickwish-1.preview.emergentagent.com';

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
  const { wishesRefreshTrigger, setUserLocation, locationPermissionChecked, setLocationPermissionChecked } = useAppStore();
  const [location, setLocation] = useState<string>('Fetching location...');
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation('Location not enabled');
        // Check if we need to show permission screen
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
  }, []);

  // Refresh when wishesRefreshTrigger changes (after creating a wish)
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
    await Promise.all([fetchLocation(), fetchWishes()]);
    setRefreshing(false);
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
      case 'medicine_delivery': return 'medkit';
      case 'household_chores': return 'home';
      case 'errands': return 'walk';
      case 'domestic_help': return 'hand-left';
      case 'construction': return 'construct';
      case 'companionship': return 'people';
      default: return 'help-circle';
    }
  };

  const activeWishes = wishes.filter(w => ['pending', 'accepted', 'in_progress'].includes(w.status));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'User'}</Text>
          <TouchableOpacity style={styles.locationRow} onPress={fetchLocation}>
            <Ionicons name="location" size={14} color="#6B7280" />
            <Text style={styles.locationText} numberOfLines={1}>{location}</Text>
            <Ionicons name="refresh-outline" size={12} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={styles.wishboxButton}
          onPress={() => router.push('/wishbox')}
        >
          <Ionicons name="gift" size={24} color="#6366F1" />
          {activeWishes.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeWishes.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
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
                <Ionicons name={action.icon as any} size={24} color="#6366F1" />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Active Wishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Wishes</Text>
          {activeWishes.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/wishbox')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color="#6366F1" style={styles.loader} />
        ) : activeWishes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No active wishes</Text>
            <Text style={styles.emptyStateSubtext}>Make a wish to get started!</Text>
          </View>
        ) : (
          activeWishes.slice(0, 3).map((wish) => (
            <TouchableOpacity key={wish.wish_id} style={styles.wishCard}>
              <View style={styles.wishCardIcon}>
                <Ionicons name={getWishTypeIcon(wish.wish_type) as any} size={24} color="#6366F1" />
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
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
    marginRight: 4,
    maxWidth: 180,
  },
  wishboxButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
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
    backgroundColor: '#6366F1',
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
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: '#6366F1',
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
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    color: '#6B7280',
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
  wishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  wishCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wishCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  wishCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  wishCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  remunerationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 12,
  },
});
