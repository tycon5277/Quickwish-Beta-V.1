import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Image, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-3.preview.emergentagent.com';

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
    caption: 'Just completed my 1000th delivery! 🎉 Thank you all for trusting me with your packages. From groceries to medicines, I\'ve delivered it all with care. Here\'s to the next 1000! 🚴‍♂️💨',
    likes: 234,
    comments: 45,
    timestamp: '2h ago',
    tags: ['#1000Deliveries', '#LocalHero', '#BikeDelivery'],
    milestone: '🏆 1000 Deliveries',
  },
  {
    id: 'p2',
    creator_type: 'vendor',
    creator_name: 'Fresh Mart Grocery',
    creator_image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=100',
    creator_category: 'Grocery Store',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1542838132-92c53300491e?w=600'],
    caption: '🍎 Fresh arrivals! Organic fruits and vegetables directly from local farms. Order now and get 20% off on your first purchase! Use code: FRESH20',
    likes: 156,
    comments: 23,
    timestamp: '4h ago',
    tags: ['#Organic', '#FreshProduce', '#LocalFarm'],
  },
  {
    id: 'p3',
    creator_type: 'promoter',
    creator_name: 'Weekend Wanderers',
    creator_image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
    creator_category: 'Travel Organizer',
    is_verified: false,
    images: ['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600', 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600', 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=600'],
    caption: '🚌 Weekend Trip Alert! This Saturday we\'re heading to Coorg - the Scotland of India! Mini bus trip with 12 seats available.\n\n✅ Pickup from city center\n✅ Breakfast included\n✅ Professional guide\n\nDM or book through QuickWish!',
    likes: 89,
    comments: 34,
    timestamp: '6h ago',
    tags: ['#WeekendTrip', '#Coorg', '#TravelWithUs'],
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
    caption: 'Transform your space! ✨ Professional deep cleaning services now available. We handle everything from kitchen degreasing to bathroom sanitization.\n\nBook your slot today and get a free carpet steam clean!',
    likes: 67,
    comments: 12,
    timestamp: '8h ago',
    tags: ['#DeepCleaning', '#HomeServices', '#SparkleClean'],
  },
  {
    id: 'p5',
    creator_type: 'promoter',
    creator_name: 'FitLife Studios',
    creator_image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=100',
    creator_category: 'Fitness Coach',
    is_verified: true,
    images: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600'],
    caption: '💪 New Year, New You! Join our 30-day transformation challenge. Personal training sessions now available at your doorstep or through video calls.\n\nFirst session FREE for QuickWish users!',
    likes: 198,
    comments: 56,
    timestamp: '1d ago',
    tags: ['#FitnessChallenge', '#PersonalTrainer', '#HomeWorkout'],
    promo_link: 'Join Challenge',
  },
];

// Creator type configurations
const CREATOR_CONFIG: Record<CreatorType, { label: string; color: string; bgColor: string; icon: string }> = {
  agent: { label: 'Agent', color: '#10B981', bgColor: '#D1FAE5', icon: 'bicycle' },
  vendor: { label: 'Vendor', color: '#3B82F6', bgColor: '#DBEAFE', icon: 'storefront' },
  promoter: { label: 'Promoter', color: '#8B5CF6', bgColor: '#EDE9FE', icon: 'megaphone' },
};

// Category filters
const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'agent', label: 'Agents', icon: 'bicycle' },
  { id: 'vendor', label: 'Vendors', icon: 'storefront' },
  { id: 'promoter', label: 'Promoters', icon: 'megaphone' },
  { id: 'milestone', label: 'Milestones', icon: 'trophy' },
  { id: 'deals', label: 'Deals', icon: 'pricetag' },
];

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [posts, setPosts] = useState<FeedPost[]>(FEED_POSTS);
  const [stories, setStories] = useState<Story[]>(STORIES);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<Record<string, number>>({});

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
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

  const filteredPosts = selectedCategory === 'all' 
    ? posts 
    : selectedCategory === 'milestone'
    ? posts.filter(p => p.milestone)
    : selectedCategory === 'deals'
    ? posts.filter(p => p.promo_link)
    : posts.filter(p => p.creator_type === selectedCategory);

  const nextImage = (postId: string, totalImages: number) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [postId]: ((prev[postId] || 0) + 1) % totalImages
    }));
  };

  const prevImage = (postId: string, totalImages: number) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [postId]: ((prev[postId] || 0) - 1 + totalImages) % totalImages
    }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="search" size={22} color="#1F2937" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="notifications-outline" size={22} color="#1F2937" />
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>3</Text>
            </View>
          </TouchableOpacity>
        </View>
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
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesContainer}
          >
            {/* Your Story */}
            <TouchableOpacity style={styles.storyItem}>
              <View style={styles.addStoryWrapper}>
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.addStoryGradient}
                >
                  <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.storyName}>Add Story</Text>
            </TouchableOpacity>

            {/* Other Stories */}
            {stories.map((story) => {
              const config = CREATOR_CONFIG[story.creator_type];
              return (
                <TouchableOpacity 
                  key={story.id} 
                  style={styles.storyItem}
                  onPress={() => setSelectedStory(story)}
                >
                  <View style={[
                    styles.storyRing,
                    story.has_unseen && { borderColor: config.color },
                    story.is_live && styles.storyRingLive
                  ]}>
                    <Image source={{ uri: story.user_image }} style={styles.storyAvatar} />
                    {story.is_live && (
                      <View style={styles.liveBadge}>
                        <Text style={styles.liveBadgeText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>{story.user_name}</Text>
                  <View style={[styles.storyTypeBadge, { backgroundColor: config.bgColor }]}>
                    <Ionicons name={config.icon as any} size={8} color={config.color} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Category Filter */}
        <View style={styles.categorySection}>
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

        {/* Feed Posts */}
        <View style={styles.feedSection}>
          {filteredPosts.map((post) => {
            const config = CREATOR_CONFIG[post.creator_type];
            const isLiked = likedPosts.has(post.id);
            const currentImg = currentImageIndex[post.id] || 0;

            return (
              <View key={post.id} style={styles.postCard}>
                {/* Post Header */}
                <View style={styles.postHeader}>
                  <TouchableOpacity style={styles.postCreatorInfo}>
                    <View style={[styles.creatorAvatarWrapper, { borderColor: config.color }]}>
                      <Image source={{ uri: post.creator_image }} style={styles.creatorAvatar} />
                    </View>
                    <View style={styles.creatorDetails}>
                      <View style={styles.creatorNameRow}>
                        <Text style={styles.creatorName}>{post.creator_name}</Text>
                        {post.is_verified && (
                          <Ionicons name="checkmark-circle" size={14} color="#3B82F6" />
                        )}
                      </View>
                      <View style={styles.creatorMeta}>
                        <View style={[styles.creatorTypeBadge, { backgroundColor: config.bgColor }]}>
                          <Ionicons name={config.icon as any} size={10} color={config.color} />
                          <Text style={[styles.creatorTypeText, { color: config.color }]}>
                            {config.label}
                          </Text>
                        </View>
                        <Text style={styles.creatorCategory}>• {post.creator_category}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreButton}>
                    <Ionicons name="ellipsis-horizontal" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Milestone Badge */}
                {post.milestone && (
                  <View style={styles.milestoneBanner}>
                    <LinearGradient
                      colors={['#F59E0B', '#D97706']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.milestoneGradient}
                    >
                      <Ionicons name="trophy" size={16} color="#fff" />
                      <Text style={styles.milestoneText}>{post.milestone}</Text>
                    </LinearGradient>
                  </View>
                )}

                {/* Post Images */}
                <View style={styles.postImageContainer}>
                  <Image 
                    source={{ uri: post.images[currentImg] }} 
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                  
                  {/* Image Navigation */}
                  {post.images.length > 1 && (
                    <>
                      <TouchableOpacity 
                        style={[styles.imageNav, styles.imageNavLeft]}
                        onPress={() => prevImage(post.id, post.images.length)}
                      >
                        <Ionicons name="chevron-back" size={24} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.imageNav, styles.imageNavRight]}
                        onPress={() => nextImage(post.id, post.images.length)}
                      >
                        <Ionicons name="chevron-forward" size={24} color="#fff" />
                      </TouchableOpacity>
                      
                      {/* Image Indicators */}
                      <View style={styles.imageIndicators}>
                        {post.images.map((_, idx) => (
                          <View 
                            key={idx}
                            style={[styles.imageIndicator, currentImg === idx && styles.imageIndicatorActive]}
                          />
                        ))}
                      </View>
                    </>
                  )}

                  {/* Image Count Badge */}
                  {post.images.length > 1 && (
                    <View style={styles.imageCountBadge}>
                      <Text style={styles.imageCountText}>{currentImg + 1}/{post.images.length}</Text>
                    </View>
                  )}
                </View>

                {/* Action Bar */}
                <View style={styles.actionBar}>
                  <View style={styles.actionLeft}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => toggleLike(post.id)}
                    >
                      <Ionicons 
                        name={isLiked ? "heart" : "heart-outline"} 
                        size={26} 
                        color={isLiked ? "#EF4444" : "#1F2937"} 
                      />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="chatbubble-outline" size={24} color="#1F2937" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                      <Ionicons name="paper-plane-outline" size={24} color="#1F2937" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="bookmark-outline" size={24} color="#1F2937" />
                  </TouchableOpacity>
                </View>

                {/* Likes */}
                <Text style={styles.likesText}>
                  {post.likes + (isLiked ? 1 : 0)} likes
                </Text>

                {/* Caption */}
                <View style={styles.captionContainer}>
                  <Text style={styles.captionText}>
                    <Text style={styles.captionUsername}>{post.creator_name} </Text>
                    {post.caption}
                  </Text>
                </View>

                {/* Tags */}
                {post.tags && (
                  <View style={styles.tagsContainer}>
                    {post.tags.map((tag, idx) => (
                      <TouchableOpacity key={idx}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Promo Link */}
                {post.promo_link && (
                  <TouchableOpacity style={styles.promoButton}>
                    <Text style={styles.promoButtonText}>{post.promo_link}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                )}

                {/* Comments Preview */}
                <TouchableOpacity>
                  <Text style={styles.viewComments}>View all {post.comments} comments</Text>
                </TouchableOpacity>

                {/* Timestamp */}
                <Text style={styles.timestamp}>{post.timestamp}</Text>
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
                <View style={styles.storyUserInfo}>
                  <Image source={{ uri: selectedStory.user_image }} style={styles.storyUserAvatar} />
                  <View>
                    <Text style={styles.storyUsername}>{selectedStory.user_name}</Text>
                    <Text style={styles.storyCategory}>{selectedStory.category}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setSelectedStory(null)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Story Text */}
              {selectedStory.text && (
                <View style={styles.storyTextContainer}>
                  <Text style={styles.storyText}>{selectedStory.text}</Text>
                </View>
              )}

              {/* Story Actions */}
              <View style={[styles.storyActions, { paddingBottom: insets.bottom + 20 }]}>
                <TouchableOpacity style={styles.storyActionButton}>
                  <Ionicons name="heart-outline" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.storyActionButton}>
                  <Ionicons name="paper-plane-outline" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}
      </Modal>

      {/* Floating Create Button */}
      <TouchableOpacity style={[styles.fab, { bottom: 90 + insets.bottom }]}>
        <LinearGradient
          colors={['#10B981', '#059669']}
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#EF4444',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  
  // Stories Section
  storiesSection: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  storiesContainer: {
    paddingHorizontal: 12,
  },
  storyItem: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 70,
    position: 'relative',
  },
  addStoryWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  addStoryGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyRingLive: {
    borderColor: '#EF4444',
  },
  storyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  liveBadge: {
    position: 'absolute',
    bottom: -2,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
  },
  storyName: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 4,
    textAlign: 'center',
  },
  storyTypeBadge: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  
  // Category Filter
  categorySection: {
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  categoryContainer: {
    paddingHorizontal: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
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
  
  // Feed Section
  feedSection: {
    paddingTop: 8,
  },
  postCard: {
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  postCreatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  creatorAvatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  creatorDetails: {
    marginLeft: 10,
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  creatorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  creatorTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  creatorTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  creatorCategory: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  moreButton: {
    padding: 4,
  },
  
  // Milestone Banner
  milestoneBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  milestoneGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  milestoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  
  // Post Image
  postImageContainer: {
    width: '100%',
    height: SCREEN_WIDTH,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  imageNav: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageNavLeft: {
    left: 10,
  },
  imageNavRight: {
    right: 10,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  imageIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  imageIndicatorActive: {
    backgroundColor: '#fff',
    width: 16,
  },
  imageCountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionLeft: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  likesText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    paddingHorizontal: 16,
  },
  
  // Caption
  captionContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  captionText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  captionUsername: {
    fontWeight: '700',
    color: '#1F2937',
  },
  
  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 8,
  },
  tagText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  
  // Promo Button
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  promoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  
  // Comments
  viewComments: {
    fontSize: 13,
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  timestamp: {
    fontSize: 11,
    color: '#D1D5DB',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
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
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    marginBottom: 12,
  },
  storyProgressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  storyUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  storyUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
  },
  storyUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  storyCategory: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  storyTextContainer: {
    position: 'absolute',
    bottom: '25%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  storyText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  storyActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  storyActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#10B981',
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
