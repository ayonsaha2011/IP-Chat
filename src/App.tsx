import { createSignal, onMount, onCleanup, Show, createEffect, batch } from "solid-js";
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

// Import components (we'll create these later)
import ChatPanel from "./components/ChatPanel";
import PeerList from "./components/PeerList";
import FileTransferPanel from "./components/FileTransferPanel";
import SettingsPanel from "./components/SettingsPanel";
import WelcomeScreen from "./components/WelcomeScreen";

// Main app component (extracted for emergency re-render)
function MainApp() {
  const [activeTab, setActiveTab] = createSignal(0);
  const { colorMode, toggleColorMode } = useColorMode();

  return (
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
                  fallback={<WelcomeScreen onStartChat={() => setActiveTab(1)} />}
                >
                  <ChatPanel />
                </Show>
              </TabPanel>
              
              {/* Peers Panel */}
              <TabPanel h="100%" p="$4" overflow="auto">
                <PeerList onSelectPeer={(peerId) => {
                  chatStore.setActiveConversationId(peerId);
                  setActiveTab(0);
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
  );
}

function App() {
  // State
  const [isInitialized, setIsInitialized] = createSignal(false);
  const [initError, setInitError] = createSignal<string | null>(null);
  const [renderCount, setRenderCount] = createSignal(0);
  const [forceUpdate, setForceUpdate] = createSignal(0);
  const { colorMode, toggleColorMode } = useColorMode();
  
  // Force re-render when isInitialized changes
  createEffect(() => {
    console.log("App: isInitialized changed to:", isInitialized());
  });

  // Initialize the app
  onMount(async () => {
    try {
      console.log("App: Starting initialization...");
      await initializeStores();
      console.log("App: Stores initialized, applying settings...");
      
      // Apply dark mode from settings
      if (settingsStore.settings().darkMode && colorMode() === "light") {
        toggleColorMode();
      }
      
      console.log("App: Setting initialized to true");
      batch(() => {
        setIsInitialized(true);
        setRenderCount(prev => prev + 1);
        setForceUpdate(prev => prev + 1);
      });
      console.log("App: Initialization complete");
      
      // Force re-render by replacing the entire root
      setTimeout(() => {
        if (isInitialized()) {
          console.log("EMERGENCY: Re-rendering entire app");
          const root = document.getElementById("root");
          if (root) {
            import("solid-js/web").then(({ render }) => {
              import("@hope-ui/solid").then(({ HopeProvider }) => {
                import("solid-toast").then(({ Toaster }) => {
                  // Clear existing content
                  root.innerHTML = "";
                  // Re-render with proper providers
                  render(() => (
                    <HopeProvider config={{
                      initialColorMode: "system",
                      lightTheme: { colors: { primary9: "#0080e6" } },
                      darkTheme: { colors: { primary9: "#0080e6" } }
                    }}>
                      <Toaster position="top-right" />
                      {/* Render the actual main app */}
                      <MainApp />
                    </HopeProvider>
                  ), root);
                });
              });
            });
          }
        }
      }, 100);
      
    } catch (err) {
      console.error("Failed to initialize app:", err);
      setInitError(`Failed to initialize app: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Cleanup on unmount
  onCleanup(async () => {
    try {
      console.log("App: Starting cleanup...");
      await userStore.cleanup();
      console.log("App: Cleanup completed");
    } catch (err) {
      console.log("App: Non-critical error during cleanup:", err);
    }
  });

  console.log("App: Render #", renderCount(), "forceUpdate =", forceUpdate(), "isInitialized =", isInitialized());
  
  if (!isInitialized()) {
    return (
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
    );
  }

  // Render main app (this should never execute due to emergency workaround)
  return <MainApp />;
}

export default App;
