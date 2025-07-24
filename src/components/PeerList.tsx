import { Component, createEffect, For, Show } from "solid-js";
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Avatar,
  Divider,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  IconButton,
  Tooltip,
  Center,
} from "@hope-ui/solid";
import { FiMessageCircle, FiRefreshCw, FiPaperclip } from "solid-icons/fi";
import { userStore, chatStore, fileTransferStore } from "../stores";
import { formatRelativeTime, getInitials, stringToColor } from "../utils";

interface PeerListProps {
  onSelectPeer: (peerId: string) => void;
}

const PeerList: Component<PeerListProps> = (props) => {
  // Refresh peers on mount
  createEffect(() => {
    userStore.refreshPeers();
  });

  return (
    <VStack spacing="$4" alignItems="stretch" w="100%">
      <HStack justifyContent="space-between" alignItems="center">
        <Heading>People Nearby</Heading>
        <HStack spacing="$2">
          <Badge colorScheme={userStore.isDiscoveryRunning() ? "success" : "danger"}>
            {userStore.isDiscoveryRunning() ? "Discovering" : "Stopped"}
          </Badge>
          <Tooltip label="Refresh peers">
            <IconButton
              aria-label="Refresh peers"
              icon={<Box as={FiRefreshCw} />}
              onClick={() => userStore.refreshPeers()}
              disabled={userStore.isLoading()}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Divider />

      <Show
        when={!userStore.isLoading()}
        fallback={
          <Center p="$8">
            <Spinner thickness="4px" color="$primary9" />
          </Center>
        }
      >
        <Show
          when={userStore.peers().length > 0}
          fallback={
            <Alert status="info" variant="subtle">
              <AlertIcon />
              <AlertTitle>No peers found</AlertTitle>
              <AlertDescription>
                Make sure other devices are running IP Chat on the same network.
              </AlertDescription>
            </Alert>
          }
        >
          <VStack spacing="$4" alignItems="stretch">
            <For each={userStore.peers()}>
              {(peer) => {
                // Get conversation for this peer
                const conversation = () => chatStore.getConversationByPeerId(peer.id);
                
                return (
                  <Box border="1px solid" borderColor="$neutral6" borderRadius="$lg">
                    <HStack spacing="$4" p="$4">
                      <Avatar
                        name={peer.name}
                        getInitials={() => getInitials(peer.name)}
                        bg={stringToColor(peer.id)}
                        color="white"
                      />
                      
                      <VStack alignItems="start" flex="1" spacing="$1">
                        <Text fontWeight="bold">{peer.name}</Text>
                        <Text fontSize="$sm" color="$neutral11">{peer.ip}</Text>
                        <Text fontSize="$xs" color="$neutral10">
                          Last seen {formatRelativeTime(peer.lastSeen)}
                        </Text>
                        
                        <Show when={conversation() && conversation()!.unreadCount > 0}>
                          <Badge colorScheme="primary" variant="solid">
                            {conversation()!.unreadCount} new {conversation()!.unreadCount === 1 ? 'message' : 'messages'}
                          </Badge>
                        </Show>
                      </VStack>
                      
                      <VStack spacing="$2">
                        <Button
                          leftIcon={<Box as={FiMessageCircle} />}
                          onClick={() => {
                            console.log(`PeerList: Selecting peer ${peer.name} (${peer.id})`);
                            props.onSelectPeer(peer.id);
                          }}
                        >
                          Chat
                        </Button>
                        
                        <Button
                          leftIcon={<Box as={FiPaperclip} />}
                          onClick={() => fileTransferStore.sendFile(peer.id)}
                        >
                          Send File
                        </Button>
                      </VStack>
                    </HStack>
                  </Box>
                );
              }}
            </For>
          </VStack>
        </Show>
      </Show>

      <Show when={userStore.error()}>
        <Alert status="error" variant="subtle">
          <AlertIcon />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{userStore.error()}</AlertDescription>
        </Alert>
      </Show>
    </VStack>
  );
};

export default PeerList;
