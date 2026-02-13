import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';
import { useAppStore } from '../../src/store';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://order-lifecycle-8.preview.emergentagent.com';

const WISH_TYPES = [
  { id: 'delivery', label: 'Delivery', icon: 'bicycle' },
  { id: 'ride_request', label: 'Ride Request', icon: 'car' },
  { id: 'commercial_ride', label: 'Commercial Ride', icon: 'bus' },
  { id: 'medicine_delivery', label: 'Medicine Delivery', icon: 'medkit' },
  { id: 'domestic_help', label: 'Domestic Help', icon: 'home' },
  { id: 'construction', label: 'Construction', icon: 'construct' },
  { id: 'home_maintenance', label: 'Home Maintenance', icon: 'hammer' },
  { id: 'errands', label: 'Errands', icon: 'walk' },
  { id: 'companionship', label: 'Companionship', icon: 'people' },
  { id: 'others', label: 'Others', icon: 'ellipsis-horizontal' },
];

interface VoiceNote {
  uri: string;
  duration: number;
}

interface Wish {
  wish_id: string;
  wish_type: string;
  sub_category?: string;
  title: string;
  description?: string;
  status: string;
  remuneration: number;
  is_immediate: boolean;
  scheduled_time?: string;
  radius_km: number;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  created_at: string;
  has_images?: boolean;
  has_voice_notes?: boolean;
  image_count?: number;
  voice_note_count?: number;
  images?: string[];
  voice_notes?: VoiceNote[];
}

export default function WishDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams();
  const { sessionToken } = useAuth();
  const { triggerWishesRefresh } = useAppStore();
  
  const [wish, setWish] = useState<Wish | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRemuneration, setEditRemuneration] = useState('');
  const [editRadius, setEditRadius] = useState(5);

  const fetchWish = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/wishes/${id}`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setWish(response.data);
      setEditTitle(response.data.title);
      setEditDescription(response.data.description || '');
      setEditRemuneration(response.data.remuneration.toString());
      setEditRadius(response.data.radius_km);
    } catch (error) {
      console.error('Error fetching wish:', error);
      Alert.alert('Error', 'Failed to load wish details');
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, id]);

  useEffect(() => {
    fetchWish();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [fetchWish]);

  const playVoiceNote = async (index: number) => {
    if (!wish?.voice_notes) return;
    
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
        { uri: wish.voice_notes[index].uri },
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

  const handleSave = async () => {
    if (!wish || !sessionToken) return;
    
    setIsSaving(true);
    try {
      await axios.put(
        `${BACKEND_URL}/api/wishes/${wish.wish_id}`,
        {
          wish_type: wish.wish_type,
          title: editTitle,
          description: editDescription,
          location: wish.location,
          radius_km: editRadius,
          remuneration: parseFloat(editRemuneration),
          is_immediate: wish.is_immediate,
          scheduled_time: wish.scheduled_time,
        },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      triggerWishesRefresh();
      setIsEditing(false);
      fetchWish();
      Alert.alert('Success', 'Wish updated successfully');
    } catch (error: any) {
      console.error('Error updating wish:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update wish');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = () => {
    Alert.alert(
      'Complete Wish',
      'Are you sure you want to mark this wish as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await axios.put(
                `${BACKEND_URL}/api/wishes/${wish?.wish_id}/complete`,
                {},
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              triggerWishesRefresh();
              Alert.alert('Success', 'Wish marked as completed');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to complete wish');
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Wish',
      'Are you sure you want to delete this wish? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(
                `${BACKEND_URL}/api/wishes/${wish?.wish_id}`,
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              triggerWishesRefresh();
              Alert.alert('Success', 'Wish deleted');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete wish');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'accepted': return '#3B82F6';
      case 'in_progress': return '#8B5CF6';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getWishTypeInfo = (type: string) => {
    return WISH_TYPES.find(t => t.id === type) || { id: type, label: type, icon: 'help-circle' };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      </SafeAreaView>
    );
  }

  if (!wish) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorText}>Wish not found</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typeInfo = getWishTypeInfo(wish.wish_type);
  const canEdit = wish.status === 'pending';
  const fromWishbox = from === 'wishbox';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wish Details</Text>
        {canEdit && !isEditing && (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerButton}>
            <Ionicons name="pencil" size={22} color="#6366F1" />
          </TouchableOpacity>
        )}
        {isEditing && (
          <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        )}
        {!canEdit && <View style={styles.headerButton} />}
      </View>

      <ScrollView style={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: getStatusColor(wish.status) + '15' }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(wish.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(wish.status) }]}>
            {wish.status.replace('_', ' ').toUpperCase()}
          </Text>
          {wish.is_immediate && (
            <View style={styles.immediateBadge}>
              <Ionicons name="flash" size={14} color="#F59E0B" />
              <Text style={styles.immediateText}>Immediate</Text>
            </View>
          )}
        </View>

        {/* Type & Title */}
        <View style={styles.mainCard}>
          <View style={styles.typeRow}>
            <View style={styles.typeIcon}>
              <Ionicons name={typeInfo.icon as any} size={28} color="#6366F1" />
            </View>
            <View style={styles.typeInfo}>
              <Text style={styles.typeLabel}>{typeInfo.label}</Text>
              {wish.sub_category && (
                <Text style={styles.subCategoryText}>{wish.sub_category}</Text>
              )}
              <Text style={styles.dateText}>Created {formatDate(wish.created_at)}</Text>
            </View>
          </View>

          {isEditing ? (
            <View style={styles.editSection}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Wish title"
              />
            </View>
          ) : (
            <Text style={styles.title}>{wish.title}</Text>
          )}

          {isEditing ? (
            <View style={styles.editSection}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Description (optional)"
                multiline
                numberOfLines={3}
              />
            </View>
          ) : wish.description ? (
            <Text style={styles.description}>{wish.description}</Text>
          ) : null}
        </View>

        {/* Attached Images */}
        {wish.has_images && wish.image_count && wish.image_count > 0 && (
          <View style={styles.attachmentCard}>
            <View style={styles.attachmentHeader}>
              <Ionicons name="images" size={20} color="#6366F1" />
              <Text style={styles.attachmentTitle}>Attached Images ({wish.image_count})</Text>
            </View>
            {wish.images && wish.images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
                {wish.images.map((uri, index) => (
                  <Image key={index} source={{ uri }} style={styles.attachedImage} />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.attachmentPlaceholder}>
                <Ionicons name="images-outline" size={32} color="#D1D5DB" />
                <Text style={styles.attachmentPlaceholderText}>
                  {wish.image_count} image(s) attached
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Voice Notes */}
        {wish.has_voice_notes && wish.voice_note_count && wish.voice_note_count > 0 && (
          <View style={styles.attachmentCard}>
            <View style={styles.attachmentHeader}>
              <Ionicons name="mic" size={20} color="#6366F1" />
              <Text style={styles.attachmentTitle}>Voice Notes ({wish.voice_note_count})</Text>
            </View>
            {wish.voice_notes && wish.voice_notes.length > 0 ? (
              wish.voice_notes.map((note, index) => (
                <View key={index} style={styles.voiceNoteItem}>
                  <TouchableOpacity 
                    style={styles.voiceNotePlayButton}
                    onPress={() => playVoiceNote(index)}
                  >
                    <Ionicons 
                      name={playingIndex === index ? "pause" : "play"} 
                      size={18} 
                      color="#fff" 
                    />
                  </TouchableOpacity>
                  <View style={styles.voiceNoteInfo}>
                    <Text style={styles.voiceNoteName}>Voice Note {index + 1}</Text>
                    <Text style={styles.voiceNoteDuration}>{note.duration}s</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.attachmentPlaceholder}>
                <Ionicons name="mic-outline" size={32} color="#D1D5DB" />
                <Text style={styles.attachmentPlaceholderText}>
                  {wish.voice_note_count} voice note(s) attached
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Location */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="location" size={20} color="#6366F1" />
            <Text style={styles.infoTitle}>Location</Text>
          </View>
          <Text style={styles.infoValue}>{wish.location?.address || 'Not specified'}</Text>
          
          {isEditing ? (
            <View style={styles.editSection}>
              <Text style={styles.inputLabel}>Visibility Radius: {editRadius} km</Text>
              <View style={styles.radiusRow}>
                <TouchableOpacity
                  style={styles.radiusBtn}
                  onPress={() => setEditRadius(Math.max(1, editRadius - 1))}
                >
                  <Ionicons name="remove" size={20} color="#6366F1" />
                </TouchableOpacity>
                <Text style={styles.radiusValue}>{editRadius} km</Text>
                <TouchableOpacity
                  style={styles.radiusBtn}
                  onPress={() => setEditRadius(Math.min(50, editRadius + 1))}
                >
                  <Ionicons name="add" size={20} color="#6366F1" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.radiusText}>Visible to agents within {wish.radius_km} km</Text>
          )}
        </View>

        {/* Remuneration */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="cash" size={20} color="#10B981" />
            <Text style={styles.infoTitle}>Remuneration</Text>
          </View>
          {isEditing ? (
            <View style={styles.editSection}>
              <View style={styles.remunerationInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.remunerationInput}
                  value={editRemuneration}
                  onChangeText={setEditRemuneration}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>
          ) : (
            <Text style={styles.remunerationValue}>₹{wish.remuneration}</Text>
          )}
        </View>

        {/* Timing */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="time" size={20} color="#6366F1" />
            <Text style={styles.infoTitle}>Timing</Text>
          </View>
          <Text style={styles.infoValue}>
            {wish.is_immediate ? 'Immediate - Need help now' : `Scheduled: ${wish.scheduled_time ? formatDate(wish.scheduled_time) : 'Not specified'}`}
          </Text>
        </View>

        {/* Action Buttons */}
        {isEditing ? (
          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actions}>
            {['pending', 'accepted', 'in_progress'].includes(wish.status) && (
              <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.completeButtonText}>Mark as Completed</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash" size={20} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete Wish</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 18, color: '#6B7280', marginTop: 16 },
  goBackButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  goBackButtonText: { color: '#fff', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  content: { flex: 1 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 14, fontWeight: '700' },
  immediateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  immediateText: { fontSize: 12, fontWeight: '600', color: '#F59E0B', marginLeft: 4 },
  mainCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  typeIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeInfo: { marginLeft: 16 },
  typeLabel: { fontSize: 16, fontWeight: '600', color: '#6366F1' },
  subCategoryText: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  dateText: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
  description: { fontSize: 15, color: '#6B7280', lineHeight: 22 },
  
  // Attachment cards
  attachmentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  attachmentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  attachmentTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 8 },
  imagesScroll: { marginTop: 4 },
  attachedImage: { width: 100, height: 100, borderRadius: 10, marginRight: 10 },
  attachmentPlaceholder: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  attachmentPlaceholderText: { fontSize: 13, color: '#9CA3AF', marginTop: 8 },
  voiceNoteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
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
  
  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 8 },
  infoValue: { fontSize: 15, color: '#1F2937' },
  radiusText: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  remunerationValue: { fontSize: 28, fontWeight: '700', color: '#10B981' },
  
  editSection: { marginTop: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  radiusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  radiusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusValue: { fontSize: 20, fontWeight: '600', color: '#6366F1', marginHorizontal: 20 },
  remunerationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currencySymbol: { fontSize: 20, fontWeight: '600', color: '#10B981' },
  remunerationInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 12,
    marginLeft: 8,
  },
  editActions: { marginHorizontal: 16, marginTop: 24 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: { backgroundColor: '#D1D5DB' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff', marginLeft: 8 },
  actions: { marginHorizontal: 16, marginTop: 24 },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  completeButtonText: { fontSize: 16, fontWeight: '600', color: '#fff', marginLeft: 8 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 16,
    borderRadius: 12,
  },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: '#EF4444', marginLeft: 8 },
});
