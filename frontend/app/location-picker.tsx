import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useAuth } from './_layout';
import { useAppStore } from '../src/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 280;

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
  
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [currentGPSLocation, setCurrentGPSLocation] = useState<LocationData | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [pinLocation, setPinLocation] = useState<LocationData | null>(userLocation);
  const [mapKey, setMapKey] = useState(0);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (user?.addresses) {
      setSavedAddresses(user.addresses);
    }
  }, [user]);

  useEffect(() => {
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
      
      if (!pinLocation) {
        setPinLocation(locationData);
        setMapKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Set default location (Delhi, India)
      const defaultLocation: LocationData = {
        lat: 28.6139,
        lng: 77.2090,
        address: 'New Delhi, India',
      };
      setCurrentGPSLocation(defaultLocation);
      if (!pinLocation) {
        setPinLocation(defaultLocation);
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
      setMapKey(prev => prev + 1);
      selectLocation(currentGPSLocation);
    }
  };

  const selectSavedAddress = (addr: SavedAddress) => {
    const locationData: LocationData = {
      lat: addr.lat || 28.6139,
      lng: addr.lng || 77.2090,
      address: addr.address,
    };
    setPinLocation(locationData);
    setMapKey(prev => prev + 1);
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

  // Handle messages from WebView (pin drag events)
  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationSelected') {
        const { lat, lng } = data;
        
        // Reverse geocode to get address
        try {
          const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const addressStr = [
            address?.name,
            address?.street,
            address?.district,
            address?.city,
          ].filter(Boolean).join(', ');
          
          setPinLocation({
            lat,
            lng,
            address: addressStr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          });
        } catch (error) {
          setPinLocation({
            lat,
            lng,
            address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          });
        }
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // Generate Leaflet HTML for the map
  const getMapHTML = () => {
    const lat = pinLocation?.lat || currentGPSLocation?.lat || 28.6139;
    const lng = pinLocation?.lng || currentGPSLocation?.lng || 77.2090;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body, #map { width: 100%; height: 100%; }
          .custom-marker {
            background: none;
            border: none;
          }
          .marker-pin {
            width: 30px;
            height: 42px;
            position: relative;
          }
          .marker-pin svg {
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${lat}, ${lng}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);
          
          // Custom icon
          var customIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="marker-pin"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#EF4444"/><circle cx="12" cy="12" r="6" fill="white"/></svg></div>',
            iconSize: [30, 42],
            iconAnchor: [15, 42],
          });
          
          var marker = L.marker([${lat}, ${lng}], { 
            icon: customIcon,
            draggable: true 
          }).addTo(map);
          
          // Handle marker drag
          marker.on('dragend', function(e) {
            var pos = marker.getLatLng();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'locationSelected',
              lat: pos.lat,
              lng: pos.lng
            }));
          });
          
          // Handle map click
          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'locationSelected',
              lat: e.latlng.lat,
              lng: e.latlng.lng
            }));
          });
        </script>
      </body>
      </html>
    `;
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
        {/* Map Section */}
        <View style={styles.section}>
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Fine-tune Location</Text>
            <Text style={styles.mapHint}>Drag pin or tap map to adjust</Text>
          </View>
          
          <View style={styles.mapContainer}>
            <WebView
              key={mapKey}
              ref={webViewRef}
              source={{ html: getMapHTML() }}
              style={styles.map}
              scrollEnabled={false}
              onMessage={handleWebViewMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
            />
          </View>
          
          {/* Selected Location Display */}
          {pinLocation && (
            <View style={styles.selectedLocationCard}>
              <View style={styles.selectedLocationInfo}>
                <Ionicons name="location" size={20} color="#EF4444" />
                <Text style={styles.selectedLocationText} numberOfLines={2}>
                  {pinLocation.address}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.confirmLocationButton}
                onPress={selectPinLocation}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.confirmLocationText}>Use</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
            <Text style={styles.sectionTitle}>Currently Active</Text>
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
    flex: 1,
  },
  selectedLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedLocationInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedLocationText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  confirmLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmLocationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 4,
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
