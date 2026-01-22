import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated, Linking, Image, Modal } from 'react-native';
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
                   'https://wishmarket.preview.emergentagent.com';

interface Message {
  message_id: string;
  room_id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  created_at: string;
  type?: 'text' | 'image' | 'voice' | 'system';
  image_url?: string;
  voice_url?: string;
  voice_duration?: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
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
  
  // Voice playback states
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  
  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Typing indicator
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const typingAnimation = useRef(new Animated.Value(0)).current;
  
  const agentInfoHeight = useRef(new Animated.Value(0)).current;

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

  const fetchMessages = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/rooms/${id}/messages`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      // Add mock status to messages for demo
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
      if (sound) {
        sound.unloadAsync();
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [sound, recording]);

  const toggleAgentInfo = () => {
    const toValue = showAgentInfo ? 0 : 1;
    Animated.timing(agentInfoHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setShowAgentInfo(!showAgentInfo);
  };

  const sendMessage = async (text?: string, type: 'text' | 'image' | 'voice' = 'text', mediaUrl?: string, duration?: number) => {
    const messageText = text || newMessage.trim();
    if ((!messageText && type === 'text') || !sessionToken || !id) return;
    
    setIsSending(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/chat/rooms/${id}/messages`,
        { content: messageText || `[${type}]` },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
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
      
      // Start duration timer
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
      setRecording(null);
      
      if (uri && recordingDuration >= 1) {
        // Send voice message
        await sendMessage(`🎤 Voice message (${recordingDuration}s)`, 'voice', uri, recordingDuration);
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

  // Voice Playback Functions
  const playVoiceMessage = async (messageId: string) => {
    // For demo, just show playing state
    if (playingVoice === messageId) {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }
      setPlayingVoice(null);
    } else {
      setPlayingVoice(messageId);
      // Simulate playback duration
      setTimeout(() => {
        setPlayingVoice(null);
      }, 3000);
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
    
    if (isVoice) {
      const durationMatch = message.content.match(/\((\d+)s\)/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
      const isPlaying = playingVoice === message.message_id;
      
      return (
        <TouchableOpacity 
          style={[styles.voiceMessage, isOwn ? styles.voiceMessageOwn : styles.voiceMessageOther]}
          onPress={() => playVoiceMessage(message.message_id)}
        >
          <View style={styles.voicePlayButton}>
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={20} 
              color={isOwn ? '#fff' : '#6366F1'} 
            />
          </View>
          <View style={styles.voiceWaveform}>
            {[...Array(12)].map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.voiceBar, 
                  { 
                    height: 8 + Math.random() * 16,
                    backgroundColor: isOwn ? 'rgba(255,255,255,0.6)' : '#C7D2FE',
                  }
                ]} 
              />
            ))}
          </View>
          <Text style={[styles.voiceDuration, isOwn && styles.voiceDurationOwn]}>
            {duration}s
          </Text>
        </TouchableOpacity>
      );
    }

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

        <TouchableOpacity style={styles.menuButton}>
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
        
        <TouchableOpacity style={styles.quickAction} onPress={handlePayment}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="wallet" size={18} color="#F59E0B" />
          </View>
          <Text style={styles.quickActionText}>Pay</Text>
        </TouchableOpacity>
        
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
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <View key={date}>
                <View style={styles.dateSeparator}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateText}>{date}</Text>
                  <View style={styles.dateLine} />
                </View>
                {msgs.map((message) => {
                  const isOwn = message.sender_id === user?.user_id;
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

        {/* Attachment Options Modal */}
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
  // Voice Message Styles
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  voiceMessageOwn: {},
  voiceMessageOther: {},
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
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
});
