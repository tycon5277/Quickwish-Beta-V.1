import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
  type?: 'text' | 'offer' | 'system';
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
  const agentInfoHeight = useRef(new Animated.Value(0)).current;

  const fetchMessages = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/rooms/${id}/messages`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setMessages(response.data);
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
        // Enhance with mock agent data
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

  const toggleAgentInfo = () => {
    const toValue = showAgentInfo ? 0 : 1;
    Animated.timing(agentInfoHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setShowAgentInfo(!showAgentInfo);
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || newMessage.trim();
    if (!messageText || !sessionToken || !id) return;
    
    setIsSending(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/chat/rooms/${id}/messages`,
        { content: messageText },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      setNewMessage('');
      setShowQuickReplies(false);
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setIsSending(false);
    }
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
              {room?.status === 'approved' ? '✅ Deal Approved' : 
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
                        <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
                          {message.content}
                        </Text>
                        <View style={styles.messageFooter}>
                          <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
                            {formatTime(message.created_at)}
                          </Text>
                          {isOwn && (
                            <Ionicons 
                              name="checkmark-done" 
                              size={14} 
                              color="rgba(255,255,255,0.7)" 
                              style={styles.readReceipt}
                            />
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
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

        {/* Message Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity 
            style={styles.quickReplyToggle}
            onPress={() => setShowQuickReplies(!showQuickReplies)}
          >
            <Ionicons 
              name={showQuickReplies ? "close" : "flash"} 
              size={20} 
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
          </View>
          
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!newMessage.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  messageTimeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  readReceipt: {
    marginLeft: 4,
  },
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickReplyToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 15,
    color: '#1F2937',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});
