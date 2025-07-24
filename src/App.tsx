import { createSignal, onMount, onCleanup, Show } from "solid-js";
import {
  Box,
  Flex,
  Text,
  Spinner,
  useColorMode,
  Center,
  VStack,
  HStack,
  Heading,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Badge,
  IconButton,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from "@hope-ui/solid";
import { FiMessageCircle, FiUsers, FiSettings, FiFile } from "solid-icons/fi";
import { initializeStores, userStore, chatStore, settingsStore } from "./stores";

// Import components
import ChatPanel from "./components/ChatPanel";
import PeerList from "./components/PeerList";
import FileTransferPanel from "./components/FileTransferPanel";
import SettingsPanel from "./components/SettingsPanel";
import WelcomeScreen from "./components/WelcomeScreen";
import ConversationList from "./components/ConversationList";

function App() {
  const [isInitialized, setIsInitialized] = createSignal(false);
  const [initError, setInitError] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal(0);
  const { colorMode, toggleColorMode } = useColorMode();

  // Initialize the app
  onMount(async () => {
    try {
      await initializeStores();
      
      // Apply dark mode from settings
      if (settingsStore.settings().darkMode && colorMode() === "light") {
        toggleColorMode();
      }
      
      setIsInitialized(true);
      
    } catch (err) {
      console.error("App: Failed to initialize:", err);
      setInitError(`Failed to initialize app: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Cleanup on unmount
  onCleanup(async () => {
    try {
      // Clean up all store intervals
      if ((window as any).__chatStoreCleanup) {
        (window as any).__chatStoreCleanup();
      }
      if ((window as any).__fileTransferStoreCleanup) {
        (window as any).__fileTransferStoreCleanup();
      }
      
      // Clean up user store
      await userStore.cleanup();
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  return (
    <Show
      when={isInitialized()}
      fallback={
        <Center h="100vh" w="100vw">
          <VStack spacing="$4">
            <Heading>IP Chat</Heading>
            <Spinner thickness="4px" color="$primary9" />
            <Text>Initializing application...</Text>
            
            <Show when={initError()}>
              <Alert status="error" variant="solid">
                <AlertIcon />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{initError()}</AlertDescription>
              </Alert>
            </Show>
          </VStack>
        </Center>
      }
    >
      {/* Main Application */}
      <Box h="100vh" w="100vw" overflow="hidden">
        <Flex direction="column" h="100%">
          {/* Header */}
          <Box as="header" p="$4" bg="$primary9" color="white">
            <Flex justifyContent="space-between" alignItems="center">
              <Heading>IP Chat</Heading>
              <HStack spacing="$2">
                <Show when={userStore.localUser()}>
                  <Badge colorScheme="success" variant="solid">
                    {userStore.localUser()?.name}
                  </Badge>
                </Show>
                <IconButton
                  aria-label="Toggle dark mode"
                  icon={colorMode() === "dark" ? "☀️" : "🌙"}
                  onClick={() => {
                    toggleColorMode();
                    settingsStore.toggleDarkMode();
                  }}
                />
              </HStack>
            </Flex>
          </Box>

          {/* Main content */}
          <Box flex="1" overflow="hidden">
            <Tabs index={activeTab()} onChange={setActiveTab} h="100%" alignment="center">
              <TabList bg="$neutral2" overflowX="auto" overflowY="hidden">
                <Tab><Box as={FiMessageCircle} mr="$2" />Chat</Tab>
                <Tab><Box as={FiUsers} mr="$2" />Peers</Tab>
                <Tab><Box as={FiFile} mr="$2" />Files</Tab>
                <Tab><Box as={FiSettings} mr="$2" />Settings</Tab>
              </TabList>
              
              <Box h="calc(100% - 40px)" overflow="hidden">
                {/* Chat Panel */}
                <TabPanel h="100%" p="0">
                  <Show
                    when={chatStore.activeConversationId()}
                    fallback={
                      <Show
                        when={chatStore.conversations().length > 0}
                        fallback={<WelcomeScreen onStartChat={() => setActiveTab(1)} />}
                      >
                        <ConversationList
                          onSelectConversation={(peerId) => {
                            chatStore.setActiveConversationId(peerId);
                          }}
                          onStartChat={() => setActiveTab(1)}
                        />
                      </Show>
                    }
                  >
                    <ChatPanel />
                  </Show>
                </TabPanel>
                
                {/* Peers Panel */}
                <TabPanel h="100%" p="$4" overflow="auto">
                  <PeerList onSelectPeer={(peerId) => {
                    // Get the peer data directly
                    const peer = userStore.getPeerById(peerId);
                    if (!peer) {
                      return;
                    }
                    
                    // Ensure conversation exists for this peer
                    const conversation = chatStore.ensureConversationForPeer(peerId, peer);
                    if (conversation) {
                      chatStore.setActiveConversationId(peerId);
                      setActiveTab(0);
                    }
                  }} />
                </TabPanel>
                
                {/* Files Panel */}
                <TabPanel h="100%" p="$4" overflow="auto">
                  <FileTransferPanel />
                </TabPanel>
                
                {/* Settings Panel */}
                <TabPanel h="100%" p="$4" overflow="auto">
                  <SettingsPanel />
                </TabPanel>
              </Box>
            </Tabs>
          </Box>
        </Flex>
      </Box>
    </Show>
  );
}

export default App;