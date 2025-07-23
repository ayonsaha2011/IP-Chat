import { Component, createEffect, For, Show } from "solid-js";
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Divider,
  Badge,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Progress,
  IconButton,
  Tooltip,
} from "@hope-ui/solid";
import { FiX, FiRefreshCw, FiCheck } from "solid-icons/fi";
import { userStore, fileTransferStore } from "../stores";
import { formatRelativeTime, formatFileSize, calculateProgress, getStatusColor, getStatusText } from "../utils";
import { TransferStatus } from "../types";

const FileTransferPanel: Component = () => {
  // Refresh transfers on mount
  createEffect(() => {
    fileTransferStore.refreshTransfers();
  });

  // Get pending transfers
  const pendingTransfers = () => fileTransferStore.getPendingTransfers();
  
  // Get active transfers
  const activeTransfers = () => fileTransferStore.getActiveTransfers();
  
  // Get all transfers
  const allTransfers = () => fileTransferStore.transfers();

  return (
    <VStack spacing="$4" alignItems="stretch" w="100%">
      <HStack justifyContent="space-between" alignItems="center">
        <Heading>File Transfers</Heading>
        <Tooltip label="Refresh transfers">
          <IconButton
            aria-label="Refresh transfers"
            icon={<Box as={FiRefreshCw} />}
            onClick={() => fileTransferStore.refreshTransfers()}
            disabled={fileTransferStore.isLoading()}
          />
        </Tooltip>
      </HStack>

      <Divider />

      {/* Pending transfers section */}
      <Show when={pendingTransfers().length > 0}>
        <Box border="1px solid" borderColor="$neutral6" borderRadius="$lg">
          <VStack spacing="$4" p="$4" alignItems="stretch">
            <Heading>Pending Transfers</Heading>
            
            <For each={pendingTransfers()}>
              {(transfer) => {
                const sender = userStore.getPeerById(transfer.senderId);
                
                return (
                  <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
                    <VStack spacing="$2" alignItems="stretch">
                      <HStack justifyContent="space-between">
                        <Badge colorScheme="blue">Incoming</Badge>
                        <Text fontSize="$xs" color="$neutral11">
                          {formatRelativeTime(transfer.timestamp)}
                        </Text>
                      </HStack>
                      
                      <Text fontWeight="bold">{transfer.fileName}</Text>
                      <Text fontSize="$sm">{formatFileSize(transfer.fileSize)}</Text>
                      
                      <Text fontSize="$sm">
                        From: {sender?.name || transfer.senderId}
                      </Text>
                      
                      <HStack spacing="$2" mt="$2">
                        <Button
                          leftIcon={<Box as={FiCheck} />}
                          onClick={() => fileTransferStore.acceptFileTransfer(transfer.id)}
                        >
                          Accept
                        </Button>
                        
                        <Button
                          leftIcon={<Box as={FiX} />}
                          onClick={() => fileTransferStore.rejectFileTransfer(transfer.id)}
                        >
                          Reject
                        </Button>
                      </HStack>
                    </VStack>
                  </Box>
                );
              }}
            </For>
          </VStack>
        </Box>
      </Show>

      {/* Active transfers section */}
      <Show when={activeTransfers().length > 0}>
        <Box border="1px solid" borderColor="$neutral6" borderRadius="$lg">
          <VStack spacing="$4" p="$4" alignItems="stretch">
            <Heading>Active Transfers</Heading>
            
            <For each={activeTransfers()}>
              {(transfer) => {
                const peer = userStore.getPeerById(
                  transfer.senderId === userStore.localUser()?.id
                    ? transfer.recipientId
                    : transfer.senderId
                );
                const isUpload = transfer.senderId === userStore.localUser()?.id;
                const progress = calculateProgress(transfer.bytesTransferred, transfer.fileSize);
                
                return (
                  <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
                    <VStack spacing="$2" alignItems="stretch">
                      <HStack justifyContent="space-between">
                        <Badge colorScheme={isUpload ? "primary" : "success"}>
                          {isUpload ? "Uploading" : "Downloading"}
                        </Badge>
                        <Text fontSize="$xs" color="$neutral11">
                          {formatRelativeTime(transfer.timestamp)}
                        </Text>
                      </HStack>
                      
                      <Text fontWeight="bold">{transfer.fileName}</Text>
                      
                      <HStack justifyContent="space-between">
                        <Text fontSize="$sm">
                          {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.fileSize)}
                        </Text>
                        <Text fontSize="$sm" fontWeight="bold">
                          {progress}%
                        </Text>
                      </HStack>
                      
                      <Progress
                        value={progress}
                      />
                      
                      <Text fontSize="$sm">
                        {isUpload ? "To" : "From"}: {peer?.name || (isUpload ? transfer.recipientId : transfer.senderId)}
                      </Text>
                      
                      <Button
                        leftIcon={<Box as={FiX} />}
                        onClick={() => fileTransferStore.cancelFileTransfer(transfer.id)}
                      >
                        Cancel
                      </Button>
                    </VStack>
                  </Box>
                );
              }}
            </For>
          </VStack>
        </Box>
      </Show>

      {/* All transfers section */}
      <Show
        when={allTransfers().length > 0}
        fallback={
          <Alert status="info" variant="subtle">
            <AlertIcon />
            <AlertTitle>No file transfers</AlertTitle>
            <AlertDescription>
              You haven't sent or received any files yet.
            </AlertDescription>
          </Alert>
        }
      >
        <Box border="1px solid" borderColor="$neutral6" borderRadius="$lg">
          <VStack spacing="$4" p="$4" alignItems="stretch">
            <Heading>All Transfers</Heading>
            
            <For each={allTransfers()}>
              {(transfer) => {
                const peer = userStore.getPeerById(
                  transfer.senderId === userStore.localUser()?.id
                    ? transfer.recipientId
                    : transfer.senderId
                );
                const isUpload = transfer.senderId === userStore.localUser()?.id;
                const progress = calculateProgress(transfer.bytesTransferred, transfer.fileSize);
                const statusColor = getStatusColor(transfer.status);
                
                return (
                  <Box p="$4" border="1px solid" borderColor="$neutral6" borderRadius="$lg">
                    <VStack spacing="$2" alignItems="stretch">
                      <HStack justifyContent="space-between">
                        <HStack spacing="$2">
                          <Badge colorScheme={isUpload ? "primary" : "success"}>
                            {isUpload ? "Upload" : "Download"}
                          </Badge>
                          <Badge colorScheme={statusColor}>
                            {getStatusText(transfer.status)}
                          </Badge>
                        </HStack>
                        <Text fontSize="$xs" color="$neutral11">
                          {formatRelativeTime(transfer.timestamp)}
                        </Text>
                      </HStack>
                      
                      <Text fontWeight="bold">{transfer.fileName}</Text>
                      
                      <Show when={transfer.status === TransferStatus.InProgress}>
                        <HStack justifyContent="space-between">
                          <Text fontSize="$sm">
                            {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.fileSize)}
                          </Text>
                          <Text fontSize="$sm" fontWeight="bold">
                            {progress}%
                          </Text>
                        </HStack>
                        
                        <Progress
                          value={progress}
                        />
                      </Show>
                      
                      <Show when={transfer.status !== TransferStatus.InProgress}>
                        <Text fontSize="$sm">{formatFileSize(transfer.fileSize)}</Text>
                      </Show>
                      
                      <Text fontSize="$sm">
                        {isUpload ? "To" : "From"}: {peer?.name || (isUpload ? transfer.recipientId : transfer.senderId)}
                      </Text>
                      
                      <Show when={transfer.error}>
                        <Alert status="error" variant="subtle">
                          <AlertIcon />
                          <AlertDescription>{transfer.error}</AlertDescription>
                        </Alert>
                      </Show>
                    </VStack>
                  </Box>
                );
              }}
            </For>
          </VStack>
        </Box>
      </Show>

      <Show when={fileTransferStore.error()}>
        <Alert status="error" variant="subtle">
          <AlertIcon />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{fileTransferStore.error()}</AlertDescription>
        </Alert>
      </Show>
    </VStack>
  );
};

export default FileTransferPanel;
