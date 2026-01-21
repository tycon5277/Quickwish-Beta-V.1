import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from './_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-2.preview.emergentagent.com';

interface Wish {
  wish_id: string;
  wish_type: string;
  title: string;
  description?: string;
  status: string;
  remuneration: number;
  is_immediate: boolean;
  scheduled_time?: string;
  location: {
    address: string;
  };
  created_at: string;
}

export default function WishboxScreen() {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

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

  useEffect(() => {
    fetchWishes();
  }, [fetchWishes]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWishes();
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredWishes = wishes.filter(wish => {
    if (filter === 'active') return ['pending', 'accepted', 'in_progress'].includes(wish.status);
    if (filter === 'completed') return ['completed', 'cancelled'].includes(wish.status);
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wishbox</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/wish/create')}
        >
          <Ionicons name="add" size={24} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'active', 'completed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#6366F1" style={styles.loader} />
        ) : filteredWishes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No wishes yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Make your first wish and let the community help you!
            </Text>
            <TouchableOpacity
              style={styles.makeWishButton}
              onPress={() => router.push('/wish/create')}
            >
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={styles.makeWishButtonText}>Make a Wish</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredWishes.map((wish) => (
            <TouchableOpacity 
              key={wish.wish_id} 
              style={styles.wishCard}
              onPress={() => router.push(`/wish/${wish.wish_id}?from=wishbox`)}
            >
              <View style={styles.wishHeader}>
                <View style={styles.wishTypeIcon}>
                  <Ionicons name={getWishTypeIcon(wish.wish_type) as any} size={24} color="#6366F1" />
                </View>
                <View style={styles.wishHeaderInfo}>
                  <Text style={styles.wishType}>
                    {wish.wish_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.wishDate}>{formatDate(wish.created_at)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(wish.status) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(wish.status) }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(wish.status) }]}>
                    {wish.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.wishTitle}>{wish.title}</Text>
              {wish.description && (
                <Text style={styles.wishDescription} numberOfLines={2}>{wish.description}</Text>
              )}
              
              <View style={styles.wishFooter}>
                <View style={styles.wishMeta}>
                  <Ionicons name="location-outline" size={16} color="#6B7280" />
                  <Text style={styles.wishMetaText} numberOfLines={1}>
                    {wish.location?.address || 'Location set'}
                  </Text>
                </View>
                <View style={styles.wishRemuneration}>
                  <Text style={styles.remunerationLabel}>Offer</Text>
                  <Text style={styles.remunerationValue}>₹{wish.remuneration}</Text>
                </View>
              </View>
              
              {wish.is_immediate ? (
                <View style={styles.urgentBadge}>
                  <Ionicons name="flash" size={14} color="#F59E0B" />
                  <Text style={styles.urgentText}>Immediate</Text>
                </View>
              ) : wish.scheduled_time && (
                <View style={styles.scheduledBadge}>
                  <Ionicons name="calendar-outline" size={14} color="#6366F1" />
                  <Text style={styles.scheduledText}>Scheduled: {formatDate(wish.scheduled_time)}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
        <View style={styles.bottomPadding} />
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  filterTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  filterTabActive: {
    backgroundColor: '#6366F1',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  makeWishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  makeWishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  wishCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  wishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  wishTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wishHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  wishType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  wishDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  wishTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  wishDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  wishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  wishMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  wishMetaText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
  },
  wishRemuneration: {
    alignItems: 'flex-end',
  },
  remunerationLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  remunerationValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  urgentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 4,
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  scheduledText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6366F1',
    marginLeft: 4,
  },
  bottomPadding: {
    height: 20,
  },
});
