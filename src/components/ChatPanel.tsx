import { Component, createSignal, createEffect, For, Show } from "solid-js";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Avatar,
  Divider,
  IconButton,
  Tooltip,
  Flex,
} from "@hope-ui/solid";
import { FiSend, FiPaperclip, FiArrowLeft } from "solid-icons/fi";
import { userStore, chatStore, fileTransferStore } from "../stores";
import { formatRelativeTime, getInitials, stringToColor, formatFileSize, getStatusColor } from "../utils";
import { TransferStatus } from "../types";

const ChatPanel: Component = () => {
  // Local state
  const [message, setMessage] = createSignal("");
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | null>(null);
  
  // Get active conversation
  const activeConversation = () => chatStore.getActiveConversation();
  const peer = () => activeConversation()?.peer;
  
  // Scroll to bottom when new items arrive
  createEffect(() => {
    const scrollElement = scrollRef();
    if (scrollElement && activeConversation()?.items) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  });
  
  // Mark messages as read when conversation is active
  createEffect(() => {
    const peerId = chatStore.activeConversationId();
    if (peerId) {
      chatStore.markMessagesAsRead(peerId);
    }
  });
  
  // No need for periodic refresh - using real-time events from backend
  // Messages are automatically updated via event listeners in chatStore
  
  // Send message
  const handleSendMessage = async () => {
    const content = message().trim();
    const currentPeer = peer();
    
    if (!content || !currentPeer) return;
    
    try {
      await chatStore.sendMessage(currentPeer.id, content);
      setMessage("");
      
      // No need to force refresh - real-time events will update the UI
    } catch (err) {
      console.error("Failed to send message:", err instanceof Error ? err.message : String(err));
    }
  };
  
  // Handle key press
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Send file
  const handleSendFile = async () => {
    if (!peer()) return;
    await fileTransferStore.sendFile(peer()!.id);
  };
  
  return (
    <Flex direction="column" h="100%" w="100%">
      {/* Chat header */}
      <HStack p="$4" bg="$neutral2" spacing="$4">
        <IconButton
          aria-label="Back"
          icon={<Box as={FiArrowLeft} />}
          onClick={() => chatStore.setActiveConversationId(null)}
        />
        
        <Show when={peer()}>
          <Avatar
            name={peer()?.name}
            getInitials={() => getInitials(peer()?.name || "")}
            bg={stringToColor(peer()?.id || "")}
            color="white"
          />
          
          <VStack spacing="$0">
            <Text fontWeight="bold">{peer()?.name}</Text>
            <Text fontSize="$xs" color="$neutral11">{peer()?.ip}</Text>
          </VStack>
        </Show>
        
        <Box flex="1" />
        
        <Tooltip label="Send file">
          <IconButton
            aria-label="Send file"
            icon={<Box as={FiPaperclip} />}
            onClick={handleSendFile}
          />
        </Tooltip>
      </HStack>
      
      <Divider />
      
      {/* Chat messages */}
      <Box
        flex="1"
        overflowY="auto"
        p="$4"
        ref={setScrollRef}
      >
        <VStack spacing="$4" pb="$4" alignItems="stretch">
          <Show
            when={activeConversation()?.items.length}
            fallback={
              <Box p="$4" textAlign="center">
                <Text>No messages yet. Say hello!</Text>
              </Box>
            }
          >
            <For each={activeConversation()?.items}>
              {(item) => {
                const isFromMe = item.senderId === userStore.localUser()?.id;
                
                return (
                  <HStack
                    spacing="$2"
                    justifyContent={isFromMe ? "flex-end" : "flex-start"}
                  >
                    <Show when={!isFromMe}>
                      <Avatar
                        name={peer()?.name}
                        getInitials={() => getInitials(peer()?.name || "")}
                        bg={stringToColor(peer()?.id || "")}
                        color="white"
                      />
                    </Show>
                    
                    <Box
                      bg={isFromMe ? "$primary9" : "$neutral3"}
                      color={isFromMe ? "white" : "inherit"}
                      maxW="75%"
                      p="$3"
                      borderRadius="$lg"
                    >
                      <VStack spacing="$1">
                        <Show when={item.type === 'message'}>
                          <Text>{item.content}</Text>
                        </Show>
                        
                        <Show when={item.type === 'file'}>
                          <VStack spacing="$2" alignItems="start">
                            <HStack spacing="$2" alignItems="center">
                              <Text fontSize="$lg">📁</Text>
                              <VStack spacing="$0" alignItems="start">
                                <Text fontWeight="bold">{item.fileName}</Text>
                                <Text fontSize="$xs" opacity="0.8">
                                  {formatFileSize(item.fileSize || 0)}
                                </Text>
                              </VStack>
                            </HStack>
                            
                            <Show when={item.status}>
                              <Text 
                                fontSize="$xs" 
                                color={getStatusColor(item.status as TransferStatus)}
                                fontWeight="bold"
                              >
                                Status: {item.status}
                                <Show when={item.status === TransferStatus.InProgress && item.bytesTransferred !== undefined && item.fileSize !== undefined && item.fileSize > 0}>
                                  {` (${Math.round((item.bytesTransferred! / item.fileSize!) * 100)}%)`}
                                </Show>
                              </Text>
                            </Show>
                            
                            <Show when={item.error}>
                              <Text fontSize="$xs" color="red">
                                Error: {item.error}
                              </Text>
                            </Show>
                          </VStack>
                        </Show>
                        
                        <Text fontSize="$xs" opacity="0.8">
                          {formatRelativeTime(item.timestamp)}
                          {isFromMe && item.type === 'message' && (
                            <Show
                              when={item.read}
                              fallback={<Box as="span" ml="$1">✓</Box>}
                            >
                              <Box as="span" ml="$1">✓✓</Box>
                            </Show>
                          )}
                        </Text>
                      </VStack>
                    </Box>
                    
                    <Show when={isFromMe}>
                      <Avatar
                        name={userStore.localUser()?.name}
                        getInitials={() => getInitials(userStore.localUser()?.name || "")}
                        bg={stringToColor(userStore.localUser()?.id || "")}
                        color="white"
                      />
                    </Show>
                  </HStack>
                );
              }}
            </For>
          </Show>
        </VStack>
      </Box>
      
      {/* Message input */}
      <Box p="$4" bg="$neutral2">
        <HStack spacing="$2">
          <Input
            placeholder="Type a message..."
            value={message()}
            onInput={(e: Event & { currentTarget: HTMLInputElement; target: Element; }) => setMessage(e.currentTarget.value)}
            onKeyPress={handleKeyPress}
            flex="1"
            size="md"
            variant="outline"
          />
          
          <Button
            onClick={handleSendMessage}
            disabled={!message().trim()}
          >
            <Box as={FiSend} mr="$2" />
            Send
          </Button>
        </HStack>
      </Box>
    </Flex>
  );
};

export default ChatPanel;
