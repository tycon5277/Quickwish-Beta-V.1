import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Linking, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { wisherAPI, STATUS_COLORS, STATUS_STEPS, OrderStatus, TimelineEvent } from '../../utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POLL_INTERVAL = 10000; // 10 seconds

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const orderId = typeof id === 'string' ? id : id?.[0] || '';
  const { sessionToken } = useAuth();
  
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrderStatus = useCallback(async () => {
    if (!sessionToken || !orderId) return;
    
    try {
      const status = await wisherAPI.getOrderStatus(orderId, sessionToken);
      setOrderStatus(status);
      setError(null);
      
      // Stop polling if order is in terminal state
      if (['delivered', 'cancelled'].includes(status.status)) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err: any) {
      console.error('Error fetching order status:', err);
      setError(err.response?.data?.detail || 'Failed to load order status');
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, orderId]);

  // Initial fetch and setup polling
  useEffect(() => {
    fetchOrderStatus();
    
    // Start polling every 10 seconds
    pollIntervalRef.current = setInterval(fetchOrderStatus, POLL_INTERVAL);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchOrderStatus]);

  const handleCancelOrder = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No, Keep Order', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            if (!sessionToken) return;
            
            setIsCancelling(true);
            try {
              await wisherAPI.cancelOrder(orderId, 'User requested cancellation', sessionToken);
              await fetchOrderStatus();
              Alert.alert('Success', 'Your order has been cancelled.');
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || 'Failed to cancel order');
            } finally {
              setIsCancelling(false);
            }
          }
        },
      ]
    );
  };

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusConfig = (status: string) => {
    return STATUS_COLORS[status] || STATUS_COLORS.placed;
  };

  const getStatusIndex = (status: string) => {
    return STATUS_STEPS.indexOf(status);
  };

  const canCancel = orderStatus && ['placed', 'pending'].includes(orderStatus.status);
  const isActiveOrder = orderStatus && !['delivered', 'cancelled'].includes(orderStatus.status);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading order...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !orderStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Order Not Found</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!orderStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorText}>Order not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(orderStatus.status);
  const statusIndex = getStatusIndex(orderStatus.status);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{orderId.slice(-8)}</Text>
        </View>
        <View style={styles.headerRight}>
          {isActiveOrder && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusConfig.bgColor }]}>
          <View style={styles.statusIconContainer}>
            <Ionicons name={statusConfig.icon as any} size={32} color={statusConfig.color} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            <Text style={styles.statusDescription}>
              {orderStatus.status === 'placed' && 'Your order has been placed successfully'}
              {orderStatus.status === 'confirmed' && 'The vendor has confirmed your order'}
              {orderStatus.status === 'preparing' && 'Your order is being prepared'}
              {orderStatus.status === 'ready' && 'Your order is ready for pickup'}
              {orderStatus.status === 'awaiting_pickup' && 'Waiting for delivery agent to pick up'}
              {orderStatus.status === 'picked_up' && 'Your order is on the way!'}
              {orderStatus.status === 'delivered' && 'Your order has been delivered'}
              {orderStatus.status === 'cancelled' && 'This order was cancelled'}
            </Text>
          </View>
        </View>

        {/* Genie (Delivery Agent) Info */}
        {orderStatus.genie && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Agent</Text>
            <View style={styles.genieCard}>
              <View style={styles.genieInfo}>
                {orderStatus.genie.photo ? (
                  <Image source={{ uri: orderStatus.genie.photo }} style={styles.geniePhoto} />
                ) : (
                  <View style={styles.geniePhotoPlaceholder}>
                    <Ionicons name="person" size={28} color="#10B981" />
                  </View>
                )}
                <View style={styles.genieDetails}>
                  <Text style={styles.genieName}>{orderStatus.genie.name}</Text>
                  <View style={styles.genieRating}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.genieRatingText}>{orderStatus.genie.rating.toFixed(1)}</Text>
                  </View>
                  <View style={styles.vehicleBadge}>
                    <Ionicons name="bicycle" size={12} color="#6B7280" />
                    <Text style={styles.vehicleText}>{orderStatus.genie.vehicle_type}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.genieActions}>
                {orderStatus.genie.estimated_time && (
                  <View style={styles.etaContainer}>
                    <Ionicons name="time-outline" size={16} color="#10B981" />
                    <Text style={styles.etaText}>{orderStatus.genie.estimated_time}</Text>
                  </View>
                )}
                {orderStatus.genie.phone && (
                  <TouchableOpacity 
                    style={styles.callButton}
                    onPress={() => callPhone(orderStatus.genie!.phone)}
                  >
                    <Ionicons name="call" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Order Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Timeline</Text>
          <View style={styles.timelineContainer}>
            {orderStatus.timeline && orderStatus.timeline.length > 0 ? (
              orderStatus.timeline.slice().reverse().map((event: TimelineEvent, idx: number) => {
                const eventConfig = getStatusConfig(event.status);
                const isFirst = idx === 0;
                const isLast = idx === orderStatus.timeline.length - 1;
                
                return (
                  <View key={idx} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[
                        styles.timelineDot,
                        { backgroundColor: eventConfig.color },
                        isFirst && styles.timelineDotCurrent
                      ]}>
                        {isFirst && <View style={styles.timelineDotInner} />}
                      </View>
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={[styles.timelineStatus, isFirst && styles.timelineStatusCurrent]}>
                          {eventConfig.label}
                        </Text>
                        <Text style={styles.timelineTime}>{formatTimestamp(event.timestamp)}</Text>
                      </View>
                      <Text style={styles.timelineMessage}>{event.message}</Text>
                      {isFirst && (
                        <Text style={styles.timelineDate}>{formatDate(event.timestamp)}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              // Show progress steps if no timeline available
              STATUS_STEPS.map((step, idx) => {
                const stepConfig = getStatusConfig(step);
                const isCompleted = idx <= statusIndex;
                const isCurrent = idx === statusIndex;
                const isLast = idx === STATUS_STEPS.length - 1;
                
                return (
                  <View key={step} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[
                        styles.timelineDot,
                        isCompleted && { backgroundColor: stepConfig.color },
                        isCurrent && styles.timelineDotCurrent
                      ]}>
                        {isCompleted && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      {!isLast && (
                        <View style={[
                          styles.timelineLine,
                          isCompleted && styles.timelineLineCompleted
                        ]} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineStatus,
                        isCompleted && styles.timelineStatusCompleted,
                        isCurrent && styles.timelineStatusCurrent
                      ]}>
                        {stepConfig.label}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Vendor Info */}
        {orderStatus.vendor && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shop Details</Text>
            <View style={styles.vendorCard}>
              <View style={styles.vendorIcon}>
                <Ionicons name="storefront" size={24} color="#10B981" />
              </View>
              <View style={styles.vendorInfo}>
                <Text style={styles.vendorName}>{orderStatus.vendor.name}</Text>
                <Text style={styles.vendorId}>ID: {orderStatus.vendor.id.slice(-8)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Order ID</Text>
              <Text style={styles.summaryValue}>{orderId}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryTotalLabel}>Total Amount</Text>
              <Text style={styles.summaryTotalValue}>₹{orderStatus.total_amount}</Text>
            </View>
          </View>
        </View>

        {/* Cancel Button */}
        {canCancel && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={handleCancelOrder}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                  <Text style={styles.cancelButtonText}>Cancel Order</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginTop: 12 },
  errorText: { fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center' },
  backBtn: { marginTop: 20, backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '600' },

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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  headerRight: { width: 60, alignItems: 'flex-end' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },

  content: { flex: 1 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    gap: 14,
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: { flex: 1 },
  statusLabel: { fontSize: 18, fontWeight: '700' },
  statusDescription: { fontSize: 13, color: '#6B7280', marginTop: 4 },

  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },

  // Genie (Delivery Agent) Card
  genieCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  genieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  geniePhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  geniePhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  genieDetails: {
    marginLeft: 12,
    flex: 1,
  },
  genieName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  genieRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  genieRatingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  vehicleText: {
    fontSize: 12,
    color: '#6B7280',
  },
  genieActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  etaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Timeline
  timelineContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 60,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  timelineLineCompleted: {
    backgroundColor: '#10B981',
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineStatus: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  timelineStatusCompleted: {
    color: '#4B5563',
  },
  timelineStatusCurrent: {
    fontWeight: '700',
    color: '#10B981',
  },
  timelineTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  timelineMessage: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  timelineDate: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Vendor Card
  vendorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  vendorIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vendorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  vendorId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 13,
    color: '#1F2937',
    fontFamily: 'monospace',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
    paddingTop: 12,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
  },

  // Cancel Button
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },

  bottomPadding: { height: 40 },
});
