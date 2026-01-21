import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';
import { useAppStore } from '../src/store';

// Conditionally import react-native-maps only on native platforms
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

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

export default function LocationPickerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userLocation, setUserLocation } = useAppStore();
  const mapRef = useRef<MapView>(null);
  
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [currentGPSLocation, setCurrentGPSLocation] = useState<LocationData | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  
  // Map state
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [pinLocation, setPinLocation] = useState<LocationData | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (user?.addresses) {
      setSavedAddresses(user.addresses);
    }
  }, [user]);

  // Initialize map with user's current location or saved location
  useEffect(() => {
    if (userLocation) {
      setMapRegion({
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
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
      
      // Update map if no pin location set
      if (!pinLocation) {
        setPinLocation(locationData);
        setMapRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Could not get current location');
    } finally {
      setIsLoadingGPS(false);
    }
  };

  const reverseGeocodePin = async (latitude: number, longitude: number) => {
    setIsLoadingAddress(true);
    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      
      const addressStr = [
        address?.name,
        address?.street,
        address?.district,
        address?.city,
        address?.region,
      ].filter(Boolean).join(', ');
      
      setPinLocation({
        lat: latitude,
        lng: longitude,
        address: addressStr || 'Selected Location',
      });
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      setPinLocation({
        lat: latitude,
        lng: longitude,
        address: 'Selected Location',
      });
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const handleMarkerDragEnd = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setIsDragging(false);
    reverseGeocodePin(latitude, longitude);
  };

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    reverseGeocodePin(latitude, longitude);
    
    // Animate to the new location
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 300);
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
      // Update pin and map to current GPS
      setPinLocation(currentGPSLocation);
      setMapRegion({
        latitude: currentGPSLocation.lat,
        longitude: currentGPSLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      mapRef.current?.animateToRegion({
        latitude: currentGPSLocation.lat,
        longitude: currentGPSLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    }
  };

  const selectSavedAddress = (addr: SavedAddress) => {
    if (addr.lat && addr.lng) {
      // Update pin and map
      const locationData: LocationData = {
        lat: addr.lat,
        lng: addr.lng,
        address: addr.address,
      };
      setPinLocation(locationData);
      setMapRegion({
        latitude: addr.lat,
        longitude: addr.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      mapRef.current?.animateToRegion({
        latitude: addr.lat,
        longitude: addr.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    } else {
      selectLocation({
        lat: 0,
        lng: 0,
        address: addr.address,
      });
    }
  };

  const centerOnCurrentLocation = () => {
    if (currentGPSLocation) {
      mapRef.current?.animateToRegion({
        latitude: currentGPSLocation.lat,
        longitude: currentGPSLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    } else {
      fetchCurrentLocation();
    }
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

        {/* Map Section */}
        <View style={styles.section}>
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Fine-tune Location</Text>
            <Text style={styles.mapHint}>Drag pin or tap map to adjust</Text>
          </View>
          
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              region={mapRegion}
              onRegionChangeComplete={setMapRegion}
              onPress={handleMapPress}
              showsUserLocation={true}
              showsMyLocationButton={false}
            >
              {pinLocation && (
                <Marker
                  coordinate={{
                    latitude: pinLocation.lat,
                    longitude: pinLocation.lng,
                  }}
                  draggable
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={handleMarkerDragEnd}
                >
                  <View style={styles.customMarker}>
                    <View style={styles.markerPin}>
                      <Ionicons name="location" size={28} color="#fff" />
                    </View>
                    <View style={styles.markerShadow} />
                  </View>
                </Marker>
              )}
            </MapView>
            
            {/* Map Controls */}
            <TouchableOpacity 
              style={styles.myLocationButton}
              onPress={centerOnCurrentLocation}
            >
              <Ionicons name="locate" size={22} color="#6366F1" />
            </TouchableOpacity>
            
            {/* Loading overlay */}
            {isLoadingAddress && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.mapLoadingText}>Getting address...</Text>
              </View>
            )}
          </View>
          
          {/* Pin Location Info */}
          {pinLocation && (
            <View style={styles.pinInfoCard}>
              <View style={styles.pinInfoContent}>
                <Ionicons name="location" size={20} color="#6366F1" />
                <Text style={styles.pinInfoAddress} numberOfLines={2}>
                  {isDragging ? 'Dragging...' : pinLocation.address}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.confirmPinButton}
                onPress={selectPinLocation}
                disabled={isDragging || isLoadingAddress}
              >
                <Text style={styles.confirmPinText}>Confirm</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
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
  map: {
    width: '100%',
    height: '100%',
  },
  customMarker: {
    alignItems: 'center',
  },
  markerPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerShadow: {
    width: 20,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    marginTop: -4,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapLoadingOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  mapLoadingText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
  },
  pinInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pinInfoContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinInfoAddress: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    marginLeft: 10,
  },
  confirmPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmPinText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginRight: 4,
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
