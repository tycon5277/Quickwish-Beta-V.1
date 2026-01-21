import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                   process.env.EXPO_PUBLIC_BACKEND_URL || 
                   'https://quickwish-2.preview.emergentagent.com';

// Auth Context
interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  phone?: string;
  addresses: any[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const processSessionId = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${BACKEND_URL}/api/auth/session`,
        {},
        { headers: { 'X-Session-ID': sessionId } }
      );
      
      const { user: userData, session_token } = response.data;
      setUser(userData);
      setSessionToken(session_token);
      await AsyncStorage.setItem('session_token', session_token);
    } catch (error) {
      console.error('Error processing session:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkExistingSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(response.data);
        setSessionToken(token);
      }
    } catch (error) {
      await AsyncStorage.removeItem('session_token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleUrl = useCallback((url: string | null) => {
    if (!url) return;
    
    // Parse session_id from URL (both hash and query)
    let sessionId: string | null = null;
    
    if (url.includes('#session_id=')) {
      sessionId = url.split('#session_id=')[1]?.split('&')[0];
    } else if (url.includes('?session_id=')) {
      sessionId = url.split('?session_id=')[1]?.split('&')[0];
    } else if (url.includes('session_id=')) {
      sessionId = url.split('session_id=')[1]?.split('&')[0];
    }
    
    if (sessionId) {
      processSessionId(sessionId);
    }
  }, [processSessionId]);

  useEffect(() => {
    const init = async () => {
      // Check for session_id in URL first (cold start)
      if (Platform.OS === 'web') {
        const hash = window.location.hash;
        if (hash.includes('session_id=')) {
          const sessionId = hash.split('session_id=')[1]?.split('&')[0];
          if (sessionId) {
            window.location.hash = '';
            await processSessionId(sessionId);
            return;
          }
        }
      } else {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('session_id=')) {
          handleUrl(initialUrl);
          return;
        }
      }
      
      // Check existing session
      await checkExistingSession();
    };
    
    init();
    
    // Listen for URL changes (hot link)
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });
    
    return () => subscription.remove();
  }, [checkExistingSession, handleUrl, processSessionId]);

  const login = async () => {
    const redirectUrl = Platform.OS === 'web'
      ? `${BACKEND_URL}/`
      : Linking.createURL('/');
    
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    
    if (Platform.OS === 'web') {
      window.location.href = authUrl;
    } else {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === 'success' && result.url) {
        handleUrl(result.url);
      }
    }
  };

  const logout = async () => {
    try {
      if (sessionToken) {
        await axios.post(
          `${BACKEND_URL}/api/auth/logout`,
          {},
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.removeItem('session_token');
      setUser(null);
      setSessionToken(null);
    }
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        sessionToken,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="wishbox" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat" />
        <Stack.Screen name="wish" />
        <Stack.Screen name="account" />
        <Stack.Screen name="location-picker" options={{ presentation: 'modal' }} />
      </Stack>
    </AuthProvider>
  );
}
