import React, { useEffect, useRef, useMemo } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View, PanResponder } from 'react-native';
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
    const pathParts = pathname.split('/');
    const route = pathParts[pathParts.length - 1] || 'home';
    const index = TAB_ROUTES.indexOf(route);
    if (index !== -1) {
      currentIndexRef.current = index;
      console.log('Tab changed to:', route, 'index:', index);
    }
  }, [pathname]);

  // Create panResponder with useMemo so it recreates when router changes
  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes with significant movement
        const isHorizontalSwipe = Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 50;
        return isHorizontalSwipe;
      },
      onPanResponderRelease: (_, gestureState) => {
        // Read current index from ref (always up to date)
        const currentIndex = currentIndexRef.current;
        console.log('Swipe detected, dx:', gestureState.dx, 'currentIndex:', currentIndex);
        
        if (gestureState.dx > SWIPE_THRESHOLD && currentIndex > 0) {
          // Swipe right - go to previous tab
          const newIndex = currentIndex - 1;
          console.log('Navigating to previous tab:', TAB_ROUTES[newIndex]);
          router.push(`/(main)/${TAB_ROUTES[newIndex]}`);
        } else if (gestureState.dx < -SWIPE_THRESHOLD && currentIndex < TAB_ROUTES.length - 1) {
          // Swipe left - go to next tab
          const newIndex = currentIndex + 1;
          console.log('Navigating to next tab:', TAB_ROUTES[newIndex]);
          router.push(`/(main)/${TAB_ROUTES[newIndex]}`);
        }
      },
    });
  }, [router]);

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
