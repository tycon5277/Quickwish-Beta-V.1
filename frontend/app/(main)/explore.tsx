import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wishmarket.preview.emergentagent.com';

const { width } = Dimensions.get('window');

interface ExplorePost {
  post_id: string;
  title: string;
  content: string;
  post_type: string;
  image?: string;
  created_at: string;
  likes?: number;
  comments?: number;
  author?: string;
  badge?: string;
}

// Category filters for gamification feel
const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps', color: '#6366F1' },
  { id: 'milestone', label: '🏆 Milestones', icon: 'trophy', color: '#F59E0B' },
  { id: 'event', label: '📅 Events', icon: 'calendar', color: '#3B82F6' },
  { id: 'celebration', label: '🎉 Celebrations', icon: 'happy', color: '#EC4899' },
  { id: 'news', label: '📰 News', icon: 'newspaper', color: '#10B981' },
];

// Community stats for gamification
const COMMUNITY_STATS = {
  wishes_fulfilled: 1247,
  active_helpers: 89,
  happy_wishers: 456,
};

export default function ExploreScreen() {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [animatedValue] = useState(new Animated.Value(0));

  const fetchPosts = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/explore`);
      // Enhance posts with mock engagement data
      const enhancedPosts = response.data.map((post: ExplorePost) => ({
        ...post,
        likes: Math.floor(Math.random() * 50) + 5,
        comments: Math.floor(Math.random() * 15),
        author: getRandomAuthor(),
        badge: Math.random() > 0.7 ? getRandomBadge() : null,
      }));
      setPosts(enhancedPosts);
    } catch (error) {
      console.error('Error fetching explore posts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getRandomAuthor = () => {
    const authors = ['Community Team', 'Local Hero', 'QuickWish', 'Neighborhood Watch', 'Helper Network'];
    return authors[Math.floor(Math.random() * authors.length)];
  };

  const getRandomBadge = () => {
    const badges = ['🔥 Hot', '⭐ Featured', '💎 Premium', '🌟 Popular'];
    return badges[Math.floor(Math.random() * badges.length)];
  };

  const seedData = async () => {
    try {
      setIsLoading(true);
      await axios.post(`${BACKEND_URL}/api/seed`);
      await fetchPosts();
    } catch (error) {
      console.error('Error seeding data:', error);
    }
  };

  useEffect(() => {
    fetchPosts();
    // Animate stats on mount
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [fetchPosts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const getPostTypeConfig = (type: string) => {
    switch (type) {
      case 'milestone':
        return { icon: 'trophy', color: '#F59E0B', bg: '#FEF3C7', emoji: '🏆' };
      case 'event':
        return { icon: 'calendar', color: '#3B82F6', bg: '#DBEAFE', emoji: '📅' };
      case 'celebration':
        return { icon: 'happy', color: '#EC4899', bg: '#FCE7F3', emoji: '🎉' };
      case 'news':
        return { icon: 'newspaper', color: '#10B981', bg: '#D1FAE5', emoji: '📰' };
      default:
        return { icon: 'information-circle', color: '#6B7280', bg: '#F3F4F6', emoji: '📌' };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const filteredPosts = selectedCategory === 'all' 
    ? posts 
    : posts.filter(p => p.post_type === selectedCategory);

  const StatCard = ({ icon, value, label, color }: { icon: string; value: number; label: string; color: string }) => (
    <View style={[styles.statCard, { borderColor: color + '30' }]}>
      <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with gradient */}
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Explore</Text>
              <Text style={styles.headerSubtitle}>What's happening nearby</Text>
            </View>
            <TouchableOpacity style={styles.notificationButton}>
              <Ionicons name="notifications-outline" size={24} color="#fff" />
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>3</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Community Stats - Gamification */}
          <View style={styles.statsContainer}>
            <StatCard 
              icon="checkmark-done-circle" 
              value={COMMUNITY_STATS.wishes_fulfilled} 
              label="Wishes Fulfilled" 
              color="#10B981" 
            />
            <StatCard 
              icon="people" 
              value={COMMUNITY_STATS.active_helpers} 
              label="Active Helpers" 
              color="#F59E0B" 
            />
            <StatCard 
              icon="heart" 
              value={COMMUNITY_STATS.happy_wishers} 
              label="Happy Wishers" 
              color="#EC4899" 
            />
          </View>
        </LinearGradient>
      </View>

      {/* Category Filter Pills */}
      <View style={styles.categoryWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.categoryContainer}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryPill,
                selectedCategory === cat.id && styles.categoryPillSelected,
                selectedCategory === cat.id && { backgroundColor: cat.color }
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={[
                styles.categoryPillText,
                selectedCategory === cat.id && styles.categoryPillTextSelected
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
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
            <Text style={styles.loaderText}>Loading amazing stories...</Text>
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="compass-outline" size={48} color="#6366F1" />
            </View>
            <Text style={styles.emptyStateTitle}>No updates yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Community highlights, events, and stories will appear here
            </Text>
            <TouchableOpacity style={styles.seedButton} onPress={seedData}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.seedButtonText}>Discover Sample Content</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Featured Section */}
            {selectedCategory === 'all' && posts.filter(p => p.badge).length > 0 && (
              <View style={styles.featuredSection}>
                <Text style={styles.sectionTitle}>✨ Featured Stories</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {posts.filter(p => p.badge).slice(0, 3).map((post) => {
                    const config = getPostTypeConfig(post.post_type);
                    return (
                      <TouchableOpacity key={`featured-${post.post_id}`} style={styles.featuredCard}>
                        <LinearGradient
                          colors={[config.color, config.color + 'CC']}
                          style={styles.featuredGradient}
                        >
                          <Text style={styles.featuredBadge}>{post.badge}</Text>
                          <Text style={styles.featuredTitle} numberOfLines={2}>{post.title}</Text>
                          <View style={styles.featuredMeta}>
                            <Ionicons name={config.icon as any} size={14} color="#fff" />
                            <Text style={styles.featuredType}>
                              {post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)}
                            </Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Posts List */}
            <View style={styles.postsSection}>
              <Text style={styles.sectionTitle}>📋 Latest Updates</Text>
              {filteredPosts.map((post) => {
                const config = getPostTypeConfig(post.post_type);
                const isLiked = likedPosts.has(post.post_id);
                
                return (
                  <TouchableOpacity 
                    key={post.post_id} 
                    style={styles.postCard}
                    activeOpacity={0.9}
                  >
                    {/* Post Header */}
                    <View style={styles.postHeader}>
                      <View style={[styles.postTypeIcon, { backgroundColor: config.bg }]}>
                        <Text style={styles.postTypeEmoji}>{config.emoji}</Text>
                      </View>
                      <View style={styles.postMeta}>
                        <View style={styles.postMetaTop}>
                          <Text style={[styles.postType, { color: config.color }]}>
                            {post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)}
                          </Text>
                          {post.badge && (
                            <View style={[styles.postBadge, { backgroundColor: config.color + '20' }]}>
                              <Text style={[styles.postBadgeText, { color: config.color }]}>{post.badge}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.postAuthor}>by {post.author}</Text>
                      </View>
                      <Text style={styles.postTime}>{formatDate(post.created_at)}</Text>
                    </View>

                    {/* Post Content */}
                    <Text style={styles.postTitle}>{post.title}</Text>
                    <Text style={styles.postContent} numberOfLines={3}>{post.content}</Text>

                    {/* Engagement Bar */}
                    <View style={styles.engagementBar}>
                      <TouchableOpacity 
                        style={[styles.engagementButton, isLiked && styles.engagementButtonActive]}
                        onPress={() => toggleLike(post.post_id)}
                      >
                        <Ionicons 
                          name={isLiked ? "heart" : "heart-outline"} 
                          size={20} 
                          color={isLiked ? "#EF4444" : "#6B7280"} 
                        />
                        <Text style={[styles.engagementText, isLiked && styles.engagementTextActive]}>
                          {(post.likes || 0) + (isLiked ? 1 : 0)}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.engagementButton}>
                        <Ionicons name="chatbubble-outline" size={18} color="#6B7280" />
                        <Text style={styles.engagementText}>{post.comments || 0}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.engagementButton}>
                        <Ionicons name="share-social-outline" size={18} color="#6B7280" />
                        <Text style={styles.engagementText}>Share</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.bookmarkButton}>
                        <Ionicons name="bookmark-outline" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        
        {/* Bottom spacing for tab bar */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Action Button for posting */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6']}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
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
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  categoryWrapper: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryPillSelected: {
    backgroundColor: '#6366F1',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  categoryPillTextSelected: {
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
    marginTop: 24,
    backgroundColor: '#6366F1',
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
  featuredSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  featuredCard: {
    width: width * 0.65,
    height: 140,
    marginLeft: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredGradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    overflow: 'hidden',
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 22,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featuredType: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  postsSection: {
    paddingTop: 16,
  },
  postCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postTypeEmoji: {
    fontSize: 22,
  },
  postMeta: {
    flex: 1,
    marginLeft: 12,
  },
  postMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postType: {
    fontSize: 14,
    fontWeight: '700',
  },
  postBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  postBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  postAuthor: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  postTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  postTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    lineHeight: 24,
  },
  postContent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 12,
  },
  engagementBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 16,
  },
  engagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  engagementButtonActive: {},
  engagementText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  engagementTextActive: {
    color: '#EF4444',
  },
  bookmarkButton: {
    marginLeft: 'auto',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGradient: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPadding: {
    height: 100,
  },
});
