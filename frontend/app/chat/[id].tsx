import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated, Linking, Image, Modal, Dimensions, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import Constants from 'expo-constants';
import { useAuth } from '../_layout';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://order-lifecycle-8.preview.emergentagent.com';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Message {
  message_id: string;
  room_id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  created_at: string;
  type?: 'text' | 'image' | 'voice' | 'system' | 'offer';
  image_url?: string;
  voice_url?: string;
  voice_duration?: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  offer_amount?: number;
  offer_status?: 'pending' | 'accepted' | 'rejected';
}

interface VoiceMessage {
  uri: string;
  duration: number;
}

interface ChatRoom {
  room_id: string;
  wish_id: string;
  wisher_id: string;
  agent_id: string;
  status: string;
  wish?: {
    title: string;
    wish_type: string;
    remuneration: number;
    status: string;
    description?: string;
  };
  agent?: {
    name: string;
    avatar?: string;
    rating: number;
    completed_wishes: number;
    is_verified: boolean;
    response_time: string;
    phone?: string;
  };
}

// Quick reply templates
const QUICK_REPLIES = [
  { id: 'thanks', text: 'Thank you! 🙏', icon: 'heart' },
  { id: 'location', text: 'Can you share location?', icon: 'location' },
  { id: 'eta', text: 'What\'s your ETA?', icon: 'time' },
  { id: 'confirm', text: 'Confirmed!', icon: 'checkmark-circle' },
  { id: 'omw', text: 'On my way!', icon: 'walk' },
  { id: 'wait', text: 'Please wait, almost there', icon: 'hourglass' },
];

// Cancel reasons
const CANCEL_REASONS = [
  { id: 'changed_mind', label: 'Changed my mind', icon: 'refresh' },
  { id: 'found_alternative', label: 'Found alternative', icon: 'swap-horizontal' },
  { id: 'price_issue', label: 'Price too high', icon: 'cash' },
  { id: 'time_issue', label: 'Taking too long', icon: 'time' },
  { id: 'other', label: 'Other reason', icon: 'ellipsis-horizontal' },
];

// Deal progress steps
const PROGRESS_STEPS = [
  { id: 'negotiating', label: 'Negotiating', icon: 'chatbubble-ellipses' },
  { id: 'approved', label: 'Approved', icon: 'checkmark-circle' },
  { id: 'in_progress', label: 'In Progress', icon: 'timer' },
  { id: 'completed', label: 'Completed', icon: 'trophy' },
];

export default function ChatDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user, sessionToken } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showAgentInfo, setShowAgentInfo] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAttachmentOptions, setShowAttachmentOptions] = useState(false);
  
  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Voice playback states - Store voice messages locally
  const [voiceMessages, setVoiceMessages] = useState<Record<string, VoiceMessage>>({});
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Typing indicator
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  
  // Phase 3: Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [selectedCancelReason, setSelectedCancelReason] = useState<string | null>(null);
  
  // Phase 3: ETA Timer
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  
  // Phase 4: New states
  const [dealSummaryExpanded, setDealSummaryExpanded] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const dealSummaryHeight = useRef(new Animated.Value(0)).current;
  const celebrationAnim = useRef(new Animated.Value(0)).current;
  
  // Phase 5: Share Live Trip states
  const [showShareTripModal, setShowShareTripModal] = useState(false);
  const [tripSharedWith, setTripSharedWith] = useState<string[]>([]);
  const [isLiveTrackingActive, setIsLiveTrackingActive] = useState(false);
  
  const agentInfoHeight = useRef(new Animated.Value(0)).current;

  // Check if this is a ride/travel type wish
  const isRideType = useMemo(() => {
    const rideTypes = ['ride_request', 'commercial_ride'];
    return rideTypes.includes(room?.wish?.wish_type || '');
  }, [room?.wish?.wish_type]);

  // Agent badges based on stats
  const getAgentBadges = () => {
    const badges = [];
    if (room?.agent) {
      if (room.agent.rating >= 4.8) badges.push({ label: '⭐ Top Rated', color: '#F59E0B' });
      if (room.agent.completed_wishes >= 50) badges.push({ label: '🏆 Expert', color: '#8B5CF6' });
      if (room.agent.is_verified) badges.push({ label: '✓ Verified', color: '#10B981' });
      if (room.agent.response_time?.includes('5 min')) badges.push({ label: '⚡ Fast', color: '#3B82F6' });
    }
    return badges;
  };

  // Generate shareable trip link
  const generateTripLink = () => {
    const tripId = `trip_${room?.room_id}_${Date.now()}`;
    return `https://quickwish.app/track/${tripId}`;
  };

  // Share Live Trip function
  const shareLiveTrip = async (method: 'link' | 'whatsapp' | 'sms') => {
    const tripLink = generateTripLink();
    const agentName = room?.agent?.name || 'Agent';
    const agentRating = room?.agent?.rating || 'N/A';
    const wishTitle = room?.wish?.title || 'Trip';
    const eta = etaMinutes ? `${etaMinutes} mins` : 'Calculating...';
    
    const shareMessage = `🚗 I'm traveling with QuickWish!\n\n` +
      `📍 Trip: ${wishTitle}\n` +
      `👤 Driver: ${agentName} (⭐ ${agentRating})\n` +
      `⏱️ ETA: ${eta}\n\n` +
      `📲 Track my live location:\n${tripLink}\n\n` +
      `This link will be active until my trip ends.`;
    
    try {
      if (method === 'whatsapp') {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          Alert.alert('WhatsApp Not Found', 'Please install WhatsApp to share via this method.');
        }
      } else if (method === 'sms') {
        const smsUrl = `sms:?body=${encodeURIComponent(shareMessage)}`;
        await Linking.openURL(smsUrl);
      } else {
        await Share.share({
          message: shareMessage,
          title: 'Share My Trip',
        });
      }
      
      setIsLiveTrackingActive(true);
      setTripSharedWith(prev => [...prev, method]);
      setShowShareTripModal(false);
      
      Alert.alert(
        '✅ Trip Shared!',
        'Your live location is now being shared. They can track your trip in real-time.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error sharing trip:', error);
      Alert.alert('Error', 'Failed to share trip. Please try again.');
    }
  };

  // Stop sharing trip
  const stopSharingTrip = () => {
    Alert.alert(
      'Stop Sharing?',
      'Your contacts will no longer be able to track your location.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Stop Sharing', 
          style: 'destructive',
          onPress: () => {
            setIsLiveTrackingActive(false);
            setTripSharedWith([]);
            Alert.alert('Sharing Stopped', 'Your trip is no longer being shared.');
          }
        }
      ]
    );
  };

  // Toggle deal summary expansion
  const toggleDealSummary = () => {
    const toValue = dealSummaryExpanded ? 0 : 1;
    Animated.timing(dealSummaryHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setDealSummaryExpanded(!dealSummaryExpanded);
  };

  // Show celebration animation
  const showCompletionCelebration = () => {
    setShowCelebration(true);
    Animated.sequence([
      Animated.timing(celebrationAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(celebrationAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      setShowCelebration(false);
      setShowRatingModal(true);
    });
  };

  // Check if should show rating prompt
  useEffect(() => {
    if (room?.status === 'completed') {
      const timer = setTimeout(() => {
        showCompletionCelebration();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [room?.status]);

  // Simulate typing indicator randomly
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7 && room?.status === 'active') {
        setIsAgentTyping(true);
        setTimeout(() => setIsAgentTyping(false), 3000);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [room?.status]);

  // Typing animation
  useEffect(() => {
    if (isAgentTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnimation, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(typingAnimation, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      typingAnimation.setValue(0);
    }
  }, [isAgentTyping]);

  // Simulate ETA for approved deals
  useEffect(() => {
    if (room?.status === 'approved' || room?.status === 'in_progress') {
      setEtaMinutes(Math.floor(Math.random() * 20) + 5);
      const interval = setInterval(() => {
        setEtaMinutes(prev => prev && prev > 1 ? prev - 1 : prev);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [room?.status]);

  const fetchMessages = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/rooms/${id}/messages`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const enhancedMessages = response.data.map((msg: Message, idx: number) => ({
        ...msg,
        status: idx === response.data.length - 1 ? 'delivered' : 'read',
      }));
      setMessages(enhancedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, id]);

  const fetchRoom = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/rooms`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const foundRoom = response.data.find((r: ChatRoom) => r.room_id === id);
      if (foundRoom) {
        setRoom({
          ...foundRoom,
          agent: {
            name: 'Rahul Sharma',
            rating: 4.8,
            completed_wishes: 47,
            is_verified: true,
            response_time: 'Usually responds in 5 mins',
            phone: '+91 98765 43210',
          }
        });
      }
    } catch (error) {
      console.error('Error fetching room:', error);
    }
  }, [sessionToken, id]);

  useEffect(() => {
    fetchRoom();
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchRoom, fetchMessages]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  const toggleAgentInfo = () => {
    const toValue = showAgentInfo ? 0 : 1;
    Animated.timing(agentInfoHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setShowAgentInfo(!showAgentInfo);
  };

  const sendMessage = async (text?: string, type: 'text' | 'image' | 'voice' | 'offer' = 'text', mediaData?: any) => {
    const messageText = text || newMessage.trim();
    if ((!messageText && type === 'text') || !sessionToken || !id) return;
    
    setIsSending(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/chat/rooms/${id}/messages`,
        { content: messageText || `[${type}]` },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      
      // If it's a voice message, store the URI locally
      if (type === 'voice' && mediaData) {
        const newMessageId = response.data?.message_id || `voice_${Date.now()}`;
        setVoiceMessages(prev => ({
          ...prev,
          [newMessageId]: mediaData
        }));
      }
      
      setNewMessage('');
      setShowQuickReplies(false);
      setShowAttachmentOptions(false);
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone permission to record voice messages.');
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
      
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    
    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const duration = recordingDuration;
      setRecording(null);
      
      if (uri && duration >= 1) {
        // Create a temporary message ID for the voice message
        const tempId = `voice_${Date.now()}`;
        
        // Store the voice message locally first
        setVoiceMessages(prev => ({
          ...prev,
          [tempId]: { uri, duration }
        }));
        
        // Send the message
        await sendMessage(`🎤 Voice message (${duration}s)`, 'voice', { uri, duration });
      }
      
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    
    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      setRecording(null);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  };

  // Voice Playback Functions - FIXED
  const playVoiceMessage = async (messageId: string, messageContent: string) => {
    try {
      // If already playing this message, stop it
      if (playingVoice === messageId) {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setPlayingVoice(null);
        setPlaybackProgress(0);
        return;
      }

      // Stop any currently playing audio
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Check if we have the voice message stored locally
      const voiceData = voiceMessages[messageId];
      
      if (voiceData && voiceData.uri) {
        // Play from local storage
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: voiceData.uri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              if (status.didJustFinish) {
                setPlayingVoice(null);
                setPlaybackProgress(0);
              } else if (status.positionMillis && status.durationMillis) {
                setPlaybackProgress(status.positionMillis / status.durationMillis);
              }
            }
          }
        );
        
        soundRef.current = sound;
        setPlayingVoice(messageId);
      } else {
        // For demo purposes, play a sample audio or show message
        Alert.alert(
          'Voice Message',
          'Voice playback demo: The recorded audio would play here.\n\nIn production, voice files would be uploaded to server and streamed back.',
          [{ text: 'OK' }]
        );
        
        // Simulate playback animation
        setPlayingVoice(messageId);
        const durationMatch = messageContent.match(/\((\d+)s\)/);
        const duration = durationMatch ? parseInt(durationMatch[1]) * 1000 : 3000;
        
        let progress = 0;
        const interval = setInterval(() => {
          progress += 100 / (duration / 100);
          setPlaybackProgress(progress / 100);
          if (progress >= 100) {
            clearInterval(interval);
            setPlayingVoice(null);
            setPlaybackProgress(0);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error playing voice message:', error);
      Alert.alert('Error', 'Failed to play voice message');
    }
  };

  // Image Picker Functions
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library permission to send images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await sendMessage('📷 Image', 'image', result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
    setShowAttachmentOptions(false);
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permission to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await sendMessage('📷 Photo', 'image', result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowAttachmentOptions(false);
  };

  // Phase 3: Send Offer
  const sendOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid offer amount');
      return;
    }
    
    await sendMessage(`💰 Counter Offer: ₹${amount}`, 'offer', { amount });
    setShowOfferModal(false);
    setOfferAmount('');
  };

  // Phase 3: Cancel Deal
  const cancelDeal = async () => {
    if (!selectedCancelReason) {
      Alert.alert('Select Reason', 'Please select a reason for cancellation');
      return;
    }
    
    const reason = CANCEL_REASONS.find(r => r.id === selectedCancelReason);
    Alert.alert(
      'Confirm Cancellation',
      `Are you sure you want to cancel this wish?\n\nReason: ${reason?.label}`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              // In production, call API to cancel
              await sendMessage(`❌ Wish cancelled: ${reason?.label}`, 'system');
              setShowCancelModal(false);
              Alert.alert('Cancelled', 'Your wish has been cancelled.');
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel wish');
            }
          }
        }
      ]
    );
  };

  // Phase 3: Report User
  const reportUser = () => {
    Alert.alert(
      'Report Submitted',
      'Thank you for your report. Our team will review it within 24 hours.',
      [{ text: 'OK', onPress: () => setShowReportModal(false) }]
    );
  };

  const approveDeal = async () => {
    Alert.alert(
      '✅ Approve Deal',
      `Are you sure you want to approve this deal with ${room?.agent?.name}? This confirms the agreement at ₹${room?.wish?.remuneration}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve Deal',
          style: 'default',
          onPress: async () => {
            try {
              await axios.put(
                `${BACKEND_URL}/api/chat/rooms/${id}/approve`,
                {},
                { headers: { Authorization: `Bearer ${sessionToken}` } }
              );
              Alert.alert('🎉 Deal Approved!', 'The agent will now proceed with your wish.');
              fetchRoom();
            } catch (error) {
              console.error('Error approving deal:', error);
              Alert.alert('Error', 'Failed to approve deal');
            }
          },
        },
      ]
    );
  };

  const handleCall = () => {
    if (room?.agent?.phone) {
      Linking.openURL(`tel:${room.agent.phone}`);
    } else {
      Alert.alert('Phone Unavailable', 'Agent phone number is not available');
    }
  };

  const handleShareLocation = () => {
    Alert.alert('Share Location', 'Location sharing will be available soon!');
  };

  const handlePayment = () => {
    Alert.alert('Payment', 'Payment feature will be available soon!');
  };

  const handleEmergency = () => {
    Alert.alert(
      '🆘 Emergency SOS',
      'This will alert emergency services and share your location.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call Emergency', 
          style: 'destructive',
          onPress: () => Linking.openURL('tel:112')
        }
      ]
    );
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getCurrentStep = () => {
    const statusMap: Record<string, number> = {
      'active': 0,
      'negotiating': 0,
      'approved': 1,
      'in_progress': 2,
      'completed': 3,
    };
    return statusMap[room?.status || 'active'] || 0;
  };

  const getMessageStatusIcon = (status?: string, isOwn?: boolean) => {
    if (!isOwn) return null;
    
    switch (status) {
      case 'sending':
        return <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />;
      case 'sent':
        return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />;
      case 'delivered':
        return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />;
      case 'read':
        return <Ionicons name="checkmark-done" size={14} color="#60A5FA" />;
      default:
        return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.7)" />;
    }
  };

  // Group messages by date
  const groupedMessages: { [date: string]: Message[] } = {};
  messages.forEach((msg) => {
    const date = formatDate(msg.created_at);
    if (!groupedMessages[date]) {
      groupedMessages[date] = [];
    }
    groupedMessages[date].push(msg);
  });

  const interpolatedHeight = agentInfoHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 160],
  });

  const renderMessage = (message: Message, isOwn: boolean) => {
    const isVoice = message.content.includes('🎤 Voice message');
    const isImage = message.content.includes('📷');
    const isOffer = message.content.includes('💰 Counter Offer');
    const isSystem = message.content.includes('❌') || message.content.includes('✅');
    
    // Offer Card (Phase 3)
    if (isOffer) {
      const amountMatch = message.content.match(/₹(\d+)/);
      const amount = amountMatch ? amountMatch[1] : '0';
      
      return (
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <Ionicons name="cash" size={20} color="#F59E0B" />
            <Text style={styles.offerTitle}>Counter Offer</Text>
          </View>
          <Text style={styles.offerAmount}>₹{amount}</Text>
          {!isOwn && (
            <View style={styles.offerActions}>
              <TouchableOpacity style={styles.offerRejectButton}>
                <Text style={styles.offerRejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.offerAcceptButton}>
                <Text style={styles.offerAcceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }
    
    // System Message
    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Text style={styles.systemMessageText}>{message.content}</Text>
        </View>
      );
    }
    
    // Voice Message
    if (isVoice) {
      const durationMatch = message.content.match(/\((\d+)s\)/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
      const isPlaying = playingVoice === message.message_id;
      
      return (
        <TouchableOpacity 
          style={[styles.voiceMessage, isOwn ? styles.voiceMessageOwn : styles.voiceMessageOther]}
          onPress={() => playVoiceMessage(message.message_id, message.content)}
        >
          <View style={[styles.voicePlayButton, isOwn && styles.voicePlayButtonOwn]}>
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={20} 
              color={isOwn ? '#fff' : '#6366F1'} 
            />
          </View>
          <View style={styles.voiceWaveform}>
            {[...Array(15)].map((_, i) => {
              const barProgress = i / 15;
              const isActive = isPlaying && barProgress <= playbackProgress;
              return (
                <View 
                  key={i} 
                  style={[
                    styles.voiceBar, 
                    { 
                      height: 8 + Math.sin(i * 0.8) * 12 + Math.random() * 4,
                      backgroundColor: isOwn 
                        ? (isActive ? '#fff' : 'rgba(255,255,255,0.4)') 
                        : (isActive ? '#6366F1' : '#C7D2FE'),
                    }
                  ]} 
                />
              );
            })}
          </View>
          <Text style={[styles.voiceDuration, isOwn && styles.voiceDurationOwn]}>
            {isPlaying ? `${Math.floor(playbackProgress * duration)}s` : `${duration}s`}
          </Text>
        </TouchableOpacity>
      );
    }

    // Image Message
    if (isImage) {
      return (
        <TouchableOpacity 
          style={styles.imageMessage}
          onPress={() => setPreviewImage('https://picsum.photos/400/300')}
        >
          <Image 
            source={{ uri: 'https://picsum.photos/400/300' }} 
            style={styles.chatImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay}>
            <Ionicons name="expand-outline" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
        {message.content}
      </Text>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.headerCenter} onPress={toggleAgentInfo}>
          <View style={styles.headerAvatar}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.avatarGradient}>
              <Text style={styles.avatarText}>{room?.agent?.name?.charAt(0) || 'A'}</Text>
            </LinearGradient>
            {room?.agent?.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={8} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName}>{room?.agent?.name || 'Agent'}</Text>
              {room?.agent?.rating && (
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#F59E0B" />
                  <Text style={styles.ratingText}>{room.agent.rating}</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerStatus}>
              {isAgentTyping ? '✍️ typing...' :
               room?.status === 'approved' ? '✅ Deal Approved' : 
               room?.status === 'completed' ? '🏆 Completed' : '💬 Tap for info'}
            </Text>
          </View>
          <Ionicons 
            name={showAgentInfo ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#6B7280" 
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenuModal(true)}>
          <Ionicons name="ellipsis-vertical" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Expandable Agent Info Panel */}
      <Animated.View style={[styles.agentInfoPanel, { height: interpolatedHeight }]}>
        <View style={styles.agentInfoContent}>
          <View style={styles.agentStats}>
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>{room?.agent?.completed_wishes || 0}</Text>
              <Text style={styles.agentStatLabel}>Wishes Done</Text>
            </View>
            <View style={styles.agentStatDivider} />
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>⭐ {room?.agent?.rating || '0'}</Text>
              <Text style={styles.agentStatLabel}>Rating</Text>
            </View>
            <View style={styles.agentStatDivider} />
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>⚡</Text>
              <Text style={styles.agentStatLabel}>Fast Responder</Text>
            </View>
          </View>
          <Text style={styles.responseTime}>{room?.agent?.response_time}</Text>
        </View>
      </Animated.View>

      {/* Deal Progress Tracker */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          {PROGRESS_STEPS.map((step, index) => {
            const currentStep = getCurrentStep();
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            
            return (
              <React.Fragment key={step.id}>
                <View style={styles.progressStep}>
                  <View style={[
                    styles.progressDot,
                    isCompleted && styles.progressDotCompleted,
                    isCurrent && styles.progressDotCurrent,
                  ]}>
                    <Ionicons 
                      name={step.icon as any} 
                      size={12} 
                      color={isCompleted || isCurrent ? '#fff' : '#9CA3AF'} 
                    />
                  </View>
                  <Text style={[
                    styles.progressLabel,
                    (isCompleted || isCurrent) && styles.progressLabelActive
                  ]}>
                    {step.label}
                  </Text>
                </View>
                {index < PROGRESS_STEPS.length - 1 && (
                  <View style={[
                    styles.progressLine,
                    isCompleted && styles.progressLineCompleted,
                  ]} />
                )}
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* ETA Timer (Phase 3) */}
      {etaMinutes && (room?.status === 'approved' || room?.status === 'in_progress') && (
        <View style={styles.etaBanner}>
          <Ionicons name="time" size={18} color="#10B981" />
          <Text style={styles.etaText}>Estimated arrival: <Text style={styles.etaTime}>{etaMinutes} mins</Text></Text>
        </View>
      )}

      {/* Quick Actions Bar */}
      <View style={styles.quickActionsBar}>
        <TouchableOpacity style={styles.quickAction} onPress={handleCall}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#DBEAFE' }]}>
            <Ionicons name="call" size={18} color="#3B82F6" />
          </View>
          <Text style={styles.quickActionText}>Call</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.quickAction} onPress={handleShareLocation}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="location" size={18} color="#10B981" />
          </View>
          <Text style={styles.quickActionText}>Location</Text>
        </TouchableOpacity>
        
        {room?.status === 'active' ? (
          <TouchableOpacity style={styles.quickAction} onPress={() => setShowOfferModal(true)}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="cash" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.quickActionText}>Offer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.quickAction} onPress={handlePayment}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="wallet" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.quickActionText}>Pay</Text>
          </TouchableOpacity>
        )}
        
        {room?.status === 'active' && (
          <TouchableOpacity style={styles.quickAction} onPress={approveDeal}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-done" size={18} color="#10B981" />
            </View>
            <Text style={[styles.quickActionText, { color: '#10B981' }]}>Approve</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Wish Info Banner */}
      {room?.wish && (
        <View style={styles.wishBanner}>
          <View style={styles.wishBannerIcon}>
            <Ionicons name="sparkles" size={16} color="#6366F1" />
          </View>
          <View style={styles.wishBannerContent}>
            <Text style={styles.wishBannerTitle} numberOfLines={1}>{room.wish.title}</Text>
            <Text style={styles.wishBannerPrice}>₹{room.wish.remuneration}</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#6366F1" />
            </View>
            <Text style={styles.emptyText}>Start the conversation!</Text>
            <Text style={styles.emptySubtext}>Send a message to begin negotiating</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Expandable Deal Summary Card (Phase 4) */}
            {room?.wish && (
              <View style={styles.dealSummaryCard}>
                <TouchableOpacity style={styles.dealSummaryHeader} onPress={toggleDealSummary}>
                  <View style={styles.dealSummaryHeaderLeft}>
                    <Ionicons name="document-text" size={18} color="#6366F1" />
                    <Text style={styles.dealSummaryTitle}>Deal Summary</Text>
                  </View>
                  <View style={styles.dealSummaryHeaderRight}>
                    <View style={[styles.dealStatusBadge, { backgroundColor: room.status === 'completed' ? '#D1FAE5' : '#DBEAFE' }]}>
                      <Text style={[styles.dealStatusText, { color: room.status === 'completed' ? '#10B981' : '#3B82F6' }]}>
                        {room.status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons 
                      name={dealSummaryExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#6B7280" 
                    />
                  </View>
                </TouchableOpacity>
                
                {/* Collapsed Preview */}
                {!dealSummaryExpanded && (
                  <View style={styles.dealSummaryPreview}>
                    <Text style={styles.dealSummaryPreviewText} numberOfLines={1}>
                      {room.wish.title} • ₹{room.wish.remuneration}
                    </Text>
                  </View>
                )}
                
                {/* Expanded Content */}
                {dealSummaryExpanded && (
                  <Animated.View style={styles.dealSummaryExpanded}>
                    {/* Agent Info with Badges */}
                    <View style={styles.dealAgentSection}>
                      <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.dealAgentAvatar}>
                        <Text style={styles.dealAgentAvatarText}>{room.agent?.name?.charAt(0) || 'A'}</Text>
                      </LinearGradient>
                      <View style={styles.dealAgentInfo}>
                        <Text style={styles.dealAgentName}>{room.agent?.name || 'Agent'}</Text>
                        <View style={styles.dealAgentBadges}>
                          {getAgentBadges().map((badge, idx) => (
                            <View key={idx} style={[styles.agentBadge, { backgroundColor: badge.color + '20' }]}>
                              <Text style={[styles.agentBadgeText, { color: badge.color }]}>{badge.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.dealDivider} />
                    
                    {/* Wish Details */}
                    <View style={styles.dealDetailRow}>
                      <View style={styles.dealDetailIcon}>
                        <Ionicons name="sparkles" size={16} color="#6366F1" />
                      </View>
                      <View style={styles.dealDetailContent}>
                        <Text style={styles.dealDetailLabel}>Wish</Text>
                        <Text style={styles.dealDetailValue}>{room.wish.title}</Text>
                      </View>
                    </View>
                    
                    {room.wish.description && (
                      <View style={styles.dealDetailRow}>
                        <View style={styles.dealDetailIcon}>
                          <Ionicons name="information-circle" size={16} color="#6B7280" />
                        </View>
                        <View style={styles.dealDetailContent}>
                          <Text style={styles.dealDetailLabel}>Description</Text>
                          <Text style={styles.dealDetailValue}>{room.wish.description}</Text>
                        </View>
                      </View>
                    )}
                    
                    <View style={styles.dealDetailRow}>
                      <View style={styles.dealDetailIcon}>
                        <Ionicons name="pricetag" size={16} color="#10B981" />
                      </View>
                      <View style={styles.dealDetailContent}>
                        <Text style={styles.dealDetailLabel}>Agreed Price</Text>
                        <Text style={styles.dealDetailPriceValue}>₹{room.wish.remuneration}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.dealDetailRow}>
                      <View style={styles.dealDetailIcon}>
                        <Ionicons name="layers" size={16} color="#F59E0B" />
                      </View>
                      <View style={styles.dealDetailContent}>
                        <Text style={styles.dealDetailLabel}>Category</Text>
                        <Text style={styles.dealDetailValue}>{room.wish.wish_type?.replace('_', ' ')}</Text>
                      </View>
                    </View>
                    
                    {etaMinutes && (
                      <View style={styles.dealDetailRow}>
                        <View style={styles.dealDetailIcon}>
                          <Ionicons name="time" size={16} color="#3B82F6" />
                        </View>
                        <View style={styles.dealDetailContent}>
                          <Text style={styles.dealDetailLabel}>ETA</Text>
                          <Text style={styles.dealDetailValue}>{etaMinutes} minutes</Text>
                        </View>
                      </View>
                    )}
                    
                    {/* Encryption Notice (Phase 4) */}
                    <View style={styles.encryptionNotice}>
                      <Ionicons name="lock-closed" size={12} color="#9CA3AF" />
                      <Text style={styles.encryptionText}>Messages are end-to-end encrypted</Text>
                    </View>
                  </Animated.View>
                )}
              </View>
            )}

            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <View key={date}>
                <View style={styles.dateSeparator}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateText}>{date}</Text>
                  <View style={styles.dateLine} />
                </View>
                {msgs.map((message) => {
                  const isOwn = message.sender_id === user?.user_id;
                  const isSystem = message.content.includes('❌') || message.content.includes('✅');
                  
                  if (isSystem) {
                    return (
                      <View key={message.message_id} style={styles.systemMessageContainer}>
                        {renderMessage(message, isOwn)}
                      </View>
                    );
                  }
                  
                  return (
                    <View
                      key={message.message_id}
                      style={[styles.messageRow, isOwn && styles.messageRowOwn]}
                    >
                      <View style={[
                        styles.messageBubble, 
                        isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther
                      ]}>
                        {renderMessage(message, isOwn)}
                        <View style={styles.messageFooter}>
                          <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
                            {formatTime(message.created_at)}
                          </Text>
                          {getMessageStatusIcon(message.status, isOwn)}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
            
            {/* Typing Indicator */}
            {isAgentTyping && (
              <View style={styles.typingContainer}>
                <View style={styles.typingBubble}>
                  <Animated.View style={[styles.typingDot, { opacity: typingAnimation }]} />
                  <Animated.View style={[styles.typingDot, { opacity: typingAnimation, marginLeft: 4 }]} />
                  <Animated.View style={[styles.typingDot, { opacity: typingAnimation, marginLeft: 4 }]} />
                </View>
                <Text style={styles.typingText}>{room?.agent?.name} is typing...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Quick Replies */}
        {showQuickReplies && (
          <View style={styles.quickRepliesContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {QUICK_REPLIES.map((reply) => (
                <TouchableOpacity 
                  key={reply.id} 
                  style={styles.quickReplyButton}
                  onPress={() => sendMessage(reply.text)}
                >
                  <Ionicons name={reply.icon as any} size={14} color="#6366F1" />
                  <Text style={styles.quickReplyText}>{reply.text}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Attachment Options */}
        {showAttachmentOptions && (
          <View style={styles.attachmentOptions}>
            <TouchableOpacity style={styles.attachmentOption} onPress={takePhoto}>
              <View style={[styles.attachmentIconBg, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="camera" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.attachmentLabel}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachmentOption} onPress={pickImage}>
              <View style={[styles.attachmentIconBg, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="image" size={24} color="#10B981" />
              </View>
              <Text style={styles.attachmentLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachmentOption} onPress={handleShareLocation}>
              <View style={[styles.attachmentIconBg, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="location" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.attachmentLabel}>Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recording Overlay */}
        {isRecording && (
          <View style={styles.recordingOverlay}>
            <View style={styles.recordingContent}>
              <View style={styles.recordingWave}>
                <Animated.View style={[styles.recordingDot, { transform: [{ scale: typingAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] }]} />
              </View>
              <Text style={styles.recordingTime}>{recordingDuration}s / 30s</Text>
              <Text style={styles.recordingHint}>Recording voice message...</Text>
            </View>
            <View style={styles.recordingActions}>
              <TouchableOpacity style={styles.cancelRecordingButton} onPress={cancelRecording}>
                <Ionicons name="trash" size={24} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopRecordingButton} onPress={stopRecording}>
                <Ionicons name="send" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Message Input */}
        {!isRecording && (
          <View style={styles.inputContainer}>
            <TouchableOpacity 
              style={styles.attachButton}
              onPress={() => setShowAttachmentOptions(!showAttachmentOptions)}
            >
              <Ionicons 
                name={showAttachmentOptions ? "close" : "add-circle"} 
                size={26} 
                color="#6366F1" 
              />
            </TouchableOpacity>
            
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity 
                style={styles.quickReplyToggle}
                onPress={() => setShowQuickReplies(!showQuickReplies)}
              >
                <Ionicons 
                  name={showQuickReplies ? "flash" : "flash-outline"} 
                  size={20} 
                  color="#6366F1" 
                />
              </TouchableOpacity>
            </View>
            
            {newMessage.trim() ? (
              <TouchableOpacity
                style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
                onPress={() => sendMessage()}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.voiceButton}
                onPress={startRecording}
              >
                <Ionicons name="mic" size={22} color="#6366F1" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Image Preview Modal */}
      <Modal visible={!!previewImage} transparent animationType="fade">
        <View style={styles.imagePreviewModal}>
          <TouchableOpacity 
            style={styles.imagePreviewClose}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <Image 
              source={{ uri: previewImage }} 
              style={styles.imagePreviewFull}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Menu Modal (Phase 3) */}
      <Modal visible={showMenuModal} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.menuModal}>
            {/* Share Trip - Only for ride types */}
            {isRideType && (room?.status === 'approved' || room?.status === 'in_progress') && (
              <>
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => { setShowMenuModal(false); setShowShareTripModal(true); }}
                >
                  <Ionicons name="share-social" size={22} color="#10B981" />
                  <Text style={[styles.menuItemText, { color: '#10B981' }]}>Share Live Trip</Text>
                </TouchableOpacity>
                {isLiveTrackingActive && (
                  <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenuModal(false); stopSharingTrip(); }}>
                    <Ionicons name="stop-circle" size={22} color="#F59E0B" />
                    <Text style={styles.menuItemText}>Stop Sharing</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenuModal(false); setShowReportModal(true); }}>
              <Ionicons name="flag" size={22} color="#EF4444" />
              <Text style={styles.menuItemText}>Report User</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenuModal(false); Alert.alert('Blocked', 'User has been blocked'); }}>
              <Ionicons name="ban" size={22} color="#EF4444" />
              <Text style={styles.menuItemText}>Block User</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenuModal(false); setShowCancelModal(true); }}>
              <Ionicons name="close-circle" size={22} color="#F59E0B" />
              <Text style={styles.menuItemText}>Cancel Wish</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleEmergency}>
              <Ionicons name="warning" size={22} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Emergency SOS</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cancel Modal (Phase 3) */}
      <Modal visible={showCancelModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.cancelModal}>
            <Text style={styles.cancelModalTitle}>Cancel Wish</Text>
            <Text style={styles.cancelModalSubtitle}>Please select a reason:</Text>
            
            {CANCEL_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.cancelReasonItem,
                  selectedCancelReason === reason.id && styles.cancelReasonItemSelected
                ]}
                onPress={() => setSelectedCancelReason(reason.id)}
              >
                <Ionicons 
                  name={reason.icon as any} 
                  size={20} 
                  color={selectedCancelReason === reason.id ? '#6366F1' : '#6B7280'} 
                />
                <Text style={[
                  styles.cancelReasonText,
                  selectedCancelReason === reason.id && styles.cancelReasonTextSelected
                ]}>
                  {reason.label}
                </Text>
                {selectedCancelReason === reason.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#6366F1" />
                )}
              </TouchableOpacity>
            ))}
            
            <View style={styles.cancelModalActions}>
              <TouchableOpacity 
                style={styles.cancelModalButton}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.cancelModalButtonText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.cancelModalButton, styles.cancelModalButtonDanger]}
                onPress={cancelDeal}
              >
                <Text style={styles.cancelModalButtonTextDanger}>Cancel Wish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Offer Modal (Phase 3) */}
      <Modal visible={showOfferModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.offerModal}>
            <Text style={styles.offerModalTitle}>Make a Counter Offer</Text>
            <Text style={styles.offerModalSubtitle}>Current price: ₹{room?.wish?.remuneration}</Text>
            
            <View style={styles.offerInputContainer}>
              <Text style={styles.offerCurrency}>₹</Text>
              <TextInput
                style={styles.offerInput}
                placeholder="Enter amount"
                placeholderTextColor="#9CA3AF"
                value={offerAmount}
                onChangeText={setOfferAmount}
                keyboardType="numeric"
              />
            </View>
            
            <View style={styles.offerModalActions}>
              <TouchableOpacity 
                style={styles.offerModalButton}
                onPress={() => setShowOfferModal(false)}
              >
                <Text style={styles.offerModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.offerModalButton, styles.offerModalButtonPrimary]}
                onPress={sendOffer}
              >
                <Text style={styles.offerModalButtonTextPrimary}>Send Offer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report Modal (Phase 3) */}
      <Modal visible={showReportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModal}>
            <Text style={styles.reportModalTitle}>Report User</Text>
            <Text style={styles.reportModalSubtitle}>
              Why are you reporting {room?.agent?.name}?
            </Text>
            
            {['Inappropriate behavior', 'Scam or fraud', 'Harassment', 'Did not show up', 'Other'].map((reason) => (
              <TouchableOpacity key={reason} style={styles.reportReasonItem} onPress={reportUser}>
                <Text style={styles.reportReasonText}>{reason}</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity 
              style={styles.reportCloseButton}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={styles.reportCloseButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Celebration Overlay (Phase 4) */}
      {showCelebration && (
        <Animated.View style={[styles.celebrationOverlay, { opacity: celebrationAnim }]}>
          <View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationTitle}>Wish Completed!</Text>
            <Text style={styles.celebrationSubtitle}>Great job! Your wish has been fulfilled.</Text>
            <View style={styles.confettiContainer}>
              {[...Array(20)].map((_, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.confetti,
                    {
                      left: `${Math.random() * 100}%`,
                      backgroundColor: ['#F59E0B', '#10B981', '#6366F1', '#EC4899', '#3B82F6'][i % 5],
                      transform: [{
                        translateY: celebrationAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-50, 400],
                        })
                      }, {
                        rotate: `${Math.random() * 360}deg`
                      }],
                    }
                  ]}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Rating Modal (Phase 4) */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.ratingModal}>
            <View style={styles.ratingHeader}>
              <Text style={styles.ratingEmoji}>⭐</Text>
              <Text style={styles.ratingTitle}>Rate Your Experience</Text>
              <Text style={styles.ratingSubtitle}>How was your experience with {room?.agent?.name}?</Text>
            </View>
            
            {/* Star Rating */}
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity 
                  key={star} 
                  onPress={() => setRating(star)}
                  style={styles.starButton}
                >
                  <Ionicons 
                    name={star <= rating ? "star" : "star-outline"} 
                    size={40} 
                    color={star <= rating ? "#F59E0B" : "#D1D5DB"} 
                  />
                </TouchableOpacity>
              ))}
            </View>
            
            {rating > 0 && (
              <Text style={styles.ratingLabel}>
                {rating === 5 ? 'Excellent! 🌟' : 
                 rating === 4 ? 'Great! 😊' : 
                 rating === 3 ? 'Good 👍' : 
                 rating === 2 ? 'Fair 😐' : 'Poor 😞'}
              </Text>
            )}
            
            {/* Review Text */}
            <TextInput
              style={styles.reviewInput}
              placeholder="Write a review (optional)..."
              placeholderTextColor="#9CA3AF"
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              maxLength={500}
            />
            
            {/* Quick Tags */}
            <View style={styles.quickTags}>
              {['Professional', 'On Time', 'Friendly', 'Great Value'].map((tag) => (
                <TouchableOpacity 
                  key={tag} 
                  style={styles.quickTag}
                  onPress={() => setReviewText(prev => prev ? `${prev}, ${tag}` : tag)}
                >
                  <Text style={styles.quickTagText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Actions */}
            <View style={styles.ratingActions}>
              <TouchableOpacity 
                style={styles.ratingSkipButton}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={styles.ratingSkipText}>Maybe Later</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.ratingSubmitButton, rating === 0 && styles.ratingSubmitDisabled]}
                onPress={() => {
                  Alert.alert('Thank You!', 'Your review has been submitted.', [
                    { text: 'OK', onPress: () => setShowRatingModal(false) }
                  ]);
                }}
                disabled={rating === 0}
              >
                <Text style={styles.ratingSubmitText}>Submit Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Live Trip Modal (Phase 5) */}
      <Modal visible={showShareTripModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.shareTripModal}>
            <View style={styles.shareTripHeader}>
              <View style={styles.shareTripIconContainer}>
                <Ionicons name="location" size={32} color="#10B981" />
              </View>
              <Text style={styles.shareTripTitle}>Share Your Trip</Text>
              <Text style={styles.shareTripSubtitle}>
                Share your live location with family or friends for safety
              </Text>
            </View>

            {/* Trip Preview Card */}
            <View style={styles.tripPreviewCard}>
              <View style={styles.tripPreviewHeader}>
                <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.tripAgentAvatar}>
                  <Text style={styles.tripAgentInitial}>{room?.agent?.name?.charAt(0) || 'A'}</Text>
                </LinearGradient>
                <View style={styles.tripAgentDetails}>
                  <Text style={styles.tripAgentName}>{room?.agent?.name || 'Agent'}</Text>
                  <View style={styles.tripAgentRating}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.tripAgentRatingText}>{room?.agent?.rating || 'N/A'}</Text>
                    {room?.agent?.is_verified && (
                      <View style={styles.tripVerifiedBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                </View>
              </View>
              
              <View style={styles.tripDetailsRow}>
                <Ionicons name="car" size={16} color="#6B7280" />
                <Text style={styles.tripDetailText}>{room?.wish?.title || 'Trip'}</Text>
              </View>
              
              <View style={styles.tripDetailsRow}>
                <Ionicons name="time" size={16} color="#6B7280" />
                <Text style={styles.tripDetailText}>ETA: {etaMinutes ? `${etaMinutes} mins` : 'Calculating...'}</Text>
              </View>
              
              <View style={styles.tripDetailsRow}>
                <Ionicons name="cash" size={16} color="#6B7280" />
                <Text style={styles.tripDetailText}>₹{room?.wish?.remuneration || '0'}</Text>
              </View>
            </View>

            {/* Shared Info Notice */}
            <View style={styles.sharedInfoNotice}>
              <Ionicons name="information-circle" size={18} color="#6366F1" />
              <Text style={styles.sharedInfoText}>
                Recipients will see your live location, driver details, and trip progress
              </Text>
            </View>

            {/* Share Options */}
            <Text style={styles.shareOptionsTitle}>Share via</Text>
            <View style={styles.shareOptions}>
              <TouchableOpacity style={styles.shareOption} onPress={() => shareLiveTrip('whatsapp')}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#25D366' }]}>
                  <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>WhatsApp</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.shareOption} onPress={() => shareLiveTrip('sms')}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="chatbubble" size={24} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>SMS</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.shareOption} onPress={() => shareLiveTrip('link')}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#6366F1' }]}>
                  <Ionicons name="share-social" size={24} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>More</Text>
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity 
              style={styles.shareTripCancelButton}
              onPress={() => setShowShareTripModal(false)}
            >
              <Text style={styles.shareTripCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Live Tracking Active Banner (Phase 5) */}
      {isLiveTrackingActive && isRideType && (
        <View style={styles.liveTrackingBanner}>
          <View style={styles.liveTrackingContent}>
            <View style={styles.livePulse}>
              <Animated.View style={[styles.liveDot, { 
                transform: [{ 
                  scale: typingAnimation.interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [1, 1.5] 
                  }) 
                }] 
              }]} />
            </View>
            <View style={styles.liveTrackingInfo}>
              <Text style={styles.liveTrackingTitle}>📍 Live Tracking Active</Text>
              <Text style={styles.liveTrackingSubtext}>
                {tripSharedWith.length} contact{tripSharedWith.length !== 1 ? 's' : ''} can see your location
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={stopSharingTrip}>
            <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerAvatar: {
    position: 'relative',
  },
  avatarGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 2,
  },
  headerStatus: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentInfoPanel: {
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  agentInfoContent: {
    padding: 16,
  },
  agentStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentStatItem: {
    alignItems: 'center',
  },
  agentStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  agentStatLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  agentStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  responseTime: {
    fontSize: 12,
    color: '#10B981',
    textAlign: 'center',
    fontWeight: '500',
  },
  progressContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressDotCompleted: {
    backgroundColor: '#10B981',
  },
  progressDotCurrent: {
    backgroundColor: '#6366F1',
  },
  progressLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  progressLabelActive: {
    color: '#1F2937',
    fontWeight: '600',
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
    marginBottom: 18,
  },
  progressLineCompleted: {
    backgroundColor: '#10B981',
  },
  // ETA Banner (Phase 3)
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  etaText: {
    fontSize: 13,
    color: '#065F46',
    marginLeft: 8,
  },
  etaTime: {
    fontWeight: '700',
  },
  quickActionsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    justifyContent: 'space-around',
  },
  quickAction: {
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  quickActionText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  wishBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  wishBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  wishBannerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wishBannerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 10,
  },
  wishBannerPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
  },
  chatContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  // Deal Summary Card (Phase 3)
  dealSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dealSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dealSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 8,
  },
  dealSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dealSummaryLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  dealSummaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    textAlign: 'right',
  },
  dealSummaryPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
  },
  dealStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dealStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
    paddingHorizontal: 12,
    fontWeight: '500',
  },
  messageRow: {
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  messageRowOwn: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleOwn: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
  },
  messageTextOwn: {
    color: '#fff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  messageTimeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Offer Card (Phase 3)
  offerCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    minWidth: 180,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  offerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 6,
  },
  offerAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 10,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  offerRejectButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  offerRejectText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  offerAcceptButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  offerAcceptText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // System Message
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemMessage: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  systemMessageText: {
    fontSize: 13,
    color: '#6B7280',
  },
  // Voice Message Styles
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 180,
  },
  voiceMessageOwn: {},
  voiceMessageOther: {},
  voicePlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voicePlayButtonOwn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  voiceBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
    minWidth: 25,
  },
  voiceDurationOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  // Image Message Styles
  imageMessage: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  chatImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Typing Indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
  },
  typingText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  // Quick Replies
  quickRepliesContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickReplyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  quickReplyText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
    marginLeft: 6,
  },
  // Attachment Options
  attachmentOptions: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    justifyContent: 'space-around',
  },
  attachmentOption: {
    alignItems: 'center',
  },
  attachmentIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  attachmentLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Recording Overlay
  recordingOverlay: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  recordingContent: {
    alignItems: 'center',
    marginBottom: 16,
  },
  recordingWave: {
    marginBottom: 12,
  },
  recordingDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EF4444',
  },
  recordingTime: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  recordingHint: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  recordingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  cancelRecordingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopRecordingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Input Container
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 120,
    marginHorizontal: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    maxHeight: 100,
  },
  quickReplyToggle: {
    padding: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  // Menu Modal
  menuModal: {
    position: 'absolute',
    top: 100,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  // Cancel Modal
  cancelModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  cancelModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  cancelModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  cancelReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  cancelReasonItemSelected: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  cancelReasonText: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 12,
  },
  cancelReasonTextSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },
  cancelModalActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelModalButtonDanger: {
    backgroundColor: '#FEE2E2',
  },
  cancelModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  cancelModalButtonTextDanger: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  // Offer Modal
  offerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  offerModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  offerModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  offerInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  offerCurrency: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  offerInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 16,
    marginLeft: 8,
  },
  offerModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  offerModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  offerModalButtonPrimary: {
    backgroundColor: '#6366F1',
  },
  offerModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  offerModalButtonTextPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Report Modal
  reportModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  reportModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  reportReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reportReasonText: {
    fontSize: 15,
    color: '#1F2937',
  },
  reportCloseButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reportCloseButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  // Image Preview Modal
  imagePreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imagePreviewFull: {
    width: '100%',
    height: '80%',
  },
  // Phase 4: Expandable Deal Summary Styles
  dealSummaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dealSummaryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dealSummaryPreview: {
    paddingTop: 8,
  },
  dealSummaryPreviewText: {
    fontSize: 13,
    color: '#6B7280',
  },
  dealSummaryExpanded: {
    paddingTop: 12,
  },
  dealAgentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
  },
  dealAgentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealAgentAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  dealAgentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  dealAgentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  dealAgentBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  agentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  agentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dealDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  dealDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  dealDetailIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dealDetailContent: {
    flex: 1,
  },
  dealDetailLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  dealDetailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  dealDetailPriceValue: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: '700',
  },
  encryptionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    gap: 6,
  },
  encryptionText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  // Phase 4: Celebration Overlay
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  celebrationContent: {
    alignItems: 'center',
  },
  celebrationEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  celebrationSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  // Phase 4: Rating Modal
  ratingModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  ratingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ratingEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  ratingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  ratingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    padding: 6,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 20,
  },
  reviewInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  quickTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  quickTagText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  ratingActions: {
    flexDirection: 'row',
    gap: 12,
  },
  ratingSkipButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  ratingSkipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  ratingSubmitButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#6366F1',
  },
  ratingSubmitDisabled: {
    backgroundColor: '#D1D5DB',
  },
  ratingSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Phase 5: Share Live Trip Styles
  shareTripModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  shareTripHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  shareTripIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareTripTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  shareTripSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  tripPreviewCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  tripPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tripAgentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripAgentInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  tripAgentDetails: {
    marginLeft: 12,
    flex: 1,
  },
  tripAgentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  tripAgentRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  tripAgentRatingText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
    marginLeft: 4,
  },
  tripVerifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  tripDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tripDetailText: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 10,
  },
  sharedInfoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  sharedInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    marginLeft: 10,
    lineHeight: 18,
  },
  shareOptionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  shareOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  shareOption: {
    alignItems: 'center',
  },
  shareOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shareOptionText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  shareTripCancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  shareTripCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  // Live Tracking Banner
  liveTrackingBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  liveTrackingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  livePulse: {
    marginRight: 12,
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  liveTrackingInfo: {
    flex: 1,
  },
  liveTrackingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  liveTrackingSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
