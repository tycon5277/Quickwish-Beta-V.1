import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { wisherAPI, STATUS_COLORS, Order } from '../../utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OrdersScreen() {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'active' | 'past'>('active');
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!sessionToken) {
      setIsLoading(false);
      return;
    }
    
    try {
      setError(null);
      const response = await wisherAPI.getOrders(sessionToken);
      setOrders(response.orders || []);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setError(err.response?.data?.detail || 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchOrders();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  // Filter orders by active/past status
  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const pastOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));
  const displayedOrders = selectedTab === 'active' ? activeOrders : pastOrders;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusConfig = (status: string) => {
    return STATUS_COLORS[status] || STATUS_COLORS.placed;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!sessionToken) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Orders</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="person-outline" size={48} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>Please Login</Text>
          <Text style={styles.emptySubtext}>Login to view your orders</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'active' && styles.tabActive]}
          onPress={() => setSelectedTab('active')}
        >
          <Text style={[styles.tabText, selectedTab === 'active' && styles.tabTextActive]}>
            Active ({activeOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'past' && styles.tabActive]}
          onPress={() => setSelectedTab('past')}
        >
          <Text style={[styles.tabText, selectedTab === 'past' && styles.tabTextActive]}>
            Past Orders ({pastOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {displayedOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={48} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>
              {selectedTab === 'active' ? 'No active orders' : 'No past orders'}
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedTab === 'active' 
                ? 'Your active orders will appear here' 
                : 'Your order history will appear here'}
            </Text>
            {selectedTab === 'active' && (
              <TouchableOpacity 
                style={styles.shopNowButton}
                onPress={() => router.push('/(main)/localhub')}
              >
                <Text style={styles.shopNowText}>Shop Now</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayedOrders.map((order) => {
            const statusConfig = getStatusConfig(order.status);
            
            return (
              <TouchableOpacity 
                key={order.order_id}
                style={styles.orderCard}
                onPress={() => router.push(`/orders/${order.order_id}`)}
                activeOpacity={0.9}
              >
                {/* Order Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderShopInfo}>
                    <View style={styles.shopImagePlaceholder}>
                      <Ionicons name="storefront" size={20} color="#9CA3AF" />
                    </View>
                    <View style={styles.shopDetails}>
                      <Text style={styles.shopName}>{order.vendor_name || 'Shop'}</Text>
                      <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                    <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
                    <Text style={[styles.statusText, { color: statusConfig.color }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                {/* Order Items Preview */}
                {order.items && order.items.length > 0 && (
                  <View style={styles.orderItems}>
                    {order.items.slice(0, 2).map((item, idx) => (
                      <View key={idx} style={styles.orderItem}>
                        <Text style={styles.orderItemQty}>{item.quantity}x</Text>
                        <Text style={styles.orderItemName} numberOfLines={1}>{item.name}</Text>
                      </View>
                    ))}
                    {order.items.length > 2 && (
                      <Text style={styles.moreItems}>+{order.items.length - 2} more items</Text>
                    )}
                  </View>
                )}

                {/* Order Footer */}
                <View style={styles.orderFooter}>
                  <View style={styles.orderTotal}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>₹{order.total_amount}</Text>
                  </View>
                  <View style={styles.viewDetails}>
                    <Text style={styles.viewDetailsText}>View Details</Text>
                    <Ionicons name="chevron-forward" size={16} color="#10B981" />
                  </View>
                </View>

                {/* Order ID */}
                <Text style={styles.orderId}>#{order.order_id.slice(-8)}</Text>
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
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 12, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  headerRight: { width: 40 },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  tabActive: {
    backgroundColor: '#10B981',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#fff',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },

  content: { flex: 1 },
  
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  shopNowButton: {
    marginTop: 24,
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shopNowText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  orderCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderShopInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shopImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopDetails: {
    marginLeft: 12,
    flex: 1,
  },
  shopName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  orderDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  orderItems: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderItemQty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
    width: 30,
  },
  orderItemName: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
  },
  moreItems: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },

  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  orderTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  viewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },

  orderId: {
    position: 'absolute',
    top: 16,
    right: 16,
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },

  bottomPadding: { height: 40 },
});
