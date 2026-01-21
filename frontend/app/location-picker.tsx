import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';
import { useAppStore } from '../src/store';

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

export default function LocationPickerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userLocation, setUserLocation } = useAppStore();
  
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [currentGPSLocation, setCurrentGPSLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  useEffect(() => {
    if (user?.addresses) {
      setSavedAddresses(user.addresses);
    }
  }, [user]);

  const fetchCurrentLocation = async () => {
    setIsLoadingGPS(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert('Permission Required', 'Please enable location access in settings');
          setIsLoadingGPS(false);
          return;
        }
      }
      
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      
      const addressStr = [
        address?.name,
        address?.street,
        address?.district,
        address?.city,
        address?.region,
      ].filter(Boolean).join(', ');
      
      setCurrentGPSLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        address: addressStr || 'Current Location',
      });
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Could not get current location');
    } finally {
      setIsLoadingGPS(false);
    }
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  const selectLocation = (location: { lat: number; lng: number; address: string }) => {
    setUserLocation(location);
    router.back();
  };

  const selectCurrentGPS = () => {
    if (currentGPSLocation) {
      selectLocation(currentGPSLocation);
    }
  };

  const selectSavedAddress = (addr: SavedAddress) => {
    selectLocation({
      lat: addr.lat || 0,
      lng: addr.lng || 0,
      address: addr.address,
    });
  };

  const getLabelIcon = (label: string) => {
    switch (label.toLowerCase()) {
      case 'home': return 'home';
      case 'office': return 'business';
      case 'work': return 'briefcase';
      default: return 'location';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Location</Text>
        <TouchableOpacity onPress={() => router.push('/account/addresses')} style={styles.manageButton}>
          <Text style={styles.manageButtonText}>Manage</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current GPS Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Location</Text>
          <TouchableOpacity 
            style={[styles.locationCard, styles.gpsCard]}
            onPress={selectCurrentGPS}
            disabled={isLoadingGPS || !currentGPSLocation}
          >
            <View style={[styles.locationIcon, styles.gpsIcon]}>
              {isLoadingGPS ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="navigate" size={24} color="#fff" />
              )}
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Use Current Location</Text>
              <Text style={styles.locationAddress} numberOfLines={2}>
                {isLoadingGPS 
                  ? 'Getting location...' 
                  : currentGPSLocation?.address || 'Tap to detect location'
                }
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={fetchCurrentLocation}
              disabled={isLoadingGPS}
            >
              <Ionicons name="refresh" size={20} color="#6366F1" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Currently Selected */}
        {userLocation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Currently Selected</Text>
            <View style={[styles.locationCard, styles.selectedCard]}>
              <View style={[styles.locationIcon, styles.selectedIcon]}>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Active Location</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>
                  {userLocation.address}
                </Text>
              </View>
              <Ionicons name="checkmark" size={24} color="#10B981" />
            </View>
          </View>
        )}

        {/* Saved Addresses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Saved Addresses</Text>
            <TouchableOpacity onPress={() => router.push('/account/addresses')}>
              <Text style={styles.addNewText}>+ Add New</Text>
            </TouchableOpacity>
          </View>
          
          {savedAddresses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No saved addresses</Text>
              <Text style={styles.emptyStateSubtext}>
                Save your frequently used addresses for quick access
              </Text>
              <TouchableOpacity 
                style={styles.addAddressButton}
                onPress={() => router.push('/account/addresses')}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addAddressButtonText}>Add Address</Text>
              </TouchableOpacity>
            </View>
          ) : (
            savedAddresses.map((addr) => (
              <TouchableOpacity 
                key={addr.id} 
                style={styles.locationCard}
                onPress={() => selectSavedAddress(addr)}
              >
                <View style={styles.locationIcon}>
                  <Ionicons name={getLabelIcon(addr.label) as any} size={24} color="#6366F1" />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>{addr.label}</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {addr.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Add Suggestions */}
        {savedAddresses.length < 3 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Add</Text>
            <View style={styles.quickAddRow}>
              {!savedAddresses.find(a => a.label.toLowerCase() === 'home') && (
                <TouchableOpacity 
                  style={styles.quickAddChip}
                  onPress={() => router.push('/account/addresses')}
                >
                  <Ionicons name="home-outline" size={18} color="#6366F1" />
                  <Text style={styles.quickAddText}>Add Home</Text>
                </TouchableOpacity>
              )}
              {!savedAddresses.find(a => a.label.toLowerCase() === 'office') && (
                <TouchableOpacity 
                  style={styles.quickAddChip}
                  onPress={() => router.push('/account/addresses')}
                >
                  <Ionicons name="business-outline" size={18} color="#6366F1" />
                  <Text style={styles.quickAddText}>Add Office</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  manageButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  addNewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  gpsCard: {
    borderWidth: 2,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsIcon: {
    backgroundColor: '#6366F1',
  },
  selectedIcon: {
    backgroundColor: '#10B981',
  },
  locationInfo: {
    flex: 1,
    marginLeft: 14,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  addAddressButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  quickAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 10,
    marginBottom: 10,
  },
  quickAddText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6366F1',
    marginLeft: 8,
  },
});
