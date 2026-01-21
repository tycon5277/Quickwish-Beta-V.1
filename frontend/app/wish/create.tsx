import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';
import { useAppStore } from '../store';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-1.preview.emergentagent.com';

const WISH_TYPES = [
  { id: 'delivery', label: 'Delivery', icon: 'bicycle', desc: 'Get items delivered' },
  { id: 'ride_request', label: 'Ride Request', icon: 'car', desc: 'Need a ride' },
  { id: 'medicine_delivery', label: 'Medicine', icon: 'medkit', desc: 'Urgent medicine delivery' },
  { id: 'household_chores', label: 'Household', icon: 'home', desc: 'Home cleaning, repairs' },
  { id: 'errands', label: 'Errands', icon: 'walk', desc: 'Run errands for you' },
  { id: 'domestic_help', label: 'Domestic Help', icon: 'hand-left', desc: 'Cooking, laundry, etc.' },
  { id: 'construction', label: 'Construction', icon: 'construct', desc: 'Minor repairs, painting' },
  { id: 'companionship', label: 'Companionship', icon: 'people', desc: 'Chess partner, walking buddy' },
];

export default function CreateWishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { sessionToken } = useAuth();
  const { triggerWishesRefresh, userLocation } = useAppStore();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [wishType, setWishType] = useState(params.type as string || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(userLocation);
  const [manualAddress, setManualAddress] = useState(userLocation?.address || '');
  const [radius, setRadius] = useState(5);
  const [remuneration, setRemuneration] = useState('');
  const [isImmediate, setIsImmediate] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');

  useEffect(() => {
    if (!location) {
      getCurrentLocation();
    }
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      
      const addressStr = [
        address?.name,
        address?.street,
        address?.district,
        address?.city,
      ].filter(Boolean).join(', ');
      
      setLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        address: addressStr || 'Current Location',
      });
      setManualAddress(addressStr || '');
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const handleSubmit = async () => {
    if (!wishType || !title || !remuneration) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const wishData = {
        wish_type: wishType,
        title,
        description,
        location: location || { lat: 0, lng: 0, address: manualAddress || 'Not specified' },
        radius_km: radius,
        remuneration: parseFloat(remuneration),
        is_immediate: isImmediate,
        scheduled_time: isImmediate ? null : scheduledDate || null,
      };

      await axios.post(`${BACKEND_URL}/api/wishes`, wishData, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });

      // Trigger refresh on home screen
      triggerWishesRefresh();

      Alert.alert(
        'Wish Created!',
        'Your wish has been published. Nearby helpers will be notified.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error creating wish:', error);
      Alert.alert('Error', 'Failed to create wish. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What type of help do you need?</Text>
      <Text style={styles.stepSubtitle}>Select a category for your wish</Text>
      
      <View style={styles.typeGrid}>
        {WISH_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              wishType === type.id && styles.typeCardSelected
            ]}
            onPress={() => setWishType(type.id)}
          >
            <View style={[
              styles.typeIconContainer,
              wishType === type.id && styles.typeIconContainerSelected
            ]}>
              <Ionicons
                name={type.icon as any}
                size={28}
                color={wishType === type.id ? '#fff' : '#6366F1'}
              />
            </View>
            <Text style={[
              styles.typeLabel,
              wishType === type.id && styles.typeLabelSelected
            ]}>
              {type.label}
            </Text>
            <Text style={styles.typeDesc}>{type.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Describe your wish</Text>
      <Text style={styles.stepSubtitle}>Provide details about what you need</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Need groceries from market"
          placeholderTextColor="#9CA3AF"
          value={title}
          onChangeText={setTitle}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          placeholder="Add more details about your wish..."
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Location & Radius</Text>
      <Text style={styles.stepSubtitle}>Set where you need help</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Your Location</Text>
        <View style={styles.locationDisplay}>
          <Ionicons name="location" size={20} color="#6366F1" />
          <Text style={styles.locationText} numberOfLines={2}>
            {location?.address || manualAddress || 'Location not set'}
          </Text>
          <TouchableOpacity onPress={getCurrentLocation}>
            <Ionicons name="refresh" size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Or Enter Address Manually</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter your address"
          placeholderTextColor="#9CA3AF"
          value={manualAddress}
          onChangeText={(text) => {
            setManualAddress(text);
            if (text) {
              setLocation({ lat: 0, lng: 0, address: text });
            }
          }}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Search Radius: {radius} km</Text>
        <View style={styles.radiusContainer}>
          <TouchableOpacity
            style={styles.radiusButton}
            onPress={() => setRadius(Math.max(1, radius - 1))}
          >
            <Ionicons name="remove" size={24} color="#6366F1" />
          </TouchableOpacity>
          <View style={styles.radiusDisplay}>
            <Text style={styles.radiusValue}>{radius}</Text>
            <Text style={styles.radiusUnit}>km</Text>
          </View>
          <TouchableOpacity
            style={styles.radiusButton}
            onPress={() => setRadius(Math.min(50, radius + 1))}
          >
            <Ionicons name="add" size={24} color="#6366F1" />
          </TouchableOpacity>
        </View>
        <Text style={styles.radiusHint}>Helpers within this radius will see your wish</Text>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Remuneration & Timing</Text>
      <Text style={styles.stepSubtitle}>Set your offer and when you need help</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Your Offer *</Text>
        <View style={styles.remunerationInput}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.remunerationTextInput}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            value={remuneration}
            onChangeText={setRemuneration}
            keyboardType="numeric"
          />
        </View>
        <Text style={styles.inputHint}>Fair compensation encourages quick responses</Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>When do you need help?</Text>
        <View style={styles.timingOptions}>
          <TouchableOpacity
            style={[styles.timingOption, isImmediate && styles.timingOptionSelected]}
            onPress={() => setIsImmediate(true)}
          >
            <Ionicons
              name="flash"
              size={24}
              color={isImmediate ? '#fff' : '#F59E0B'}
            />
            <Text style={[styles.timingLabel, isImmediate && styles.timingLabelSelected]}>
              Immediately
            </Text>
            <Text style={[styles.timingDesc, isImmediate && styles.timingDescSelected]}>
              Need help now
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.timingOption, !isImmediate && styles.timingOptionSelected]}
            onPress={() => setIsImmediate(false)}
          >
            <Ionicons
              name="calendar"
              size={24}
              color={!isImmediate ? '#fff' : '#6366F1'}
            />
            <Text style={[styles.timingLabel, !isImmediate && styles.timingLabelSelected]}>
              Schedule
            </Text>
            <Text style={[styles.timingDesc, !isImmediate && styles.timingDescSelected]}>
              For later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {!isImmediate && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Scheduled Date & Time</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., Tomorrow at 10 AM"
            placeholderTextColor="#9CA3AF"
            value={scheduledDate}
            onChangeText={setScheduledDate}
          />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Make a Wish</Text>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepText}>{step}/4</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity
            style={styles.backStepButton}
            onPress={() => setStep(step - 1)}
          >
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text style={styles.backStepText}>Back</Text>
          </TouchableOpacity>
        )}
        
        {step < 4 ? (
          <TouchableOpacity
            style={[
              styles.nextButton,
              (step === 1 && !wishType) && styles.nextButtonDisabled
            ]}
            onPress={() => setStep(step + 1)}
            disabled={step === 1 && !wishType}
          >
            <Text style={styles.nextButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!title || !remuneration) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={isLoading || !title || !remuneration}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Publish Wish</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  closeButton: {
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
  stepIndicator: {
    width: 44,
    alignItems: 'center',
  },
  stepText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
  },
  content: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  typeCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  typeIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeIconContainerSelected: {
    backgroundColor: '#6366F1',
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  typeLabelSelected: {
    color: '#6366F1',
  },
  typeDesc: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  inputGroup: {
    marginBottom: 24,
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
    height: 120,
    paddingTop: 14,
  },
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
  },
  radiusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  radiusButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginHorizontal: 24,
  },
  radiusValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#6366F1',
  },
  radiusUnit: {
    fontSize: 18,
    color: '#6B7280',
    marginLeft: 4,
  },
  radiusHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },
  remunerationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#10B981',
  },
  remunerationTextInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 14,
    marginLeft: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  timingOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timingOption: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timingOptionSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  timingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
  },
  timingLabelSelected: {
    color: '#fff',
  },
  timingDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  timingDescSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  backStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  backStepText: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 8,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  nextButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
});
