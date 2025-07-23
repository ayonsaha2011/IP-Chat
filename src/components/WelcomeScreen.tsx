import { Component } from "solid-js";
import {
  Box,
  Center,
  VStack,
  Heading,
  Text,
  Button,
  Image,
  useColorMode,
} from "@hope-ui/solid";
import { FiUsers } from "solid-icons/fi";

interface WelcomeScreenProps {
  onStartChat: () => void;
}

const WelcomeScreen: Component<WelcomeScreenProps> = (props) => {
  const { colorMode } = useColorMode();
  
  return (
    <Center h="100%" w="100%" p="$8">
      <VStack spacing="$8" maxW="$96" w="100%" textAlign="center">
        <Heading color="$primary9" fontSize="$2xl">IP Chat</Heading>
        
        <Box
          boxSize="$32"
          borderRadius="$full"
          bg="$primary2"
          p="$6"
          border="4px solid"
          borderColor="$primary9"
        >
          <Image
            src={colorMode() === "dark" ? "/chat-icon-dark.svg" : "/chat-icon-light.svg"}
            alt="Chat Icon"
            fallback={
              <Center h="100%" w="100%" fontSize="$5xl" color="$primary9">
                💬
              </Center>
            }
          />
        </Box>
        
        <VStack spacing="$4">
          <Heading fontSize="$lg">Welcome to IP Chat</Heading>
          <Text>
            A modern lightweight local network chat and file sharing application.
            Connect with others on your local network without the need for internet access.
          </Text>
        </VStack>
        
        <Button
          onClick={props.onStartChat}
        >
          <Box as={FiUsers} mr="$2" />
          Find People Nearby
        </Button>
        
        <Text fontSize="$sm" color="$neutral11">
          Your IP: {localStorage.getItem("local-ip") || "Discovering..."}
        </Text>
      </VStack>
    </Center>
  );
};

export default WelcomeScreen;
