import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://order-lifecycle-8.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OrderDetail {
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_image?: string;
  vendor_phone?: string;
  vendor_address?: string;
  items: Array<{ 
    product_id: string;
    name: string; 
    quantity: number; 
    price: number; 
    original_price?: number;
    total: number; 
    image?: string 
  }>;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  delivery_fee: number;
  grand_total: number;
  status: string;
  status_history: Array<{ status: string; timestamp: string; message?: string }>;
  delivery_type: string;
  delivery_address: { address: string; label?: string };
  estimated_delivery?: string;
  agent_name?: string;
  agent_phone?: string;
  agent_location?: { lat: number; lng: number };
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bgColor: string; description: string }> = {
  confirmed: { label: 'Order Confirmed', color: '#3B82F6', icon: 'checkmark-circle', bgColor: '#EFF6FF', description: 'Your order has been confirmed by the shop' },
  preparing: { label: 'Preparing', color: '#F59E0B', icon: 'flame', bgColor: '#FEF3C7', description: 'The shop is preparing your order' },
  ready: { label: 'Ready for Pickup', color: '#8B5CF6', icon: 'cube', bgColor: '#EDE9FE', description: 'Your order is ready and waiting for pickup' },
  picked_up: { label: 'Picked Up', color: '#06B6D4', icon: 'bicycle', bgColor: '#CFFAFE', description: 'Your order has been picked up for delivery' },
  on_the_way: { label: 'On The Way', color: '#10B981', icon: 'navigate', bgColor: '#D1FAE5', description: 'Your order is on the way to you' },
  nearby: { label: 'Nearby', color: '#10B981', icon: 'location', bgColor: '#D1FAE5', description: 'Delivery agent is nearby!' },
  delivered: { label: 'Delivered', color: '#6B7280', icon: 'checkmark-done-circle', bgColor: '#F3F4F6', description: 'Your order has been delivered' },
  cancelled: { label: 'Cancelled', color: '#EF4444', icon: 'close-circle', bgColor: '#FEE2E2', description: 'This order was cancelled' },
};

const STATUS_STEPS = ['confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered'];

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { sessionToken } = useAuth();
  
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setOrder(response.data);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, id]);

  useEffect(() => {
    fetchOrder();
    // Poll for updates every 15 seconds for active orders
    const interval = setInterval(fetchOrder, 15000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'long',
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIndex = (status: string) => STATUS_STEPS.indexOf(status);

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const getMapHtml = () => {
    if (!order?.agent_location) return '';
    const { lat, lng } = order.agent_location;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100%; height: 100vh; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${lat}, ${lng}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(map);
          
          var deliveryIcon = L.divIcon({
            html: '<div style="background:#10B981;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🚴</div>',
            className: '',
            iconSize: [30, 30]
          });
          
          L.marker([${lat}, ${lng}], {icon: deliveryIcon}).addTo(map)
            .bindPopup('Delivery Agent').openPopup();
        </script>
      </body>
      </html>
    `;
  };

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

  if (!order) {
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

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
  const statusIndex = getStatusIndex(order.status);
  const isActiveOrder = !['delivered', 'cancelled'].includes(order.status);
  const showLiveTracking = isActiveOrder && order.delivery_type === 'agent_delivery' && 
    ['picked_up', 'on_the_way', 'nearby'].includes(order.status);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{order.order_id.slice(-8)}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusConfig.bgColor }]}>
          <View style={styles.statusIconContainer}>
            <Ionicons name={statusConfig.icon as any} size={32} color={statusConfig.color} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            <Text style={styles.statusDescription}>{statusConfig.description}</Text>
          </View>
        </View>

        {/* Live Tracking Map */}
        {showLiveTracking && order.agent_location && (
          <View style={styles.mapSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="location" size={20} color="#10B981" />
              <Text style={styles.sectionTitle}>Live Tracking</Text>
            </View>
            <TouchableOpacity 
              style={styles.mapContainer}
              onPress={() => setShowMap(true)}
            >
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map" size={40} color="#10B981" />
                <Text style={styles.mapText}>Tap to view live location</Text>
              </View>
            </TouchableOpacity>
            
            {/* ETA */}
            {order.estimated_delivery && (
              <View style={styles.etaContainer}>
                <Ionicons name="time" size={18} color="#10B981" />
                <Text style={styles.etaLabel}>Estimated Arrival:</Text>
                <Text style={styles.etaTime}>{formatTime(order.estimated_delivery)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Progress Timeline */}
        {isActiveOrder && statusIndex >= 0 && (
          <View style={styles.timelineSection}>
            <Text style={styles.sectionTitle}>Order Progress</Text>
            <View style={styles.timeline}>
              {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx <= statusIndex;
                const isCurrent = idx === statusIndex;
                const stepConfig = STATUS_CONFIG[step];
                
                return (
                  <View key={step} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[
                        styles.timelineDot,
                        isCompleted && styles.timelineDotCompleted,
                        isCurrent && styles.timelineDotCurrent
                      ]}>
                        {isCompleted && (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        )}
                      </View>
                      {idx < STATUS_STEPS.length - 1 && (
                        <View style={[
                          styles.timelineLine,
                          isCompleted && styles.timelineLineCompleted
                        ]} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineLabel,
                        isCompleted && styles.timelineLabelCompleted,
                        isCurrent && styles.timelineLabelCurrent
                      ]}>
                        {stepConfig.label}
                      </Text>
                      {isCurrent && (
                        <Text style={styles.timelineCurrentTag}>Current</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Delivery Agent Info */}
        {isActiveOrder && order.delivery_type === 'agent_delivery' && order.agent_name && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Agent</Text>
            <View style={styles.agentCard}>
              <View style={styles.agentAvatar}>
                <Ionicons name="person" size={24} color="#10B981" />
              </View>
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{order.agent_name}</Text>
                <Text style={styles.agentRole}>QuickWish Fulfillment Agent</Text>
              </View>
              {order.agent_phone && (
                <TouchableOpacity 
                  style={styles.callButton}
                  onPress={() => callPhone(order.agent_phone!)}
                >
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Shop Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shop Details</Text>
          <View style={styles.shopCard}>
            <View style={styles.shopRow}>
              {order.vendor_image ? (
                <Image source={{ uri: order.vendor_image }} style={styles.shopImage} />
              ) : (
                <View style={styles.shopImagePlaceholder}>
                  <Ionicons name="storefront" size={24} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{order.vendor_name}</Text>
                {order.vendor_address && (
                  <Text style={styles.shopAddress}>{order.vendor_address}</Text>
                )}
              </View>
            </View>
            {order.vendor_phone && (
              <TouchableOpacity 
                style={styles.shopCallButton}
                onPress={() => callPhone(order.vendor_phone!)}
              >
                <Ionicons name="call-outline" size={18} color="#10B981" />
                <Text style={styles.shopCallText}>Call Shop</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items ({order.items.length})</Text>
          <View style={styles.itemsCard}>
            {order.items.map((item, idx) => (
              <View key={idx} style={[styles.itemRow, idx < order.items.length - 1 && styles.itemRowBorder]}>
                {item.image && (
                  <Image source={{ uri: item.image }} style={styles.itemImage} />
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>₹{item.price} × {item.quantity}</Text>
                </View>
                <Text style={styles.itemTotal}>₹{item.total}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bill Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill Details</Text>
          <View style={styles.billCard}>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Items Total</Text>
              <Text style={styles.billValue}>₹{order.subtotal}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>GST ({(order.tax_rate * 100).toFixed(0)}%)</Text>
              <Text style={styles.billValue}>₹{order.tax_amount}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery Fee</Text>
              <Text style={styles.billValue}>
                {order.delivery_fee > 0 ? `₹${order.delivery_fee}` : 'Free'}
              </Text>
            </View>
            <View style={[styles.billRow, styles.billTotalRow]}>
              <Text style={styles.billTotalLabel}>Grand Total</Text>
              <Text style={styles.billTotalValue}>₹{order.grand_total}</Text>
            </View>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <View style={styles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#6B7280" />
            <View style={styles.addressContent}>
              {order.delivery_address.label && (
                <Text style={styles.addressLabel}>{order.delivery_address.label}</Text>
              )}
              <Text style={styles.addressText}>{order.delivery_address.address}</Text>
            </View>
          </View>
        </View>

        {/* Order Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Order ID</Text>
              <Text style={styles.infoValue}>{order.order_id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Placed On</Text>
              <Text style={styles.infoValue}>{formatDate(order.created_at)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Delivery Type</Text>
              <Text style={styles.infoValue}>
                {order.delivery_type === 'agent_delivery' ? 'QuickWish Agent' : 'Shop Delivery'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment</Text>
              <Text style={[styles.infoValue, { color: '#10B981' }]}>Paid ✓</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Map Modal */}
      {showMap && order.agent_location && (
        <View style={styles.mapModal}>
          <View style={styles.mapModalHeader}>
            <Text style={styles.mapModalTitle}>Live Location</Text>
            <TouchableOpacity onPress={() => setShowMap(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html: getMapHtml() }}
            style={styles.webView}
            scrollEnabled={false}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#6B7280', marginTop: 12 },
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
  headerRight: { width: 40 },

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

  mapSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mapContainer: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mapText: { fontSize: 13, color: '#6B7280' },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    gap: 8,
  },
  etaLabel: { fontSize: 13, color: '#6B7280' },
  etaTime: { fontSize: 16, fontWeight: '700', color: '#10B981' },

  timelineSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  timeline: { marginTop: 12 },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 50,
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
  timelineDotCompleted: {
    backgroundColor: '#10B981',
  },
  timelineDotCurrent: {
    backgroundColor: '#10B981',
    width: 24,
    height: 24,
    borderRadius: 12,
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  timelineLabelCompleted: {
    color: '#4B5563',
  },
  timelineLabelCurrent: {
    fontWeight: '700',
    color: '#10B981',
  },
  timelineCurrentTag: {
    fontSize: 10,
    color: '#fff',
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

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

  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentInfo: { flex: 1, marginLeft: 12 },
  agentName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  agentRole: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },

  shopCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopImage: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  shopImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopInfo: { flex: 1, marginLeft: 12 },
  shopName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  shopAddress: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  shopCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 6,
  },
  shopCallText: { fontSize: 14, fontWeight: '600', color: '#10B981' },

  itemsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  itemPrice: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '600', color: '#1F2937' },

  billCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  billLabel: { fontSize: 14, color: '#6B7280' },
  billValue: { fontSize: 14, color: '#1F2937' },
  billTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 12,
  },
  billTotalLabel: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  billTotalValue: { fontSize: 20, fontWeight: '700', color: '#10B981' },

  addressCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  addressContent: { flex: 1 },
  addressLabel: { fontSize: 12, fontWeight: '600', color: '#10B981', marginBottom: 4 },
  addressText: { fontSize: 14, color: '#4B5563', lineHeight: 20 },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1F2937' },

  bottomPadding: { height: 40 },

  mapModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  mapModalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  webView: { flex: 1 },
});
