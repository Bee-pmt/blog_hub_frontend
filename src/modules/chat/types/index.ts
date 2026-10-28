export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  content: string | null;
  deletedAt: string | null;
  isRead: boolean;
  createdAt: string;
};

export type Conversation = {
  id: string;
  otherUser: { id: string; displayName: string };
  lastMessage: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ConversationPage = {
  items: Conversation[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type MessagePage = {
  items: ChatMessage[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type MessageDeleted = {
  messageId: string;
  conversationId: string;
  deletedAt: string;
};
