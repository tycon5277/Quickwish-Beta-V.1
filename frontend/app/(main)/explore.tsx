import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Image, Dimensions, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Creator Types
type CreatorType = 'agent' | 'vendor' | 'promoter';

interface Story {
  id: string;
  user_name: string;
  user_image: string;
  creator_type: CreatorType;
  category: string;
  is_live?: boolean;
  has_unseen?: boolean;
  image: string;
  text?: string;
}

interface FeedPost {
  id: string;
  creator_type: CreatorType;
  creator_name: string;
  creator_image: string;
  creator_category: string;
  is_verified: boolean;
  images: string[];
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  tags?: string[];
  milestone?: string;
  promo_link?: string;
  rating?: number;
  completedJobs?: number;
}

// Sample Stories Data
const STORIES: Story[] = [
  { id: '1', user_name: 'Ramesh', user_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100', creator_type: 'agent', category: 'Bike Delivery', has_unseen: true, image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400', text: '🏆 1000th Delivery!' },
  { id: '2', user_name: 'GreenMart', user_image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=100', creator_type: 'vendor', category: 'Grocery', has_unseen: true, image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400', text: '🎉 50% Off Today!' },
  { id: '3', user_name: 'TravelWithMe', user_image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100', creator_type: 'promoter', category: 'Travel', has_unseen: true, image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400', text: '🚌 Weekend Trip Open!' },
  { id: '4', user_name: 'CleanPro', user_image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100', creator_type: 'agent', category: 'Home Cleaner', has_unseen: false, image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400', text: 'Deep Clean Special' },
  { id: '5', user_name: 'BiryaniKing', user_image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=100', creator_type: 'vendor', category: 'Restaurant', has_unseen: true, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', text: '🍗 New Menu!' },
  { id: '6', user_name: 'GardenGuru', user_image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100', creator_type: 'agent', category: 'Gardener', has_unseen: false, image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400', text: 'Garden Tips' },
  { id: '7', user_name: 'FitLife', user_image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=100', creator_type: 'promoter', category: 'Fitness', is_live: true, has_unseen: true, image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400', text: '🔴 LIVE Workout' },
];

// Sample Feed Posts
const FEED_POSTS: FeedPost[] = [
  {
    id: 'p1',
    creator_type: 'agent',
    creator_name: 'Ramesh Kumar',
    creator_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    creator_category: 'Bike Delivery',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600', 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=600'],
    caption: 'Just completed my 1000th delivery! 🎉 Thank you all for trusting me with your packages. From groceries to medicines, I\'ve delivered it all with care.',
    likes: 234,
    comments: 45,
    timestamp: '2h ago',
    tags: ['#1000Deliveries', '#LocalHero'],
    milestone: '1000 Deliveries',
    rating: 4.9,
    completedJobs: 1000,
  },
  {
    id: 'p2',
    creator_type: 'vendor',
    creator_name: 'Fresh Mart Grocery',
    creator_image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=100',
    creator_category: 'Grocery Store',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=600'],
    caption: '🍎 Fresh arrivals! Organic fruits and vegetables directly from local farms. Order now and get 20% off!',
    likes: 156,
    comments: 23,
    timestamp: '4h ago',
    tags: ['#Organic', '#FreshProduce'],
    rating: 4.7,
  },
  {
    id: 'p3',
    creator_type: 'promoter',
    creator_name: 'Weekend Wanderers',
    creator_image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
    creator_category: 'Travel Organizer',
    is_verified: false,
    images: ['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600', 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600', 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=600'],
    caption: '🚌 Weekend Trip Alert! This Saturday we\'re heading to Coorg! Mini bus trip with 12 seats available. Pickup from city center, breakfast included!',
    likes: 89,
    comments: 34,
    timestamp: '6h ago',
    tags: ['#WeekendTrip', '#Coorg'],
    promo_link: 'Book Now',
  },
  {
    id: 'p4',
    creator_type: 'agent',
    creator_name: 'SparkleClean Services',
    creator_image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    creator_category: 'Home Cleaning',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600'],
    caption: 'Transform your space! ✨ Professional deep cleaning services now available. Book your slot today!',
    likes: 67,
    comments: 12,
    timestamp: '8h ago',
    rating: 4.8,
    completedJobs: 245,
  },
  {
    id: 'p5',
    creator_type: 'promoter',
    creator_name: 'FitLife Studios',
    creator_image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=100',
    creator_category: 'Fitness Coach',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600'],
    caption: '💪 New Year, New You! Join our 30-day transformation challenge. Personal training at your doorstep!',
    likes: 198,
    comments: 56,
    timestamp: '1d ago',
    promo_link: 'Join Challenge',
  },
];

// Creator type configurations
const CREATOR_CONFIG: Record<CreatorType, { label: string; color: string; bgColor: string; icon: string; gradient: string[] }> = {
  agent: { label: 'Agent', color: '#10B981', bgColor: '#D1FAE5', icon: 'flash', gradient: ['#10B981', '#059669'] },
  vendor: { label: 'Vendor', color: '#3B82F6', bgColor: '#DBEAFE', icon: 'storefront', gradient: ['#3B82F6', '#2563EB'] },
  promoter: { label: 'Promoter', color: '#8B5CF6', bgColor: '#EDE9FE', icon: 'megaphone', gradient: ['#8B5CF6', '#7C3AED'] },
};

// Search filter categories
const SEARCH_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'Agents' },
  { id: 'vendor', label: 'Vendors' },
  { id: 'promoter', label: 'Promoters' },
];

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [posts] = useState<FeedPost[]>(FEED_POSTS);
  const [stories] = useState<Story[]>(STORIES);
  const [refreshing, setRefreshing] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<Record<string, number>>({});
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
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

  const nextImage = (postId: string, totalImages: number) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [postId]: ((prev[postId] || 0) + 1) % totalImages
    }));
  };

  const getFilteredSearchResults = () => {
    let filtered = posts;
    if (searchQuery.trim()) {
      filtered = filtered.filter(p => 
        p.creator_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.creator_category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (searchCategory !== 'all') {
      filtered = filtered.filter(p => p.creator_type === searchCategory);
    }
    return filtered;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Explore</Text>
          <View style={styles.headerBadge}>
            <Ionicons name="sparkles" size={12} color="#10B981" />
          </View>
        </View>
        <TouchableOpacity 
          style={styles.searchButton}
          onPress={() => setShowSearch(true)}
        >
          <Ionicons name="search" size={20} color="#6B7280" />
          <Text style={styles.searchPlaceholder}>Search creators...</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Stories Section */}
        <View style={styles.storiesSection}>
          <Text style={styles.sectionLabel}>HIGHLIGHTS</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesContainer}
          >
            {stories.map((story) => {
              const config = CREATOR_CONFIG[story.creator_type];
              return (
                <TouchableOpacity 
                  key={story.id} 
                  style={styles.storyItem}
                  onPress={() => setSelectedStory(story)}
                >
                  <LinearGradient
                    colors={story.has_unseen ? config.gradient as any : ['#E5E7EB', '#D1D5DB']}
                    style={styles.storyRing}
                  >
                    <View style={styles.storyAvatarWrapper}>
                      <Image source={{ uri: story.user_image }} style={styles.storyAvatar} />
                    </View>
                  </LinearGradient>
                  {story.is_live && (
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  )}
                  <Text style={styles.storyName} numberOfLines={1}>{story.user_name}</Text>
                  <Text style={styles.storyCategory} numberOfLines={1}>{story.category}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Feed Section */}
        <View style={styles.feedSection}>
          <Text style={styles.sectionLabel}>DISCOVER</Text>
          
          {posts.map((post) => {
            const config = CREATOR_CONFIG[post.creator_type];
            const isLiked = likedPosts.has(post.id);
            const currentImg = currentImageIndex[post.id] || 0;

            return (
              <View key={post.id} style={styles.postCard}>
                {/* Post Image with Overlay */}
                <TouchableOpacity 
                  style={styles.postImageContainer}
                  onPress={() => post.images.length > 1 && nextImage(post.id, post.images.length)}
                  activeOpacity={0.95}
                >
                  <Image 
                    source={{ uri: post.images[currentImg] }} 
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                  
                  {/* Gradient Overlay */}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={styles.imageOverlay}
                  >
                    {/* Creator Info on Image */}
                    <View style={styles.creatorOverlay}>
                      <View style={styles.creatorRow}>
                        <Image source={{ uri: post.creator_image }} style={styles.creatorAvatar} />
                        <View style={styles.creatorInfo}>
                          <View style={styles.creatorNameRow}>
                            <Text style={styles.creatorName}>{post.creator_name}</Text>
                            {post.is_verified && (
                              <View style={styles.verifiedBadge}>
                                <Ionicons name="checkmark" size={10} color="#fff" />
                              </View>
                            )}
                          </View>
                          <View style={styles.creatorMeta}>
                            <View style={[styles.typeBadge, { backgroundColor: config.color }]}>
                              <Ionicons name={config.icon as any} size={10} color="#fff" />
                              <Text style={styles.typeBadgeText}>{config.label}</Text>
                            </View>
                            <Text style={styles.categoryText}>{post.creator_category}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Stats Row */}
                      {(post.rating || post.completedJobs) && (
                        <View style={styles.statsRow}>
                          {post.rating && (
                            <View style={styles.statItem}>
                              <Ionicons name="star" size={14} color="#F59E0B" />
                              <Text style={styles.statValue}>{post.rating}</Text>
                            </View>
                          )}
                          {post.completedJobs && (
                            <View style={styles.statItem}>
                              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                              <Text style={styles.statValue}>{post.completedJobs} done</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </LinearGradient>

                  {/* Milestone Badge */}
                  {post.milestone && (
                    <View style={styles.milestoneBadge}>
                      <Ionicons name="trophy" size={14} color="#F59E0B" />
                      <Text style={styles.milestoneText}>{post.milestone}</Text>
                    </View>
                  )}

                  {/* Image Indicators */}
                  {post.images.length > 1 && (
                    <View style={styles.imageIndicators}>
                      {post.images.map((_, idx) => (
                        <View 
                          key={idx}
                          style={[styles.imageIndicator, currentImg === idx && styles.imageIndicatorActive]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>

                {/* Post Content */}
                <View style={styles.postContent}>
                  <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text>
                  
                  {/* Tags */}
                  {post.tags && (
                    <View style={styles.tagsRow}>
                      {post.tags.slice(0, 2).map((tag, idx) => (
                        <Text key={idx} style={[styles.tag, { color: config.color }]}>{tag}</Text>
                      ))}
                    </View>
                  )}

                  {/* Promo Button */}
                  {post.promo_link && (
                    <TouchableOpacity style={[styles.promoButton, { backgroundColor: config.color }]}>
                      <Text style={styles.promoButtonText}>{post.promo_link}</Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}

                  {/* Action Row */}
                  <View style={styles.actionRow}>
                    <View style={styles.actionLeft}>
                      <TouchableOpacity 
                        style={styles.actionItem}
                        onPress={() => toggleLike(post.id)}
                      >
                        <Ionicons 
                          name={isLiked ? "heart" : "heart-outline"} 
                          size={22} 
                          color={isLiked ? "#EF4444" : "#6B7280"} 
                        />
                        <Text style={[styles.actionText, isLiked && { color: '#EF4444' }]}>
                          {post.likes + (isLiked ? 1 : 0)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionItem}>
                        <Ionicons name="chatbubble-outline" size={20} color="#6B7280" />
                        <Text style={styles.actionText}>{post.comments}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionItem}>
                        <Ionicons name="share-outline" size={20} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.timestamp}>{post.timestamp}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Story Viewer Modal */}
      <Modal visible={!!selectedStory} animationType="fade" transparent>
        {selectedStory && (
          <View style={styles.storyModal}>
            <Image 
              source={{ uri: selectedStory.image }} 
              style={styles.storyFullImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.6)']}
              style={styles.storyOverlay}
            >
              {/* Story Header */}
              <View style={[styles.storyHeader, { paddingTop: insets.top + 10 }]}>
                <View style={styles.storyProgress}>
                  <View style={styles.storyProgressFill} />
                </View>
                <View style={styles.storyHeaderContent}>
                  <View style={styles.storyUserInfo}>
                    <Image source={{ uri: selectedStory.user_image }} style={styles.storyUserAvatar} />
                    <View>
                      <Text style={styles.storyUsername}>{selectedStory.user_name}</Text>
                      <Text style={styles.storyUserCategory}>{selectedStory.category}</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.storyCloseButton}
                    onPress={() => setSelectedStory(null)}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Story Text */}
              {selectedStory.text && (
                <View style={styles.storyTextContainer}>
                  <Text style={styles.storyText}>{selectedStory.text}</Text>
                </View>
              )}

              {/* Story Footer */}
              <View style={[styles.storyFooter, { paddingBottom: insets.bottom + 20 }]}>
                <TouchableOpacity style={styles.storyActionBtn}>
                  <Ionicons name="heart-outline" size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.storyActionBtn}>
                  <Ionicons name="paper-plane-outline" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}
      </Modal>

      {/* Search Modal */}
      <Modal visible={showSearch} animationType="slide">
        <SafeAreaView style={styles.searchModal}>
          {/* Search Header */}
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={() => setShowSearch(false)}>
              <Ionicons name="arrow-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search creators, services..."
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
          </View>

          {/* Category Filter (Only in Search) */}
          <View style={styles.searchCategoryRow}>
            {SEARCH_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.searchCategoryPill, searchCategory === cat.id && styles.searchCategoryPillActive]}
                onPress={() => setSearchCategory(cat.id)}
              >
                <Text style={[styles.searchCategoryText, searchCategory === cat.id && styles.searchCategoryTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search Results */}
          <ScrollView style={styles.searchResults}>
            {getFilteredSearchResults().map((post) => {
              const config = CREATOR_CONFIG[post.creator_type];
              return (
                <TouchableOpacity key={post.id} style={styles.searchResultItem}>
                  <Image source={{ uri: post.creator_image }} style={styles.searchResultAvatar} />
                  <View style={styles.searchResultInfo}>
                    <View style={styles.searchResultNameRow}>
                      <Text style={styles.searchResultName}>{post.creator_name}</Text>
                      {post.is_verified && (
                        <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
                      )}
                    </View>
                    <View style={styles.searchResultMeta}>
                      <View style={[styles.searchResultBadge, { backgroundColor: config.bgColor }]}>
                        <Text style={[styles.searchResultBadgeText, { color: config.color }]}>{config.label}</Text>
                      </View>
                      <Text style={styles.searchResultCategory}>{post.creator_category}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                </TouchableOpacity>
              );
            })}
            
            {getFilteredSearchResults().length === 0 && searchQuery.length > 0 && (
              <View style={styles.noResults}>
                <Ionicons name="search" size={48} color="#D1D5DB" />
                <Text style={styles.noResultsText}>No results found</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1F2937',
  },
  headerBadge: {
    marginLeft: 8,
    backgroundColor: '#D1FAE5',
    padding: 4,
    borderRadius: 8,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  
  // Section Labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  
  // Stories Section
  storiesSection: {
    backgroundColor: '#fff',
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 8,
  },
  storiesContainer: {
    paddingHorizontal: 12,
  },
  storyItem: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 72,
  },
  storyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 3,
  },
  storyAvatarWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: '#fff',
    padding: 2,
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  liveBadge: {
    position: 'absolute',
    top: 48,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  liveBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
  },
  storyName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 6,
    textAlign: 'center',
  },
  storyCategory: {
    fontSize: 9,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  
  // Feed Section
  feedSection: {
    paddingTop: 16,
  },
  postCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  postImageContainer: {
    width: '100%',
    height: 280,
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 16,
  },
  creatorOverlay: {},
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  creatorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  verifiedBadge: {
    backgroundColor: '#3B82F6',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  categoryText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  milestoneBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  milestoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },
  imageIndicators: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  imageIndicator: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  imageIndicatorActive: {
    backgroundColor: '#fff',
  },
  
  // Post Content
  postContent: {
    padding: 16,
  },
  caption: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  tag: {
    fontSize: 13,
    fontWeight: '600',
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 6,
  },
  promoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionLeft: {
    flexDirection: 'row',
    gap: 20,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  
  // Story Modal
  storyModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  storyFullImage: {
    flex: 1,
  },
  storyOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  storyHeader: {
    paddingHorizontal: 16,
  },
  storyProgress: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginBottom: 12,
  },
  storyProgressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  storyHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storyUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  storyUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  storyUserCategory: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  storyCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyTextContainer: {
    position: 'absolute',
    bottom: '25%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  storyText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  storyFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  storyActionBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Search Modal
  searchModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  searchCategoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchCategoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  searchCategoryPillActive: {
    backgroundColor: '#10B981',
  },
  searchCategoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  searchCategoryTextActive: {
    color: '#fff',
  },
  searchResults: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchResultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  searchResultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  searchResultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  searchResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  searchResultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  searchResultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  searchResultCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noResultsText: {
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 12,
  },
  
  bottomPadding: {
    height: 100,
  },
});
