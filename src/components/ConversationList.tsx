import { Component, For, Show } from "solid-js";
import {
  Box,
  VStack,
  HStack,
  Text,
  Avatar,
  Badge,
  Center,
} from "@hope-ui/solid";
import { chatStore } from "../stores";
import { formatRelativeTime, getInitials, stringToColor } from "../utils";

interface ConversationListProps {
  onSelectConversation: (peerId: string) => void;
  onStartChat: () => void;
}

const ConversationList: Component<ConversationListProps> = (props) => {
  const conversations = () => chatStore.conversations();

  return (
    <Box h="100%" w="100%" overflow="hidden">
      <Show
        when={conversations().length > 0}
        fallback={
          <Center h="100%" w="100%" p="$8">
            <VStack spacing="$4" textAlign="center">
              <Text fontSize="$xl" fontWeight="bold" color="$neutral11">
                No conversations yet
              </Text>
              <Text color="$neutral10">
                Start a conversation by finding people nearby
              </Text>
              <Box
                as="button"
                onClick={props.onStartChat}
                color="$primary9"
                fontWeight="medium"
                _hover={{ textDecoration: "underline" }}
              >
                Find People Nearby →
              </Box>
            </VStack>
          </Center>
        }
      >
        <VStack spacing="$0" alignItems="stretch">
          <For each={conversations()}>
            {(conversation) => (
              <Box
                as="button"
                w="100%"
                p="$4"
                textAlign="left"
                borderBottom="1px solid"
                borderColor="$neutral6"
                _hover={{ bg: "$neutral3" }}
                onClick={() => props.onSelectConversation(conversation.peer.id)}
              >
                <HStack spacing="$3" alignItems="start">
                  <Avatar
                    name={conversation.peer.name}
                    getInitials={() => getInitials(conversation.peer.name)}
                    bg={stringToColor(conversation.peer.id)}
                    color="white"
                    flexShrink={0}
                  />
                  
                  <VStack alignItems="start" flex="1" spacing="$1" minW="0">
                    <HStack justifyContent="space-between" w="100%">
                      <Text fontWeight="bold" fontSize="$md" truncate>
                        {conversation.peer.name}
                      </Text>
                      <Text fontSize="$xs" color="$neutral11" flexShrink={0}>
                        {conversation.lastMessage 
                          ? formatRelativeTime(conversation.lastMessage.timestamp)
                          : "Just now"
                        }
                      </Text>
                    </HStack>
                    
                    <HStack justifyContent="space-between" w="100%">
                      <Text
                        fontSize="$sm"
                        color={conversation.lastMessage ? "$neutral11" : "$neutral10"}
                        truncate
                        flex="1"
                      >
                        {conversation.lastMessage?.content || "Start a conversation..."}
                      </Text>
                      
                      <Show when={conversation.unreadCount > 0}>
                        <Badge
                          colorScheme="primary"
                          variant="solid"
                          borderRadius="$full"
                          fontSize="$xs"
                          flexShrink={0}
                          ml="$2"
                        >
                          {conversation.unreadCount}
                        </Badge>
                      </Show>
                    </HStack>
                    
                    <Text fontSize="$xs" color="$neutral10">
                      {conversation.peer.ip}
                    </Text>
                  </VStack>
                </HStack>
              </Box>
            )}
          </For>
        </VStack>
      </Show>
    </Box>
  );
};

export default ConversationList;