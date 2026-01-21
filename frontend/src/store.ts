import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppStore {
  // Refresh triggers
  wishesRefreshTrigger: number;
  triggerWishesRefresh: () => void;
  
  // Location permission state
  locationPermissionChecked: boolean;
  setLocationPermissionChecked: (checked: boolean) => void;
  
  // User location
  userLocation: {
    lat: number;
    lng: number;
    address: string;
  } | null;
  setUserLocation: (location: { lat: number; lng: number; address: string } | null) => void;
  
  // First time user tracking
  isReturningUser: boolean;
  setIsReturningUser: (returning: boolean) => void;
  checkAndSetReturningUser: (userId: string) => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  // Refresh triggers
  wishesRefreshTrigger: 0,
  triggerWishesRefresh: () => set((state) => ({ wishesRefreshTrigger: state.wishesRefreshTrigger + 1 })),
  
  // Location permission state
  locationPermissionChecked: false,
  setLocationPermissionChecked: (checked) => set({ locationPermissionChecked: checked }),
  
  // User location
  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),
  
  // First time user tracking
  isReturningUser: false,
  setIsReturningUser: (returning) => set({ isReturningUser: returning }),
  checkAndSetReturningUser: async (userId: string) => {
    try {
      const hasLoggedInBefore = await AsyncStorage.getItem(`user_logged_in_${userId}`);
      if (hasLoggedInBefore) {
        set({ isReturningUser: true });
      } else {
        await AsyncStorage.setItem(`user_logged_in_${userId}`, 'true');
        set({ isReturningUser: false });
      }
    } catch (error) {
      console.error('Error checking returning user status:', error);
      set({ isReturningUser: false });
    }
  },
}));
