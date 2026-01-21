import { create } from 'zustand';

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
}));
