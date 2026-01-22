import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-3.preview.emergentagent.com';

interface ChatRoom {
  room_id: string;
  wish_id: string;
  agent_id: string;
  status: string;
  unread_count?: number;
  wish?: {
    title: string;
    wish_type: string;
    remuneration: number;
  };
  last_message?: {
    content: string;
    created_at: string;
    sender_type?: string;
  };
  agent?: {
    name: string;
    avatar?: string;
    rating: number;
    completed_wishes: number;
    is_verified: boolean;
    response_time: string;
  };
}

// Filter tabs
const FILTERS = [
  { id: 'all', label: 'All', icon: 'chatbubbles' },
  { id: 'active', label: 'Active', icon: 'flash' },
  { id: 'approved', label: 'Approved', icon: 'checkmark-circle' },
  { id: 'completed', label: 'Completed', icon: 'trophy' },
];

export default function ChatScreen() {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const fetchChatRooms = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/rooms`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      // Enhance with mock agent data for UI demonstration
      const enhancedRooms = response.data.map((room: ChatRoom) => ({
        ...room,
        unread_count: Math.floor(Math.random() * 5),
        agent: {
          name: getRandomAgentName(),
          rating: (4 + Math.random()).toFixed(1),
          completed_wishes: Math.floor(Math.random() * 100) + 10,
          is_verified: Math.random() > 0.3,
          response_time: getRandomResponseTime(),
        }
      }));
      setChatRooms(enhancedRooms);
    } catch (error) {
      console.error('Error fetching chat rooms:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  const getRandomAgentName = () => {
    const names = ['Rahul S.', 'Priya M.', 'Amit K.', 'Sneha R.', 'Vikram P.', 'Anjali D.'];
    return names[Math.floor(Math.random() * names.length)];
  };

  const getRandomResponseTime = () => {
    const times = ['Usually responds in 5 mins', 'Very responsive', 'Responds within 1 hour', 'Quick responder'];
    return times[Math.floor(Math.random() * times.length)];
  };

  useEffect(() => {
    fetchChatRooms();
    const interval = setInterval(fetchChatRooms, 10000);
    return () => clearInterval(interval);
  }, [fetchChatRooms]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatRooms();
    setRefreshing(false);
  };

  const seedChatData = async () => {
    if (!sessionToken) return;
    try {
      setIsLoading(true);
      await axios.post(`${BACKEND_URL}/api/seed/chats`, {}, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      await fetchChatRooms();
    } catch (error) {
      console.error('Error seeding chat data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return { color: '#3B82F6', bg: '#DBEAFE', label: 'Negotiating', icon: 'chatbubble-ellipses' };
      case 'approved':
        return { color: '#10B981', bg: '#D1FAE5', label: 'Approved', icon: 'checkmark-circle' };
      case 'in_progress':
        return { color: '#F59E0B', bg: '#FEF3C7', label: 'In Progress', icon: 'timer' };
      case 'completed':
        return { color: '#8B5CF6', bg: '#EDE9FE', label: 'Completed', icon: 'trophy' };
      case 'cancelled':
        return { color: '#EF4444', bg: '#FEE2E2', label: 'Cancelled', icon: 'close-circle' };
      default:
        return { color: '#6B7280', bg: '#F3F4F6', label: status, icon: 'ellipse' };
    }
  };

  const getWishTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      delivery: 'bicycle',
      ride_request: 'car',
      commercial_ride: 'bus',
      medicine_delivery: 'medkit',
      domestic_help: 'home',
      construction: 'construct',
      home_maintenance: 'hammer',
      errands: 'walk',
      companionship: 'people',
    };
    return icons[type] || 'help-circle';
  };

  // Filter and search logic
  const filteredRooms = chatRooms.filter(room => {
    const matchesFilter = selectedFilter === 'all' || room.status === selectedFilter;
    const matchesSearch = !searchQuery || 
      room.wish?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.agent?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalUnread = chatRooms.reduce((sum, room) => sum + (room.unread_count || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Messages</Text>
              <Text style={styles.headerSubtitle}>
                {chatRooms.length > 0 
                  ? `${chatRooms.length} conversation${chatRooms.length > 1 ? 's' : ''}${totalUnread > 0 ? ` • ${totalUnread} unread` : ''}`
                  : 'Chat with fulfillment agents'
                }
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.searchButton}
              onPress={() => setShowSearch(!showSearch)}
            >
              <Ionicons name={showSearch ? "close" : "search"} size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          {showSearch && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by wish or agent name..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map((filter) => {
            const count = filter.id === 'all' 
              ? chatRooms.length 
              : chatRooms.filter(r => r.status === filter.id).length;
            const isSelected = selectedFilter === filter.id;
            
            return (
              <TouchableOpacity
                key={filter.id}
                style={[styles.filterTab, isSelected && styles.filterTabSelected]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Ionicons 
                  name={filter.icon as any} 
                  size={16} 
                  color={isSelected ? '#6366F1' : '#6B7280'} 
                />
                <Text style={[styles.filterTabText, isSelected && styles.filterTabTextSelected]}>
                  {filter.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.filterBadge, isSelected && styles.filterBadgeSelected]}>
                    <Text style={[styles.filterBadgeText, isSelected && styles.filterBadgeTextSelected]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loaderText}>Loading conversations...</Text>
          </View>
        ) : filteredRooms.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#6366F1" />
            </View>
            <Text style={styles.emptyStateTitle}>
              {searchQuery ? 'No results found' : 'No conversations yet'}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              {searchQuery 
                ? 'Try a different search term'
                : 'When a fulfillment agent accepts your wish, you can chat with them here'
              }
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={styles.seedButton} onPress={seedChatData}>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.seedButtonText}>Load Demo Chats</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredRooms.map((room) => {
            const statusConfig = getStatusConfig(room.status);
            const hasUnread = (room.unread_count || 0) > 0;
            
            return (
              <TouchableOpacity
                key={room.room_id}
                style={[styles.chatCard, hasUnread && styles.chatCardUnread]}
                onPress={() => router.push(`/chat/${room.room_id}`)}
                activeOpacity={0.7}
              >
                {/* Agent Avatar & Status */}
                <View style={styles.avatarSection}>
                  <View style={styles.avatarContainer}>
                    <LinearGradient
                      colors={['#6366F1', '#8B5CF6']}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {room.agent?.name?.charAt(0) || 'A'}
                      </Text>
                    </LinearGradient>
                    {room.agent?.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={[styles.onlineIndicator, { backgroundColor: statusConfig.color }]} />
                </View>

                {/* Chat Content */}
                <View style={styles.chatContent}>
                  {/* Top Row: Agent Name & Time */}
                  <View style={styles.chatTopRow}>
                    <View style={styles.agentInfo}>
                      <Text style={[styles.agentName, hasUnread && styles.agentNameUnread]}>
                        {room.agent?.name || 'Agent'}
                      </Text>
                      {room.agent?.rating && (
                        <View style={styles.ratingBadge}>
                          <Ionicons name="star" size={10} color="#F59E0B" />
                          <Text style={styles.ratingText}>{room.agent.rating}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.timeText}>
                      {room.last_message ? formatTime(room.last_message.created_at) : ''}
                    </Text>
                  </View>

                  {/* Wish Info */}
                  <View style={styles.wishRow}>
                    <View style={[styles.wishTypeIcon, { backgroundColor: statusConfig.bg }]}>
                      <Ionicons 
                        name={getWishTypeIcon(room.wish?.wish_type || '') as any} 
                        size={12} 
                        color={statusConfig.color} 
                      />
                    </View>
                    <Text style={styles.wishTitle} numberOfLines={1}>
                      {room.wish?.title || 'Wish'}
                    </Text>
                  </View>

                  {/* Last Message Preview */}
                  <Text 
                    style={[styles.messagePreview, hasUnread && styles.messagePreviewUnread]} 
                    numberOfLines={1}
                  >
                    {room.last_message?.sender_type === 'wisher' ? 'You: ' : ''}
                    {room.last_message?.content || 'Start a conversation'}
                  </Text>

                  {/* Bottom Row: Status & Price */}
                  <View style={styles.chatBottomRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                      <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>
                        {statusConfig.label}
                      </Text>
                    </View>
                    {room.wish?.remuneration && (
                      <Text style={styles.priceText}>₹{room.wish.remuneration}</Text>
                    )}
                  </View>
                </View>

                {/* Unread Badge */}
                {hasUnread && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{room.unread_count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
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
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 10,
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterScroll: {
    paddingHorizontal: 16,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterTabSelected: {
    backgroundColor: '#EEF2FF',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  filterTabTextSelected: {
    color: '#6366F1',
  },
  filterBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterBadgeSelected: {
    backgroundColor: '#6366F1',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterBadgeTextSelected: {
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
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  seedButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  chatCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  avatarSection: {
    position: 'relative',
    marginRight: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatContent: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  agentNameUnread: {
    fontWeight: '700',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 2,
  },
  timeText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  wishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  wishTypeIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  wishTitle: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  messagePreview: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  messagePreviewUnread: {
    color: '#4B5563',
    fontWeight: '500',
  },
  chatBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  unreadBadge: {
    backgroundColor: '#6366F1',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  bottomPadding: {
    height: 100,
  },
});
