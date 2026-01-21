import React, { useEffect, useRef, useCallback } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const TAB_ROUTES = ['home', 'explore', 'chat', 'localhub', 'account'];
const SWIPE_THRESHOLD = 50;

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  
  // Use ref to track current index to avoid stale closure
  const currentIndexRef = useRef(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading]);

  // Update current index ref based on pathname
  useEffect(() => {
    const route = pathname.split('/').pop() || 'home';
    const index = TAB_ROUTES.indexOf(route);
    if (index !== -1) {
      currentIndexRef.current = index;
    }
  }, [pathname]);

  const navigateToTab = useCallback((index: number) => {
    if (index >= 0 && index < TAB_ROUTES.length) {
      router.push(`/(main)/${TAB_ROUTES[index]}`);
    }
  }, [router]);

  const handlePanResponderRelease = useCallback((
    _: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ) => {
    const currentIndex = currentIndexRef.current;
    
    if (gestureState.dx > SWIPE_THRESHOLD && currentIndex > 0) {
      // Swipe right - go to previous tab
      navigateToTab(currentIndex - 1);
    } else if (gestureState.dx < -SWIPE_THRESHOLD && currentIndex < TAB_ROUTES.length - 1) {
      // Swipe left - go to next tab
      navigateToTab(currentIndex + 1);
    }
  }, [navigateToTab]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes with significant movement
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 40;
      },
      onPanResponderRelease: handlePanResponderRelease,
      onPanResponderTerminate: () => {},
    })
  ).current;

  // Calculate proper bottom padding for different devices
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#F3F4F6',
            paddingTop: 8,
            paddingBottom: bottomPadding + 8,
            height: 60 + bottomPadding,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            elevation: 8,
          },
          tabBarActiveTintColor: '#6366F1',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarHideOnKeyboard: true,
        }}
        sceneContainerStyle={{
          paddingBottom: 60 + bottomPadding,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="compass" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="localhub"
          options={{
            title: 'Local Hub',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: 'Account',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
