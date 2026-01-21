import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';
import { useAppStore } from '../src/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 220;

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface LocationData {
  lat: number;
  lng: number;
  address: string;
}

// Web fallback map placeholder
const WebMapPlaceholder = ({ pinLocation, onSelectLocation }: { 
  pinLocation: LocationData | null;
  onSelectLocation: () => void;
}) => (
  <View style={styles.webMapPlaceholder}>
    <View style={styles.webMapContent}>
      <Ionicons name="map" size={48} color="#6366F1" />
      <Text style={styles.webMapTitle}>Map View</Text>
      <Text style={styles.webMapSubtext}>
        {pinLocation 
          ? `📍 ${pinLocation.address}` 
          : 'Maps work best in the mobile app'}
      </Text>
      {pinLocation && (
        <TouchableOpacity 
          style={styles.webMapSelectButton}
          onPress={onSelectLocation}
        >
          <Text style={styles.webMapSelectText}>Use This Location</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

export default function LocationPickerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userLocation, setUserLocation } = useAppStore();
  
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [currentGPSLocation, setCurrentGPSLocation] = useState<LocationData | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [pinLocation, setPinLocation] = useState<LocationData | null>(null);

  useEffect(() => {
    if (user?.addresses) {
      setSavedAddresses(user.addresses);
    }
  }, [user]);

  // Initialize with user's current location or saved location
  useEffect(() => {
    if (userLocation) {
      setPinLocation(userLocation);
    }
    fetchCurrentLocation();
  }, []);

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
      
      const locationData: LocationData = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        address: addressStr || 'Current Location',
      };
      
      setCurrentGPSLocation(locationData);
      
      // Update pin if no pin location set
      if (!pinLocation) {
        setPinLocation(locationData);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Don't show alert on web as geolocation may be blocked
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not get current location');
      }
    } finally {
      setIsLoadingGPS(false);
    }
  };

  const selectLocation = (location: LocationData) => {
    setUserLocation(location);
    router.back();
  };

  const selectPinLocation = () => {
    if (pinLocation) {
      selectLocation(pinLocation);
    }
  };

  const selectCurrentGPS = () => {
    if (currentGPSLocation) {
      setPinLocation(currentGPSLocation);
      selectLocation(currentGPSLocation);
    }
  };

  const selectSavedAddress = (addr: SavedAddress) => {
    const locationData: LocationData = {
      lat: addr.lat || 0,
      lng: addr.lng || 0,
      address: addr.address,
    };
    
    if (addr.lat && addr.lng) {
      setPinLocation(locationData);
    }
    
    selectLocation(locationData);
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

        {/* Map Section - Only show placeholder on web */}
        <View style={styles.section}>
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Fine-tune Location</Text>
            <Text style={styles.mapHint}>
              {Platform.OS === 'web' ? 'Use mobile app for map' : 'Drag pin or tap map to adjust'}
            </Text>
          </View>
          
          <View style={styles.mapContainer}>
            <WebMapPlaceholder 
              pinLocation={pinLocation} 
              onSelectLocation={selectPinLocation}
            />
          </View>
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
              <Ionicons name="bookmark-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No saved addresses</Text>
              <TouchableOpacity 
                style={styles.addAddressButton}
                onPress={() => router.push('/account/addresses')}
              >
                <Ionicons name="add" size={18} color="#fff" />
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
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
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
    width: 44,
    height: 44,
    borderRadius: 12,
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
    marginLeft: 12,
  },
  locationLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 3,
  },
  locationAddress: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Map styles
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mapHint: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  mapContainer: {
    height: MAP_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  // Web map placeholder styles
  webMapPlaceholder: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  webMapContent: {
    alignItems: 'center',
    padding: 20,
  },
  webMapTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  webMapSubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  webMapSelectButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  webMapSelectText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  addAddressButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
});
