import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-2.preview.emergentagent.com';

interface ExplorePost {
  post_id: string;
  title: string;
  content: string;
  post_type: string;
  image?: string;
  created_at: string;
}

export default function ExploreScreen() {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/explore`);
      setPosts(response.data);
    } catch (error) {
      console.error('Error fetching explore posts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const seedData = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/seed`);
      fetchPosts();
    } catch (error) {
      console.error('Error seeding data:', error);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'milestone': return 'trophy';
      case 'event': return 'calendar';
      case 'celebration': return 'happy';
      case 'news': return 'newspaper';
      default: return 'information-circle';
    }
  };

  const getPostTypeColor = (type: string) => {
    switch (type) {
      case 'milestone': return '#F59E0B';
      case 'event': return '#3B82F6';
      case 'celebration': return '#EC4899';
      case 'news': return '#10B981';
      default: return '#6B7280';
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <Text style={styles.headerSubtitle}>What's happening in your community</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#6366F1" style={styles.loader} />
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="compass-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No updates yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Community highlights and events will appear here
            </Text>
            <TouchableOpacity style={styles.seedButton} onPress={seedData}>
              <Text style={styles.seedButtonText}>Load Sample Data</Text>
            </TouchableOpacity>
          </View>
        ) : (
          posts.map((post) => (
            <View key={post.post_id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <View style={[styles.postTypeIcon, { backgroundColor: getPostTypeColor(post.post_type) + '20' }]}>
                  <Ionicons name={getPostTypeIcon(post.post_type) as any} size={20} color={getPostTypeColor(post.post_type)} />
                </View>
                <View style={styles.postMeta}>
                  <Text style={[styles.postType, { color: getPostTypeColor(post.post_type) }]}>
                    {post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)}
                  </Text>
                  <Text style={styles.postTime}>{formatDate(post.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.postTitle}>{post.title}</Text>
              <Text style={styles.postContent}>{post.content}</Text>
              <View style={styles.postActions}>
                <TouchableOpacity style={styles.postAction}>
                  <Ionicons name="heart-outline" size={20} color="#6B7280" />
                  <Text style={styles.postActionText}>Like</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.postAction}>
                  <Ionicons name="chatbubble-outline" size={20} color="#6B7280" />
                  <Text style={styles.postActionText}>Comment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.postAction}>
                  <Ionicons name="share-outline" size={20} color="#6B7280" />
                  <Text style={styles.postActionText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
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
  seedButton: {
    marginTop: 20,
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  seedButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  postCard: {
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
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postMeta: {
    marginLeft: 12,
  },
  postType: {
    fontSize: 14,
    fontWeight: '600',
  },
  postTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  postContent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  postActions: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  postActionText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  bottomPadding: {
    height: 20,
  },
});
