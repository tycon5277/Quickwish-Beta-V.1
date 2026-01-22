import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Image, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';
import { useAppStore } from '../../src/store';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://wishmarket.preview.emergentagent.com';

// Primary wish categories with examples and sub-categories
const WISH_TYPES = [
  { 
    id: 'delivery', 
    label: 'Delivery', 
    icon: 'bicycle', 
    desc: 'Get items delivered',
    example: 'Need groceries from local market',
    subCategories: null
  },
  { 
    id: 'ride_request', 
    label: 'Ride Request', 
    icon: 'car', 
    desc: 'Private vehicle rides',
    example: 'Need a ride to the airport',
    subCategories: [
      { id: 'bike', label: 'Bike', icon: 'bicycle' },
      { id: 'car', label: 'Car', icon: 'car' }
    ]
  },
  { 
    id: 'commercial_ride', 
    label: 'Commercial Ride', 
    icon: 'bus', 
    desc: 'Auto, taxi, transport',
    example: 'Need an auto to railway station',
    subCategories: [
      { id: 'auto', label: 'Auto Rickshaw', icon: 'trail-sign' },
      { id: 'taxi_car', label: 'Taxi Car', icon: 'car' },
      { id: 'mini_bus', label: 'Mini Bus', icon: 'bus' },
      { id: 'goods_small', label: 'Small Carrier', icon: 'cube', customIcon: 'single_box' },
      { id: 'goods_medium', label: 'Medium Carrier', icon: 'apps', customIcon: 'pyramid_boxes' },
      { id: 'goods_large', label: 'Large Carrier', icon: 'grid', customIcon: 'five_boxes' }
    ]
  },
  { 
    id: 'medicine_delivery', 
    label: 'Medicine Delivery', 
    icon: 'medkit', 
    desc: 'Urgent medicine needs',
    example: 'Need medicines from Apollo Pharmacy',
    subCategories: null
  },
  { 
    id: 'domestic_help', 
    label: 'Domestic Help', 
    icon: 'home', 
    desc: 'Cooking, cleaning, laundry',
    example: 'Need help with house cleaning',
    subCategories: null
  },
  { 
    id: 'construction', 
    label: 'Construction', 
    icon: 'construct', 
    desc: 'Building, repairs',
    example: 'Need help with wall painting',
    subCategories: null
  },
  { 
    id: 'home_maintenance', 
    label: 'Home Maintenance', 
    icon: 'hammer', 
    desc: 'Plumbing, electrical',
    example: 'Need plumber for tap repair',
    subCategories: null
  },
  { 
    id: 'errands', 
    label: 'Errands', 
    icon: 'walk', 
    desc: 'Run errands for you',
    example: 'Need someone to pay electricity bill',
    subCategories: null
  },
  { 
    id: 'companionship', 
    label: 'Companionship', 
    icon: 'people', 
    desc: 'Company, assistance',
    example: 'Looking for a chess partner',
    subCategories: null
  },
  { 
    id: 'others', 
    label: 'Others', 
    icon: 'ellipsis-horizontal', 
    desc: 'Other requests',
    example: 'Describe what you need help with',
    subCategories: null
  },
];

const MAX_VOICE_DURATION = 10;

interface VoiceNote {
  uri: string;
  duration: number;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

export default function CreateWishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { sessionToken, user } = useAuth();
  const { triggerWishesRefresh, userLocation } = useAppStore();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [wishType, setWishType] = useState(params.type as string || '');
  const [subCategory, setSubCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(userLocation);
  const [manualAddress, setManualAddress] = useState(userLocation?.address || '');
  const [radius, setRadius] = useState(5);
  const [remuneration, setRemuneration] = useState('');
  const [isImmediate, setIsImmediate] = useState(true);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  // Date/Time picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  // Audio recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Get selected wish type details
  const selectedType = WISH_TYPES.find(t => t.id === wishType);
  const hasSubCategories = selectedType?.subCategories && selectedType.subCategories.length > 0;

  // Custom Box Icon Component for carriers
  const BoxIcon = ({ type, color, size }: { type: string; color: string; size: number }) => {
    const boxSize = size * 0.35;
    const spacing = 2;
    
    if (type === 'single_box') {
      // Single box (cube)
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            width: boxSize * 1.2,
            height: boxSize * 1.2,
            backgroundColor: color,
            borderRadius: 3,
          }} />
        </View>
      );
    }
    
    if (type === 'pyramid_boxes') {
      // 3 boxes in pyramid (1 on top, 2 on bottom)
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{
              width: boxSize,
              height: boxSize,
              backgroundColor: color,
              borderRadius: 2,
              marginBottom: spacing,
            }} />
            <View style={{ flexDirection: 'row' }}>
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
                marginRight: spacing,
              }} />
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
              }} />
            </View>
          </View>
        </View>
      );
    }
    
    if (type === 'five_boxes') {
      // 5 boxes (2 on top, 3 on bottom)
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', marginBottom: spacing }}>
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
                marginRight: spacing,
              }} />
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
              }} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
                marginRight: spacing,
              }} />
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
                marginRight: spacing,
              }} />
              <View style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: color,
                borderRadius: 2,
              }} />
            </View>
          </View>
        </View>
      );
    }
    
    return <Ionicons name="cube" size={size} color={color} />;
  };

  useEffect(() => {
    if (!location) {
      getCurrentLocation();
    }
    // Load saved addresses
    if (user?.addresses) {
      setSavedAddresses(user.addresses);
    }
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
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

  // Image picker functions
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setAttachedImages([...attachedImages, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setAttachedImages([...attachedImages, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages(attachedImages.filter((_, i) => i !== index));
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow microphone access');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= MAX_VOICE_DURATION - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      
      if (uri && status.durationMillis) {
        const duration = Math.round(status.durationMillis / 1000);
        setVoiceNotes([...voiceNotes, { uri, duration }]);
      }
      
      setRecording(null);
      setRecordingDuration(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const playVoiceNote = async (index: number) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (playingIndex === index) {
        setPlayingIndex(null);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceNotes[index].uri },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
      setPlayingIndex(index);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingIndex(null);
        }
      });
    } catch (error) {
      console.error('Error playing voice note:', error);
    }
  };

  const removeVoiceNote = (index: number) => {
    if (playingIndex === index && soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
      setPlayingIndex(null);
    }
    setVoiceNotes(voiceNotes.filter((_, i) => i !== index));
  };

  // Date/Time picker handlers
  const handleDateConfirm = (date: Date) => {
    setTempDate(date);
    setShowDatePicker(false);
    setShowTimePicker(true);
  };

  const handleTimeConfirm = (time: Date) => {
    const finalDate = new Date(tempDate);
    finalDate.setHours(time.getHours());
    finalDate.setMinutes(time.getMinutes());
    setScheduledDate(finalDate);
    setShowTimePicker(false);
  };

  const formatScheduledDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleDateString('en-US', options);
  };

  const selectSavedAddress = (addr: SavedAddress) => {
    setLocation({
      lat: addr.lat || 0,
      lng: addr.lng || 0,
      address: addr.address,
    });
    setManualAddress(addr.address);
    setShowAddressPicker(false);
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
        sub_category: subCategory || null,
        title,
        description,
        location: location || { lat: 0, lng: 0, address: manualAddress || 'Not specified' },
        radius_km: radius,
        remuneration: parseFloat(remuneration),
        is_immediate: isImmediate,
        scheduled_time: isImmediate ? null : scheduledDate?.toISOString() || null,
        has_images: attachedImages.length > 0,
        has_voice_notes: voiceNotes.length > 0,
        image_count: attachedImages.length,
        voice_note_count: voiceNotes.length,
      };

      await axios.post(`${BACKEND_URL}/api/wishes`, wishData, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });

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

  const handleSelectType = (typeId: string) => {
    setWishType(typeId);
    setSubCategory(''); // Reset sub-category
    const type = WISH_TYPES.find(t => t.id === typeId);
    // If has sub-categories, stay on step 1 to show them
    if (!type?.subCategories) {
      setTimeout(() => setStep(2), 300);
    }
  };

  const handleSelectSubCategory = (subId: string) => {
    setSubCategory(subId);
    setTimeout(() => setStep(2), 300);
  };

  // Get dynamic placeholder text based on wish type and sub-category
  const getTitlePlaceholder = () => {
    if (!wishType) return 'Describe what you need';
    
    // Dynamic examples based on category and sub-category
    const placeholders: Record<string, Record<string, string> | string> = {
      delivery: 'e.g., "Need groceries from local market"',
      ride_request: {
        bike: 'e.g., "Need bike ride to office"',
        car: 'e.g., "Need car ride to airport"',
        default: 'e.g., "Need a ride to the airport"'
      },
      commercial_ride: {
        auto: 'e.g., "Need auto to railway station"',
        taxi_car: 'e.g., "Need taxi to the mall"',
        mini_bus: 'e.g., "Need mini bus for group travel"',
        goods_small: 'e.g., "Need small carrier for boxes"',
        goods_medium: 'e.g., "Need medium carrier for furniture"',
        goods_large: 'e.g., "Need large truck for shifting"',
        default: 'e.g., "Need transport for travel/goods"'
      },
      medicine_delivery: 'e.g., "Need medicines from Apollo Pharmacy"',
      domestic_help: 'e.g., "Need help with house cleaning"',
      construction: 'e.g., "Need help with wall painting"',
      home_maintenance: 'e.g., "Need plumber for tap repair"',
      errands: 'e.g., "Need someone to pay electricity bill"',
      companionship: 'e.g., "Looking for a chess partner"',
      others: 'e.g., "Describe what you need help with"'
    };

    const categoryPlaceholder = placeholders[wishType];
    
    if (typeof categoryPlaceholder === 'string') {
      return categoryPlaceholder;
    }
    
    if (typeof categoryPlaceholder === 'object') {
      return subCategory 
        ? (categoryPlaceholder[subCategory] || categoryPlaceholder.default)
        : categoryPlaceholder.default;
    }
    
    return 'Describe what you need';
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choose Your Wish</Text>
      <Text style={styles.stepSubtitle}>Select what type of help you need</Text>
      
      {/* Show sub-categories if a type with sub-categories is selected */}
      {wishType && hasSubCategories && !subCategory ? (
        <View>
          <TouchableOpacity 
            style={styles.backToCategories}
            onPress={() => setWishType('')}
          >
            <Ionicons name="arrow-back" size={18} color="#6366F1" />
            <Text style={styles.backToCategoriesText}>Back to categories</Text>
          </TouchableOpacity>
          
          <Text style={styles.subCategoryTitle}>Select {selectedType?.label} Type</Text>
          <View style={styles.subCategoryGrid}>
            {selectedType?.subCategories?.map((sub) => (
              <TouchableOpacity
                key={sub.id}
                style={[
                  styles.subCategoryCard,
                  subCategory === sub.id && styles.subCategoryCardSelected
                ]}
                onPress={() => handleSelectSubCategory(sub.id)}
              >
                <Ionicons
                  name={sub.icon as any}
                  size={28}
                  color={subCategory === sub.id ? '#fff' : '#6366F1'}
                />
                <Text style={[
                  styles.subCategoryLabel,
                  subCategory === sub.id && styles.subCategoryLabelSelected
                ]}>
                  {sub.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.typeGrid}>
          {WISH_TYPES.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.typeCard,
                wishType === type.id && styles.typeCardSelected
              ]}
              onPress={() => handleSelectType(type.id)}
            >
              <View style={[
                styles.typeIconContainer,
                wishType === type.id && styles.typeIconContainerSelected
              ]}>
                <Ionicons
                  name={type.icon as any}
                  size={24}
                  color={wishType === type.id ? '#fff' : '#6366F1'}
                />
              </View>
              <Text style={[
                styles.typeLabel,
                wishType === type.id && styles.typeLabelSelected
              ]}>
                {type.label}
              </Text>
              <Text style={styles.typeDesc} numberOfLines={1}>{type.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Describe Your Wish</Text>
      <Text style={styles.stepSubtitle}>Provide details about what you need</Text>
      
      {/* Title Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>My Wish *</Text>
        <TextInput
          style={styles.textInput}
          placeholder={getTitlePlaceholder()}
          placeholderTextColor="#9CA3AF"
          value={title}
          onChangeText={setTitle}
        />
      </View>
      
      {/* Description Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Describe Your Wish (Optional)</Text>
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
        
        {/* Attachment Options */}
        <View style={styles.attachmentBar}>
          <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
            <Ionicons name="image-outline" size={20} color="#6366F1" />
            <Text style={styles.attachmentButtonText}>Gallery</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.attachmentButton} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={20} color="#6366F1" />
            <Text style={styles.attachmentButtonText}>Camera</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.attachmentButton, isRecording && styles.attachmentButtonRecording]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Ionicons 
              name={isRecording ? "stop-circle" : "mic-outline"} 
              size={20} 
              color={isRecording ? "#EF4444" : "#6366F1"} 
            />
            <Text style={[styles.attachmentButtonText, isRecording && styles.recordingText]}>
              {isRecording ? `${recordingDuration}s` : 'Voice'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recording Progress */}
        {isRecording && (
          <View style={styles.recordingProgress}>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingLabel}>Recording... ({MAX_VOICE_DURATION - recordingDuration}s left)</Text>
            </View>
            <View style={styles.recordingProgressBar}>
              <View style={[styles.recordingProgressFill, { width: `${(recordingDuration / MAX_VOICE_DURATION) * 100}%` }]} />
            </View>
          </View>
        )}
      </View>

      {/* Attached Images */}
      {attachedImages.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Attached Images ({attachedImages.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
            {attachedImages.map((uri, index) => (
              <View key={index} style={styles.imageContainer}>
                <Image source={{ uri }} style={styles.attachedImage} />
                <TouchableOpacity style={styles.removeImageButton} onPress={() => removeImage(index)}>
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Voice Notes */}
      {voiceNotes.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Voice Notes ({voiceNotes.length})</Text>
          {voiceNotes.map((note, index) => (
            <View key={index} style={styles.voiceNoteItem}>
              <TouchableOpacity style={styles.voiceNotePlayButton} onPress={() => playVoiceNote(index)}>
                <Ionicons name={playingIndex === index ? "pause" : "play"} size={18} color="#fff" />
              </TouchableOpacity>
              <View style={styles.voiceNoteInfo}>
                <Text style={styles.voiceNoteName}>Voice Note {index + 1}</Text>
                <Text style={styles.voiceNoteDuration}>{note.duration}s</Text>
              </View>
              <TouchableOpacity style={styles.voiceNoteRemoveButton} onPress={() => removeVoiceNote(index)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Location & Visibility</Text>
      <Text style={styles.stepSubtitle}>Set where you need help</Text>
      
      {/* Current Location with Mini Map */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Your Location</Text>
        <TouchableOpacity 
          style={styles.locationMapContainer}
          onPress={() => router.push('/location-picker')}
        >
          <View style={styles.miniMapPlaceholder}>
            <Ionicons name="map" size={40} color="#6366F1" />
            <View style={styles.mapPin}>
              <Ionicons name="location" size={24} color="#EF4444" />
            </View>
          </View>
          <View style={styles.locationDetails}>
            <Text style={styles.locationText} numberOfLines={2}>
              {location?.address || manualAddress || 'Tap to set location'}
            </Text>
            <Text style={styles.locationHint}>Tap to fine-tune with map</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Saved Addresses */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Or Select Saved Address</Text>
        {savedAddresses.length > 0 ? (
          <View style={styles.savedAddressList}>
            {savedAddresses.slice(0, 3).map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[
                  styles.savedAddressItem,
                  location?.address === addr.address && styles.savedAddressItemSelected
                ]}
                onPress={() => selectSavedAddress(addr)}
              >
                <Ionicons 
                  name={addr.label.toLowerCase() === 'home' ? 'home' : addr.label.toLowerCase() === 'office' ? 'business' : 'location'} 
                  size={18} 
                  color={location?.address === addr.address ? '#fff' : '#6366F1'} 
                />
                <View style={styles.savedAddressInfo}>
                  <Text style={[styles.savedAddressLabel, location?.address === addr.address && styles.savedAddressLabelSelected]}>
                    {addr.label}
                  </Text>
                  <Text style={[styles.savedAddressText, location?.address === addr.address && styles.savedAddressTextSelected]} numberOfLines={1}>
                    {addr.address}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.addAddressButton}
            onPress={() => router.push('/account/addresses')}
          >
            <Ionicons name="add-circle-outline" size={20} color="#6366F1" />
            <Text style={styles.addAddressText}>Add a saved address</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Manual Address Entry */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Or Enter Manually</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Type full address..."
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
      
      {/* Visibility Radius */}
      <View style={styles.inputGroup}>
        <View style={styles.radiusHeader}>
          <Text style={styles.inputLabel}>Visibility Radius</Text>
        </View>
        
        {/* Enhanced Explanation Card */}
        <View style={styles.radiusExplainerCard}>
          <View style={styles.radiusExplainerIcon}>
            <Ionicons name="radio-outline" size={20} color="#6366F1" />
          </View>
          <View style={styles.radiusExplainerContent}>
            <Text style={styles.radiusExplainerTitle}>Who can see your wish?</Text>
            <Text style={styles.radiusExplainerText}>
              Only Fulfillment Agents within <Text style={styles.radiusHighlight}>{radius} km</Text> of your location will be able to view and respond to this wish.
            </Text>
            <Text style={styles.radiusExplainerHint}>
              💡 Tip: Larger radius = more potential helpers, but may take longer to reach you
            </Text>
          </View>
        </View>
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
        <View style={styles.radiusScale}>
          <Text style={styles.radiusScaleText}>1 km</Text>
          <View style={styles.radiusSliderTrack}>
            <View style={[styles.radiusSliderFill, { width: `${((radius - 1) / 49) * 100}%` }]} />
          </View>
          <Text style={styles.radiusScaleText}>50 km</Text>
        </View>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Payment & Timing</Text>
      <Text style={styles.stepSubtitle}>Set your offer and schedule</Text>
      
      {/* Remuneration */}
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
      
      {/* Timing Options */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>When do you need help?</Text>
        <View style={styles.timingOptions}>
          <TouchableOpacity
            style={[styles.timingOption, isImmediate && styles.timingOptionSelected]}
            onPress={() => {
              setIsImmediate(true);
              setScheduledDate(null);
            }}
          >
            <Ionicons name="flash" size={24} color={isImmediate ? '#fff' : '#F59E0B'} />
            <Text style={[styles.timingLabel, isImmediate && styles.timingLabelSelected]}>Now</Text>
            <Text style={[styles.timingDesc, isImmediate && styles.timingDescSelected]}>Need help ASAP</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.timingOption, !isImmediate && styles.timingOptionSelected]}
            onPress={() => setIsImmediate(false)}
          >
            <Ionicons name="calendar" size={24} color={!isImmediate ? '#fff' : '#6366F1'} />
            <Text style={[styles.timingLabel, !isImmediate && styles.timingLabelSelected]}>Schedule</Text>
            <Text style={[styles.timingDesc, !isImmediate && styles.timingDescSelected]}>Pick date & time</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Schedule Picker */}
      {!isImmediate && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Select Date & Time</Text>
          <TouchableOpacity 
            style={styles.schedulePicker}
            onPress={() => setShowDatePicker(true)}
          >
            <View style={styles.scheduleIconContainer}>
              <Ionicons name="calendar-outline" size={24} color="#6366F1" />
            </View>
            <View style={styles.scheduleInfo}>
              {scheduledDate ? (
                <>
                  <Text style={styles.scheduleDate}>{formatScheduledDate(scheduledDate)}</Text>
                  <Text style={styles.scheduleTap}>Tap to change</Text>
                </>
              ) : (
                <>
                  <Text style={styles.schedulePrompt}>Tap to select date & time</Text>
                  <Text style={styles.scheduleTap}>Calendar will open</Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Wish Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Category:</Text>
          <Text style={styles.summaryValue}>
            {selectedType?.label}{subCategory ? ` (${selectedType?.subCategories?.find(s => s.id === subCategory)?.label})` : ''}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Title:</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{title || '-'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Visibility:</Text>
          <Text style={styles.summaryValue}>{radius} km radius</Text>
        </View>
        {attachedImages.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Images:</Text>
            <Text style={styles.summaryValue}>{attachedImages.length} attached</Text>
          </View>
        )}
        {voiceNotes.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Voice:</Text>
            <Text style={styles.summaryValue}>{voiceNotes.length} note(s)</Text>
          </View>
        )}
      </View>

      {/* Date Picker Modal */}
      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={() => setShowDatePicker(false)}
        minimumDate={new Date()}
      />

      {/* Time Picker Modal */}
      <DateTimePickerModal
        isVisible={showTimePicker}
        mode="time"
        onConfirm={handleTimeConfirm}
        onCancel={() => setShowTimePicker(false)}
      />
    </View>
  );

  const canProceed = () => {
    if (step === 1) {
      if (hasSubCategories && !subCategory) return false;
      return !!wishType;
    }
    if (step === 2) return !!title;
    return true;
  };

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
          <TouchableOpacity style={styles.backStepButton} onPress={() => setStep(step - 1)}>
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text style={styles.backStepText}>Back</Text>
          </TouchableOpacity>
        )}
        
        {step < 4 ? (
          <TouchableOpacity
            style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]}
            onPress={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.nextButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, (!title || !remuneration) && styles.submitButtonDisabled]}
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  closeButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  stepIndicator: { width: 44, alignItems: 'center' },
  stepText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  progressBar: { height: 4, backgroundColor: '#E5E7EB' },
  progressFill: { height: '100%', backgroundColor: '#6366F1' },
  content: { flex: 1 },
  stepContent: { padding: 20 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  stepSubtitle: { fontSize: 15, color: '#6B7280', marginBottom: 20 },
  
  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  typeCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  typeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeIconContainerSelected: { backgroundColor: '#6366F1' },
  typeLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  typeLabelSelected: { color: '#6366F1' },
  typeDesc: { fontSize: 11, color: '#9CA3AF' },
  
  // Sub-categories
  backToCategories: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backToCategoriesText: { fontSize: 14, color: '#6366F1', marginLeft: 6 },
  subCategoryTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
  subCategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  subCategoryCard: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  subCategoryCardSelected: { borderColor: '#6366F1', backgroundColor: '#6366F1' },
  subCategoryLabel: { fontSize: 13, fontWeight: '500', color: '#374151', marginTop: 8, textAlign: 'center' },
  subCategoryLabelSelected: { color: '#fff' },
  
  // Inputs
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: { height: 90, paddingTop: 12 },
  
  // Attachments
  attachmentBar: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  attachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  attachmentButtonRecording: { backgroundColor: '#FEE2E2' },
  attachmentButtonText: { fontSize: 12, color: '#6366F1', marginLeft: 4, fontWeight: '500' },
  recordingText: { color: '#EF4444' },
  recordingProgress: { marginTop: 10, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8 },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6 },
  recordingLabel: { fontSize: 12, color: '#EF4444', fontWeight: '500' },
  recordingProgressBar: { height: 3, backgroundColor: '#FECACA', borderRadius: 2 },
  recordingProgressFill: { height: '100%', backgroundColor: '#EF4444', borderRadius: 2 },
  
  // Images
  imagesScroll: { marginTop: 6 },
  imageContainer: { position: 'relative', marginRight: 10 },
  attachedImage: { width: 80, height: 80, borderRadius: 8 },
  removeImageButton: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 12 },
  
  // Voice notes
  voiceNoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  voiceNotePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceNoteInfo: { flex: 1, marginLeft: 10 },
  voiceNoteName: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  voiceNoteDuration: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  voiceNoteRemoveButton: { padding: 6 },
  
  // Location
  locationMapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  miniMapPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mapPin: { position: 'absolute', top: 8 },
  locationDetails: { flex: 1, marginLeft: 12 },
  locationText: { fontSize: 14, color: '#1F2937', fontWeight: '500' },
  locationHint: { fontSize: 11, color: '#6366F1', marginTop: 4 },
  
  // Saved addresses
  savedAddressList: { marginTop: 4 },
  savedAddressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  savedAddressItemSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  savedAddressInfo: { flex: 1, marginLeft: 10 },
  savedAddressLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  savedAddressLabelSelected: { color: '#fff' },
  savedAddressText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  savedAddressTextSelected: { color: 'rgba(255,255,255,0.8)' },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
  },
  addAddressText: { fontSize: 14, color: '#6366F1', marginLeft: 6 },
  
  // Radius
  radiusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoButton: { marginLeft: 6 },
  
  // Enhanced Radius Explainer Card
  radiusExplainerCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  radiusExplainerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radiusExplainerContent: { flex: 1 },
  radiusExplainerTitle: { fontSize: 14, fontWeight: '600', color: '#4338CA', marginBottom: 4 },
  radiusExplainerText: { fontSize: 13, color: '#4B5563', lineHeight: 18, marginBottom: 6 },
  radiusHighlight: { fontWeight: '700', color: '#6366F1' },
  radiusExplainerHint: { fontSize: 11, color: '#6B7280', fontStyle: 'italic' },
  
  radiusExplainer: { fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 18 },
  radiusContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  radiusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusDisplay: { flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 20 },
  radiusValue: { fontSize: 32, fontWeight: '700', color: '#6366F1' },
  radiusUnit: { fontSize: 16, color: '#6B7280', marginLeft: 4 },
  radiusScale: { flexDirection: 'row', alignItems: 'center' },
  radiusScaleText: { fontSize: 11, color: '#9CA3AF', width: 40 },
  radiusSliderTrack: { flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginHorizontal: 8 },
  radiusSliderFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 2 },
  
  // Remuneration
  remunerationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currencySymbol: { fontSize: 22, fontWeight: '600', color: '#10B981' },
  remunerationTextInput: { flex: 1, fontSize: 22, fontWeight: '600', color: '#1F2937', paddingVertical: 12, marginLeft: 6 },
  inputHint: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  
  // Timing
  timingOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  timingOption: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timingOptionSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  timingLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginTop: 8 },
  timingLabelSelected: { color: '#fff' },
  timingDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  timingDescSelected: { color: 'rgba(255,255,255,0.8)' },
  
  // Schedule picker
  schedulePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  scheduleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleInfo: { flex: 1, marginLeft: 12 },
  scheduleDate: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  schedulePrompt: { fontSize: 14, color: '#6B7280' },
  scheduleTap: { fontSize: 11, color: '#6366F1', marginTop: 2 },
  
  // Summary
  summaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: '#166534', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', marginBottom: 6 },
  summaryLabel: { fontSize: 13, color: '#15803D', width: 80 },
  summaryValue: { flex: 1, fontSize: 13, color: '#166534', fontWeight: '500' },
  
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  backStepButton: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  backStepText: { fontSize: 15, color: '#6B7280', marginLeft: 6 },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  nextButtonDisabled: { backgroundColor: '#D1D5DB' },
  nextButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', marginRight: 6 },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  submitButtonDisabled: { backgroundColor: '#D1D5DB' },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', marginLeft: 6 },
});
