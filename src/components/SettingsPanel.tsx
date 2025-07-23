import { Component, createSignal } from "solid-js";
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Divider,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Switch,
  useColorMode,
} from "@hope-ui/solid";
import { userStore, settingsStore } from "../stores";
import { formatFileSize } from "../utils";

const SettingsPanel: Component = () => {
  // Local state for form
  const [username, setUsername] = createSignal(userStore.localUser()?.name || "");
  const [darkMode, setDarkMode] = createSignal(settingsStore.settings().darkMode);
  const [notifications, setNotifications] = createSignal(settingsStore.settings().notifications);
  const [downloadPath, setDownloadPath] = createSignal(settingsStore.settings().downloadPath);
  const [autoAcceptFiles, setAutoAcceptFiles] = createSignal(settingsStore.settings().autoAcceptFiles);
  const [maxFileSize, setMaxFileSize] = createSignal(settingsStore.settings().maxFileSize);
  
  // Color mode
  const { colorMode, toggleColorMode } = useColorMode();
  
  // Save settings
  const saveSettings = async () => {
    // Update username if changed
    if (username() !== userStore.localUser()?.name) {
      await userStore.updateUsername(username());
    }
    
    // Update settings
    settingsStore.updateSettings({
      username: username(),
      darkMode: darkMode(),
      notifications: notifications(),
      downloadPath: downloadPath(),
      autoAcceptFiles: autoAcceptFiles(),
      maxFileSize: maxFileSize(),
    });
    
    // Apply dark mode if changed
    if (darkMode() !== (colorMode() === "dark")) {
      toggleColorMode();
    }
  };
  
  // Reset settings
  const resetSettings = () => {
    settingsStore.resetSettings();
    
    // Update local state
    setUsername(userStore.localUser()?.name || "");
    setDarkMode(settingsStore.settings().darkMode);
    setNotifications(settingsStore.settings().notifications);
    setDownloadPath(settingsStore.settings().downloadPath);
    setAutoAcceptFiles(settingsStore.settings().autoAcceptFiles);
    setMaxFileSize(settingsStore.settings().maxFileSize);
    
    // Apply dark mode if needed
    if (settingsStore.settings().darkMode !== (colorMode() === "dark")) {
      toggleColorMode();
    }
  };
  
  
  return (
    <VStack spacing="$6" alignItems="stretch" w="100%" maxW="$container_md" mx="auto">
      <Heading>Settings</Heading>
      
      <Divider />
      
      {/* User Settings */}
      <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
        <VStack spacing="$4" alignItems="stretch">
          <Heading>User Settings</Heading>
          
          <FormControl>
            <FormLabel>Username</FormLabel>
            <Input
              value={username()}
              onInput={(e: any) => setUsername(e.currentTarget.value)}
              placeholder="Enter your username"
              variant="outline"
              size="md"
            />
            <FormHelperText>
              This is how other users will see you on the network
            </FormHelperText>
          </FormControl>
          
          <FormControl>
            <FormLabel>Dark Mode</FormLabel>
            <Switch
              checked={darkMode()}
              onChange={(e: any) => setDarkMode(e.currentTarget.checked)}
            />
            <FormHelperText>
              Toggle between light and dark theme
            </FormHelperText>
          </FormControl>
          
          <FormControl>
            <FormLabel>Notifications</FormLabel>
            <Switch
              checked={notifications()}
              onChange={(e: any) => setNotifications(e.currentTarget.checked)}
            />
            <FormHelperText>
              Receive notifications for new messages and file transfers
            </FormHelperText>
          </FormControl>
        </VStack>
      </Box>
      
      {/* File Transfer Settings */}
      <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
        <VStack spacing="$4" alignItems="stretch">
          <Heading>File Transfer Settings</Heading>
          
          <FormControl>
            <FormLabel>Download Path</FormLabel>
            <Input
              value={downloadPath()}
              onInput={(e: any) => setDownloadPath(e.currentTarget.value)}
              placeholder="Enter download path"
              variant="outline"
              size="md"
            />
            <FormHelperText>
              Default location to save received files
            </FormHelperText>
          </FormControl>
          
          <FormControl>
            <FormLabel>Auto-Accept Files</FormLabel>
            <Switch
              checked={autoAcceptFiles()}
              onChange={(e: any) => setAutoAcceptFiles(e.currentTarget.checked)}
            />
            <FormHelperText>
              Automatically accept incoming file transfers
            </FormHelperText>
          </FormControl>
          
          <FormControl>
            <FormLabel>Maximum File Size: {formatFileSize(maxFileSize())}</FormLabel>
            <FormHelperText>
              Maximum size for auto-accepted files
            </FormHelperText>
          </FormControl>
        </VStack>
      </Box>
      
      {/* About */}
      <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
        <VStack spacing="$4" alignItems="stretch">
          <Heading>About</Heading>
          
          <Text>
            IP Chat is a modern lightweight local network chat and file sharing application.
            Connect with others on your local network without the need for internet access.
          </Text>
          
          <Text fontSize="$sm" color="$neutral11">
            Version: 0.1.0
          </Text>
        </VStack>
      </Box>
      
      {/* Actions */}
      <HStack spacing="$4" justifyContent="flex-end">
        <Button
          onClick={resetSettings}
        >
          Reset to Defaults
        </Button>
        
        <Button
          onClick={saveSettings}
        >
          Save Settings
        </Button>
      </HStack>
    </VStack>
  );
};

export default SettingsPanel;
