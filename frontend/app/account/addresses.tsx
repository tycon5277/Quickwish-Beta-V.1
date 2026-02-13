import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://order-lifecycle-8.preview.emergentagent.com';

interface Address {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

export default function AddressesScreen() {
  const router = useRouter();
  const { user, sessionToken, refreshUser } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>(user?.addresses || []);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (user?.addresses) {
      setAddresses(user.addresses);
    }
  }, [user]);

  const handleAddAddress = async () => {
    if (!newLabel.trim() || !newAddress.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsAdding(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/users/addresses`,
        {
          label: newLabel.trim(),
          address: newAddress.trim(),
        },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      await refreshUser();
      setShowAddModal(false);
      setNewLabel('');
      setNewAddress('');
      Alert.alert('Success', 'Address added successfully');
    } catch (error) {
      console.error('Error adding address:', error);
      Alert.alert('Error', 'Failed to add address');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${BACKEND_URL}/api/users/addresses/${addressId}`,
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              await refreshUser();
              Alert.alert('Success', 'Address deleted');
            } catch (error) {
              console.error('Error deleting address:', error);
              Alert.alert('Error', 'Failed to delete address');
            }
          },
        },
      ]
    );
  };

  const useCurrentLocation = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location access');
        return;
      }
      
      const loc = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      
      if (address) {
        const addressStr = [
          address.name,
          address.street,
          address.district,
          address.city,
          address.region,
        ].filter(Boolean).join(', ');
        setNewAddress(addressStr);
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Could not get current location');
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
        <Text style={styles.headerTitle}>My Addresses</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No saved addresses</Text>
            <Text style={styles.emptyStateSubtext}>
              Add your frequently used addresses for quick access
            </Text>
            <TouchableOpacity
              style={styles.addFirstButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addFirstButtonText}>Add Address</Text>
            </TouchableOpacity>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.addressCard}>
              <View style={styles.addressIcon}>
                <Ionicons name={getLabelIcon(addr.label) as any} size={24} color="#6366F1" />
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>{addr.label}</Text>
                <Text style={styles.addressText} numberOfLines={2}>{addr.address}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteAddress(addr.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Quick Add Suggestions */}
        {addresses.length > 0 && addresses.length < 5 && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsTitle}>Quick Add</Text>
            <View style={styles.suggestionsRow}>
              {!addresses.find(a => a.label.toLowerCase() === 'home') && (
                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => {
                    setNewLabel('Home');
                    setShowAddModal(true);
                  }}
                >
                  <Ionicons name="home-outline" size={16} color="#6366F1" />
                  <Text style={styles.suggestionText}>Home</Text>
                </TouchableOpacity>
              )}
              {!addresses.find(a => a.label.toLowerCase() === 'office') && (
                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => {
                    setNewLabel('Office');
                    setShowAddModal(true);
                  }}
                >
                  <Ionicons name="business-outline" size={16} color="#6366F1" />
                  <Text style={styles.suggestionText}>Office</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add Address Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Address</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Label</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Home, Office, Gym"
                placeholderTextColor="#9CA3AF"
                value={newLabel}
                onChangeText={setNewLabel}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Enter full address"
                placeholderTextColor="#9CA3AF"
                value={newAddress}
                onChangeText={setNewAddress}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={styles.useLocationButton}
              onPress={useCurrentLocation}
            >
              <Ionicons name="locate" size={20} color="#6366F1" />
              <Text style={styles.useLocationText}>Use Current Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, isAdding && styles.saveButtonDisabled]}
              onPress={handleAddAddress}
              disabled={isAdding}
            >
              {isAdding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Address</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  addButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
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
    paddingHorizontal: 20,
  },
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  addFirstButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  addressIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressContent: {
    flex: 1,
    marginLeft: 12,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  deleteButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsSection: {
    marginTop: 24,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  suggestionsRow: {
    flexDirection: 'row',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  suggestionText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '500',
    marginLeft: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    height: 100,
    paddingTop: 14,
  },
  useLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  useLocationText: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '500',
    marginLeft: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
});
