import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-2.preview.emergentagent.com';

interface LocalBusiness {
  business_id: string;
  name: string;
  category: string;
  description?: string;
  image?: string;
  location: {
    address: string;
  };
  rating: number;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'Fruits & Vegetables', label: 'Fresh', icon: 'leaf' },
  { id: 'Home Kitchen', label: 'Kitchen', icon: 'restaurant' },
  { id: 'Artisan', label: 'Artisan', icon: 'color-palette' },
  { id: 'Pharmacy', label: 'Pharmacy', icon: 'medkit' },
  { id: 'Grocery', label: 'Grocery', icon: 'cart' },
];

export default function LocalHubScreen() {
  const [businesses, setBusinesses] = useState<LocalBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchBusinesses = useCallback(async () => {
    try {
      let url = `${BACKEND_URL}/api/localhub`;
      if (selectedCategory !== 'all') {
        url += `?category=${encodeURIComponent(selectedCategory)}`;
      }
      const response = await axios.get(url);
      setBusinesses(response.data);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  const seedData = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/seed`);
      fetchBusinesses();
    } catch (error) {
      console.error('Error seeding data:', error);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBusinesses();
    setRefreshing(false);
  };

  const filteredBusinesses = businesses.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryIcon = (category: string) => {
    const found = CATEGORIES.find(c => c.id === category);
    return found?.icon || 'storefront';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Local Hub</Text>
        <Text style={styles.headerSubtitle}>Discover local businesses near you</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search businesses..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Categories */}
      <View style={styles.categoriesWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                selectedCategory === cat.id && styles.categoryChipActive
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Ionicons
                name={cat.icon as any}
                size={16}
                color={selectedCategory === cat.id ? '#fff' : '#6B7280'}
              />
              <Text style={[
                styles.categoryLabel,
                selectedCategory === cat.id && styles.categoryLabelActive
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#6366F1" style={styles.loader} />
        ) : filteredBusinesses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="storefront-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No businesses found</Text>
            <Text style={styles.emptyStateSubtext}>
              Local businesses will appear here
            </Text>
            <TouchableOpacity style={styles.seedButton} onPress={seedData}>
              <Text style={styles.seedButtonText}>Load Sample Data</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.businessGrid}>
            {filteredBusinesses.map((business) => (
              <TouchableOpacity key={business.business_id} style={styles.businessCard}>
                <View style={styles.businessImagePlaceholder}>
                  <Ionicons name={getCategoryIcon(business.category) as any} size={32} color="#6366F1" />
                </View>
                <View style={styles.businessInfo}>
                  <Text style={styles.businessName} numberOfLines={1}>{business.name}</Text>
                  <Text style={styles.businessCategory}>{business.category}</Text>
                  <View style={styles.businessMeta}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>{business.rating.toFixed(1)}</Text>
                    <Ionicons name="location-outline" size={14} color="#9CA3AF" style={{ marginLeft: 8 }} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {business.location?.address?.split(',')[0] || 'Nearby'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  categoriesWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoriesScroll: {
    flexGrow: 0,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#6366F1',
  },
  categoryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
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
  businessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  businessCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  businessImagePlaceholder: {
    height: 100,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  businessInfo: {
    padding: 12,
  },
  businessName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  businessCategory: {
    fontSize: 12,
    color: '#6366F1',
    marginBottom: 8,
  },
  businessMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
    flex: 1,
  },
  bottomPadding: {
    height: 20,
  },
});
