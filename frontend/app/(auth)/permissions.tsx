import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAppStore } from '../store';

export default function PermissionsScreen() {
  const router = useRouter();
  const { setLocationPermissionChecked, setUserLocation } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Prevent going back without making a choice
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      skipPermission();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const requestLocationPermission = async () => {
    setIsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        setLocationPermissionChecked(true);
        
        // Get current location
        try {
          const loc = await Location.getCurrentPositionAsync({});
          const [address] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          
          const locationStr = [address?.district, address?.city, address?.region]
            .filter(Boolean)
            .join(', ');
          
          setUserLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            address: locationStr || 'Current Location',
          });
        } catch (e) {
          console.log('Could not get location details');
        }
        
        setTimeout(() => {
          router.replace('/(main)/home');
        }, 800);
      } else {
        Alert.alert(
          'Permission Required',
          'Location permission helps us show nearby helpers and create location-based wishes. You can enable it later in settings.',
          [
            { text: 'Skip for now', onPress: skipPermission },
            { text: 'Try Again', onPress: requestLocationPermission },
          ]
        );
      }
    } catch (error) {
      console.error('Location permission error:', error);
      Alert.alert('Error', 'Failed to request location permission');
    } finally {
      setIsLoading(false);
    }
  };

  const skipPermission = () => {
    setLocationPermissionChecked(true);
    router.replace('/(main)/home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={50} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Enable Location</Text>
        <Text style={styles.subtitle}>
          QuickWish uses your location to show nearby helpers and let you create wishes in your area.
        </Text>

        <View style={styles.featuresBox}>
          <View style={styles.featureRow}>
            <Ionicons name="navigate" size={24} color="#6366F1" />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Find Nearby Helpers</Text>
              <Text style={styles.featureDesc}>Connect with helpers in your vicinity</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="map" size={24} color="#6366F1" />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Location-Based Wishes</Text>
              <Text style={styles.featureDesc}>Create wishes with your exact location</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="storefront" size={24} color="#6366F1" />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Local Businesses</Text>
              <Text style={styles.featureDesc}>Discover shops and services nearby</Text>
            </View>
          </View>
        </View>

        {locationGranted && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <Text style={styles.successText}>Location access granted!</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestLocationPermission}
          disabled={isLoading || locationGranted}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : locationGranted ? (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Enabled</Text>
            </>
          ) : (
            <>
              <Ionicons name="location" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Enable Location</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={skipPermission}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>

        <Text style={styles.privacyText}>
          Your location data is only used to improve your experience and is never shared without your consent.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  featuresBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  featureTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 14,
    color: '#6B7280',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
    marginLeft: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    color: '#6B7280',
  },
  privacyText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 'auto',
    paddingBottom: 24,
  },
});
