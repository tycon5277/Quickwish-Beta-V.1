import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Dimensions, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wishmarket-1.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface UserStats {
  total_orders: number;
  total_wishes: number;
  completed_wishes: number;
  total_spent: number;
  member_since: string;
  rating: number;
  total_ratings: number;
  level: string;
  level_progress: number;
  badges: string[];
}

const LEVEL_CONFIG: Record<string, { min: number; max: number; color: string; icon: string }> = {
  'Newbie': { min: 0, max: 5, color: '#9CA3AF', icon: 'leaf' },
  'Explorer': { min: 5, max: 15, color: '#7C3AED', icon: 'compass' },
  'Regular': { min: 15, max: 30, color: '#0EA5E9', icon: 'star' },
  'Champion': { min: 30, max: 50, color: '#F59E0B', icon: 'trophy' },
  'Legend': { min: 50, max: 100, color: '#EF4444', icon: 'flame' },
};

const BADGE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'first_order': { label: 'First Order', icon: 'cart', color: '#7C3AED' },
  'first_wish': { label: 'First Wish', icon: 'sparkles', color: '#F59E0B' },
  'five_orders': { label: '5 Orders', icon: 'ribbon', color: '#0EA5E9' },
  'ten_orders': { label: '10 Orders', icon: 'medal', color: '#7C3AED' },
  'verified_phone': { label: 'Verified Phone', icon: 'call', color: '#7C3AED' },
  'verified_email': { label: 'Verified Email', icon: 'mail', color: '#0EA5E9' },
  'early_adopter': { label: 'Early Adopter', icon: 'rocket', color: '#EF4444' },
  'top_rated': { label: 'Top Rated', icon: 'star', color: '#F59E0B' },
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, sessionToken, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUserStats = useCallback(async () => {
    if (!sessionToken) return;
    try {
      // Fetch orders
      const ordersResponse = await axios.get(`${BACKEND_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const orders = ordersResponse.data || [];
      
      // Fetch wishes
      const wishesResponse = await axios.get(`${BACKEND_URL}/api/wishes`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const wishes = wishesResponse.data || [];
      
      // Calculate stats
      const totalOrders = orders.length;
      const totalWishes = wishes.length;
      const completedWishes = wishes.filter((w: any) => w.status === 'completed').length;
      const totalSpent = orders.reduce((sum: number, o: any) => sum + (o.grand_total || 0), 0);
      
      // Calculate level
      const totalActivity = totalOrders + totalWishes;
      let level = 'Newbie';
      let levelProgress = 0;
      
      for (const [lvl, config] of Object.entries(LEVEL_CONFIG)) {
        if (totalActivity >= config.min && totalActivity < config.max) {
          level = lvl;
          levelProgress = ((totalActivity - config.min) / (config.max - config.min)) * 100;
          break;
        } else if (totalActivity >= config.max) {
          level = lvl;
          levelProgress = 100;
        }
      }
      
      // Calculate badges
      const badges: string[] = [];
      if (totalOrders >= 1) badges.push('first_order');
      if (totalWishes >= 1) badges.push('first_wish');
      if (totalOrders >= 5) badges.push('five_orders');
      if (totalOrders >= 10) badges.push('ten_orders');
      if (user?.phone) badges.push('verified_phone');
      if (user?.email) badges.push('verified_email');
      badges.push('early_adopter'); // Everyone gets this for now
      
      setStats({
        total_orders: totalOrders,
        total_wishes: totalWishes,
        completed_wishes: completedWishes,
        total_spent: totalSpent,
        member_since: user?.created_at || new Date().toISOString(),
        rating: 4.8, // Mock rating
        total_ratings: Math.max(totalOrders * 2, 5),
        level,
        level_progress: Math.min(levelProgress, 100),
        badges,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [sessionToken, user]);

  useEffect(() => {
    fetchUserStats();
  }, [fetchUserStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserStats();
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleMenuPress = (route: string | null, label: string) => {
    if (route === '/account/profile' || route === '/account/addresses') {
      router.push(route);
    } else if (route === '/orders') {
      router.push('/orders');
    } else if (route) {
      Alert.alert('Coming Soon', `${label} feature is under development`);
    }
  };

  const levelConfig = LEVEL_CONFIG[stats?.level || 'Newbie'];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Header Profile Card */}
        <LinearGradient
          colors={['#10B981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.profileSection}>
            <View style={styles.avatarWrapper}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
                </View>
              )}
              <View style={[styles.levelBadge, { backgroundColor: levelConfig?.color || '#9CA3AF' }]}>
                <Ionicons name={levelConfig?.icon as any || 'leaf'} size={12} color="#fff" />
              </View>
            </View>
            
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'User'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
              <View style={styles.levelRow}>
                <Text style={styles.levelLabel}>{stats?.level || 'Newbie'}</Text>
                <View style={styles.levelProgressBar}>
                  <View style={[styles.levelProgressFill, { width: `${stats?.level_progress || 0}%` }]} />
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.editButton} onPress={() => router.push('/account/profile')}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Rating Card */}
          <View style={styles.ratingCard}>
            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= Math.floor(stats?.rating || 0) ? 'star' : star <= (stats?.rating || 0) ? 'star-half' : 'star-outline'}
                  size={20}
                  color="#F59E0B"
                />
              ))}
            </View>
            <Text style={styles.ratingValue}>{stats?.rating?.toFixed(1) || '0.0'}</Text>
            <Text style={styles.ratingCount}>({stats?.total_ratings || 0} ratings)</Text>
          </View>
        </LinearGradient>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="cart" size={22} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{stats?.total_orders || 0}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="sparkles" size={22} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{stats?.total_wishes || 0}</Text>
            <Text style={styles.statLabel}>Wishes</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="checkmark-circle" size={22} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{stats?.completed_wishes || 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="wallet" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.statValue}>₹{stats?.total_spent || 0}</Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
        </View>

        {/* Achievements / Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.sectionCount}>{stats?.badges?.length || 0} unlocked</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgesScroll}>
            {stats?.badges?.map((badgeId) => {
              const badge = BADGE_CONFIG[badgeId];
              if (!badge) return null;
              return (
                <View key={badgeId} style={styles.badgeCard}>
                  <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                    <Ionicons name={badge.icon as any} size={24} color={badge.color} />
                  </View>
                  <Text style={styles.badgeLabel}>{badge.label}</Text>
                </View>
              );
            })}
            {/* Locked Badges */}
            {Object.entries(BADGE_CONFIG)
              .filter(([id]) => !stats?.badges?.includes(id))
              .slice(0, 3)
              .map(([id, badge]) => (
                <View key={id} style={[styles.badgeCard, styles.badgeLocked]}>
                  <View style={[styles.badgeIcon, { backgroundColor: '#E5E7EB' }]}>
                    <Ionicons name="lock-closed" size={24} color="#9CA3AF" />
                  </View>
                  <Text style={styles.badgeLabelLocked}>{badge.label}</Text>
                </View>
              ))}
          </ScrollView>
        </View>

        {/* Verification Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Status</Text>
          <View style={styles.verificationCard}>
            <View style={styles.verificationItem}>
              <View style={[styles.verificationIcon, user?.email ? styles.verified : styles.unverified]}>
                <Ionicons name="mail" size={18} color={user?.email ? '#10B981' : '#9CA3AF'} />
              </View>
              <View style={styles.verificationInfo}>
                <Text style={styles.verificationLabel}>Email</Text>
                <Text style={styles.verificationValue} numberOfLines={1}>
                  {user?.email || 'Not verified'}
                </Text>
              </View>
              {user?.email ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
              ) : (
                <TouchableOpacity style={styles.verifyButton}>
                  <Text style={styles.verifyButtonText}>Verify</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.verificationDivider} />
            <View style={styles.verificationItem}>
              <View style={[styles.verificationIcon, user?.phone ? styles.verified : styles.unverified]}>
                <Ionicons name="call" size={18} color={user?.phone ? '#10B981' : '#9CA3AF'} />
              </View>
              <View style={styles.verificationInfo}>
                <Text style={styles.verificationLabel}>Phone</Text>
                <Text style={styles.verificationValue}>
                  {user?.phone || 'Not verified'}
                </Text>
              </View>
              {user?.phone ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.verifyButton}
                  onPress={() => router.push('/account/profile')}
                >
                  <Text style={styles.verifyButtonText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/orders')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="receipt" size={24} color="#10B981" />
              </View>
              <Text style={styles.quickActionLabel}>My Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/account/addresses')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="location" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionLabel}>Addresses</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => handleMenuPress('/account/payments', 'Payment Methods')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="card" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.quickActionLabel}>Payments</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => handleMenuPress('/account/support', 'Help & Support')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="help-circle" size={24} color="#8B5CF6" />
              </View>
              <Text style={styles.quickActionLabel}>Help</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More Options</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('/account/profile')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="person" size={20} color="#10B981" />
              </View>
              <Text style={styles.menuLabel}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => handleMenuPress('/account/notifications', 'Notifications')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="notifications" size={20} color="#3B82F6" />
              </View>
              <Text style={styles.menuLabel}>Notifications</Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => handleMenuPress('/account/about', 'About QuickWish')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
              </View>
              <Text style={styles.menuLabel}>About QuickWish</Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={() => handleMenuPress('/account/terms', 'Terms & Privacy')}
            >
              <View style={[styles.menuIcon, { backgroundColor: '#E5E7EB' }]}>
                <Ionicons name="document-text" size={20} color="#6B7280" />
              </View>
              <Text style={styles.menuLabel}>Terms & Privacy</Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>QuickWish v1.0.0</Text>
        <Text style={styles.memberSince}>
          Member since {new Date(stats?.member_since || Date.now()).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </Text>

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
  content: {
    flex: 1,
  },
  
  // Header Gradient
  headerGradient: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  levelBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  profileEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  levelProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  levelProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Rating Card
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  ratingCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  
  // Section
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionCount: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },
  
  // Badges
  badgesScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  badgeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginRight: 10,
    width: 90,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  badgeLocked: {
    opacity: 0.6,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  badgeLabelLocked: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  
  // Verification
  verificationCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  verificationDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 14,
  },
  verificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verified: {
    backgroundColor: '#D1FAE5',
  },
  unverified: {
    backgroundColor: '#F3F4F6',
  },
  verificationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  verificationLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  verificationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 2,
  },
  verifiedBadge: {
    marginLeft: 8,
  },
  verifyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  verifyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Quick Actions
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  quickActionCard: {
    width: (SCREEN_WIDTH - 52) / 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
  },
  
  // Menu
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  
  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
  },
  
  // Footer
  versionText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  memberSince: {
    fontSize: 12,
    color: '#D1D5DB',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomPadding: {
    height: 100,
  },
});
