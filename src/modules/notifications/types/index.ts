export type Notification = {
  id: string;
  userId: string;
  type: "post_unpublished" | "post_deleted";
  blogId: string;
  blogTitle: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  items: Notification[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unreadCount: number;
};
