import { createSignal } from 'solid-js';
import { AppSettings } from '../types';
import toast from 'solid-toast';

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  username: '',
  darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  notifications: true,
  downloadPath: '',
  autoAcceptFiles: false,
  maxFileSize: 1024 * 1024 * 100, // 100 MB
};

// Storage key
const SETTINGS_STORAGE_KEY = 'ip-chat-settings';

// Create signals for settings state
const [settings, setSettings] = createSignal<AppSettings>(DEFAULT_SETTINGS);
const [isLoading, setIsLoading] = createSignal(true);
const [error, setError] = createSignal<string | null>(null);

// Initialize the settings store
async function initSettingsStore() {
  try {
    setIsLoading(true);
    setError(null);
    
    console.log('Settings store: Starting initialization...');
    
    // Load settings from storage
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      const parsedSettings = JSON.parse(storedSettings);
      setSettings({ ...DEFAULT_SETTINGS, ...parsedSettings });
      console.log('Settings store: Loaded settings from storage');
    } else {
      console.log('Settings store: No stored settings found, using defaults');
    }
    
    console.log('Settings store: Initialization completed');
    
  } catch (err) {
    console.error('Failed to initialize settings store:', err);
    setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to load settings: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setIsLoading(false);
  }
}

// Update settings
function updateSettings(newSettings: Partial<AppSettings>) {
  try {
    const updatedSettings = { ...settings(), ...newSettings };
    setSettings(updatedSettings);
    
    // Save to storage
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updatedSettings));
    
    return true;
  } catch (err) {
    console.error('Failed to update settings:', err);
    setError(`Failed to update settings: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to save settings: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Reset settings to defaults
function resetSettings() {
  try {
    setSettings(DEFAULT_SETTINGS);
    
    // Save to storage
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    
    toast.success('Settings reset to defaults');
    return true;
  } catch (err) {
    console.error('Failed to reset settings:', err);
    setError(`Failed to reset settings: ${err instanceof Error ? err.message : String(err)}`);
    toast.error(`Failed to reset settings: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// Toggle dark mode
function toggleDarkMode() {
  const newDarkMode = !settings().darkMode;
  updateSettings({ darkMode: newDarkMode });
  
  // Apply dark mode to the document
  if (newDarkMode) {
    document.documentElement.classList.add('hope-ui-dark');
    document.documentElement.classList.remove('hope-ui-light');
  } else {
    document.documentElement.classList.add('hope-ui-light');
    document.documentElement.classList.remove('hope-ui-dark');
  }
  
  return newDarkMode;
}

// Export the settings store
export const settingsStore = {
  settings,
  isLoading,
  error,
  initSettingsStore,
  updateSettings,
  resetSettings,
  toggleDarkMode,
};
