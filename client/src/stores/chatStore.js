import { create } from 'zustand';
import api from '../lib/api';

const useChatStore = create((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  hasMoreMessages: true,
  typingUsers: {}, // { conversationId: { userId: displayName } }
  recordingUsers: {}, // { conversationId: { userId: displayName } }
  onlineUsers: new Set(),
  drafts: JSON.parse(localStorage.getItem('nexchat_drafts') || '{}'),
  unreadTotal: 0,

  // ====== CONVERSATIONS ======
  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const { data } = await api.get('/conversations');
      const convs = data.conversations || [];
      const unreadTotal = convs.reduce((sum, c) => sum + (c._participant?.unreadCount || 0), 0);
      set({ conversations: convs, isLoadingConversations: false, unreadTotal });
    } catch (error) {
      console.error('Fetch conversations error:', error);
      set({ isLoadingConversations: false });
    }
  },

  getOrCreateConversation: async (userId) => {
    try {
      const { data } = await api.post(`/conversations/private/${userId}`);
      const conv = data.conversation;
      set((state) => {
        const exists = state.conversations.find(c => c._id === conv._id);
        if (!exists) {
          return { conversations: [conv, ...state.conversations] };
        }
        return {};
      });
      return conv;
    } catch (error) {
      console.error('Get/create conversation error:', error);
      throw error;
    }
  },

  setActiveConversation: (conversation) => {
    set({ activeConversation: conversation, messages: [], hasMoreMessages: true });
    if (conversation) {
      get().fetchMessages(conversation._id);
      get().markAsRead(conversation._id);
    }
  },

  updateConversation: async (conversationId, updates) => {
    try {
      await api.put(`/conversations/${conversationId}`, updates);
      set((state) => ({
        conversations: state.conversations.map(c =>
          c._id === conversationId ? { ...c, _participant: { ...c._participant, ...updates } } : c
        ),
      }));
    } catch (error) {
      console.error('Update conversation error:', error);
    }
  },

  // ====== MESSAGES ======
  fetchMessages: async (conversationId, before = null) => {
    set({ isLoadingMessages: true });
    try {
      const params = { limit: 50 };
      if (before) params.before = before;
      const { data } = await api.get(`/messages/${conversationId}`, { params });
      set((state) => ({
        messages: before ? [...data.messages, ...state.messages] : data.messages,
        hasMoreMessages: data.pagination?.hasMore || false,
        isLoadingMessages: false,
      }));
    } catch (error) {
      console.error('Fetch messages error:', error);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (conversationId, messageData) => {
    try {
      const clientId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Optimistic update
      const optimisticMsg = {
        _id: clientId,
        ...messageData,
        clientId,
        status: 'sending',
        createdAt: new Date().toISOString(),
        sender: { _id: 'self' },
        reactions: [],
        _optimistic: true,
      };

      set((state) => ({
        messages: [...state.messages, optimisticMsg],
      }));

      const { data } = await api.post(`/messages/${conversationId}`, {
        ...messageData,
        clientId,
      });

      // Replace optimistic message with real one
      set((state) => ({
        messages: state.messages.map(m =>
          m.clientId === clientId ? data.message : m
        ),
      }));

      // Update conversation list
      get().updateConversationInList(conversationId, data.message);

      return data.message;
    } catch (error) {
      // Mark optimistic message as failed
      set((state) => ({
        messages: state.messages.map(m =>
          m._optimistic && m.status === 'sending'
            ? { ...m, status: 'failed' }
            : m
        ),
      }));
      console.error('Send message error:', error);
      throw error;
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const { data } = await api.put(`/messages/${messageId}/edit`, { content });
      set((state) => ({
        messages: state.messages.map(m =>
          m._id === messageId ? data.message : m
        ),
      }));
    } catch (error) {
      console.error('Edit message error:', error);
      throw error;
    }
  },

  deleteMessage: async (messageId, forEveryone = false) => {
    try {
      await api.delete(`/messages/${messageId}`, { data: { forEveryone } });
      if (forEveryone) {
        set((state) => ({
          messages: state.messages.map(m =>
            m._id === messageId ? { ...m, isDeletedForEveryone: true, content: '' } : m
          ),
        }));
      } else {
        set((state) => ({
          messages: state.messages.filter(m => m._id !== messageId),
        }));
      }
    } catch (error) {
      console.error('Delete message error:', error);
      throw error;
    }
  },

  reactToMessage: async (messageId, emoji) => {
    try {
      const { data } = await api.post(`/messages/${messageId}/react`, { emoji });
      set((state) => ({
        messages: state.messages.map(m =>
          m._id === messageId ? { ...m, reactions: data.reactions } : m
        ),
      }));
    } catch (error) {
      console.error('React error:', error);
    }
  },

  toggleStarMessage: async (messageId) => {
    try {
      await api.post(`/messages/${messageId}/star`);
      set((state) => ({
        messages: state.messages.map(m => {
          if (m._id !== messageId) return m;
          const starredBy = Array.isArray(m.starredBy) ? [...m.starredBy] : [];
          // toggle optimistic
          return { ...m, starredBy };
        })
      }));
    } catch (error) {
      console.error('Star error:', error);
    }
  },

  forwardMessage: async (messageId, conversationIds) => {
    try {
      await api.post(`/messages/${messageId}/forward`, { conversationIds });
    } catch (error) {
      console.error('Forward error:', error);
      throw error;
    }
  },

  votePoll: async (messageId, optionIndex) => {
    try {
      const { data } = await api.post(`/messages/${messageId}/poll/vote`, { optionIndex });
      set((state) => ({
        messages: state.messages.map(m =>
          m._id === messageId ? { ...m, poll: data.poll } : m
        ),
      }));
    } catch (error) {
      console.error('Poll vote error:', error);
    }
  },

  // Multi-select & editing states
  editingMessage: null,
  setEditingMessage: (message) => set({ editingMessage: message }),

  replyingMessage: null,
  setReplyingMessage: (message) => set({ replyingMessage: message }),

  selectedMessageIds: [],
  toggleSelectMessage: (messageId) => {
    set((state) => {
      const exists = state.selectedMessageIds.includes(messageId);
      return {
        selectedMessageIds: exists
          ? state.selectedMessageIds.filter(id => id !== messageId)
          : [...state.selectedMessageIds, messageId],
      };
    });
  },
  clearSelectedMessages: () => set({ selectedMessageIds: [] }),

  batchDeleteMessages: async (messageIds, forEveryone = false) => {
    for (const id of messageIds) {
      try {
        await api.delete(`/messages/${id}`, { data: { forEveryone } });
      } catch (e) {}
    }
    if (forEveryone) {
      set((state) => ({
        messages: state.messages.map(m =>
          messageIds.includes(m._id) ? { ...m, isDeletedForEveryone: true, content: '' } : m
        ),
        selectedMessageIds: [],
      }));
    } else {
      set((state) => ({
        messages: state.messages.filter(m => !messageIds.includes(m._id)),
        selectedMessageIds: [],
      }));
    }
  },

  batchStarMessages: async (messageIds) => {
    for (const id of messageIds) {
      try {
        await api.post(`/messages/${id}/star`);
      } catch (e) {}
    }
    set({ selectedMessageIds: [] });
  },

  batchForwardMessages: async (messageIds, conversationIds) => {
    for (const id of messageIds) {
      try {
        await api.post(`/messages/${id}/forward`, { conversationIds });
      } catch (e) {}
    }
    set({ selectedMessageIds: [] });
  },

  markAsRead: async (conversationId) => {
    try {
      await api.post(`/messages/${conversationId}/read`);
      set((state) => ({
        conversations: state.conversations.map(c =>
          c._id === conversationId
            ? { ...c, _participant: { ...c._participant, unreadCount: 0 } }
            : c
        ),
      }));
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  },

  // ====== REAL-TIME HANDLERS ======
  addMessage: (message, conversationId) => {
    const state = get();
    if (state.activeConversation?._id === conversationId) {
      // Check for duplicates
      const exists = state.messages.some(m =>
        m._id === message._id || (m.clientId && m.clientId === message.clientId)
      );
      if (!exists) {
        set({ messages: [...state.messages, message] });
      }
      // Auto mark as read
      state.markAsRead(conversationId);
    }
    state.updateConversationInList(conversationId, message);
  },

  updateMessageInList: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map(m =>
        m._id === messageId ? { ...m, ...updates } : m
      ),
    }));
  },

  updateConversationInList: (conversationId, lastMessage) => {
    set((state) => {
      const convs = [...state.conversations];
      const idx = convs.findIndex(c => c._id === conversationId);
      if (idx !== -1) {
        convs[idx] = {
          ...convs[idx],
          lastMessage,
          lastMessageAt: new Date().toISOString(),
        };
        // Move to top
        const [conv] = convs.splice(idx, 1);
        convs.unshift(conv);
      }
      return { conversations: convs };
    });
  },

  setTypingUser: (conversationId, userId, displayName) => {
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: {
          ...state.typingUsers[conversationId],
          [userId]: displayName,
        },
      },
    }));

    // Auto-clear after 3 seconds
    setTimeout(() => {
      get().clearTypingUser(conversationId, userId);
    }, 3000);
  },

  clearTypingUser: (conversationId, userId) => {
    set((state) => {
      const convTyping = { ...state.typingUsers[conversationId] };
      delete convTyping[userId];
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: convTyping,
        },
      };
    });
  },

  setRecordingUser: (conversationId, userId, displayName) => {
    set((state) => ({
      recordingUsers: {
        ...state.recordingUsers,
        [conversationId]: {
          ...state.recordingUsers[conversationId],
          [userId]: displayName,
        },
      },
    }));
  },

  clearRecordingUser: (conversationId, userId) => {
    set((state) => {
      const convRecording = { ...state.recordingUsers[conversationId] };
      delete convRecording[userId];
      return {
        recordingUsers: {
          ...state.recordingUsers,
          [conversationId]: convRecording,
        },
      };
    });
  },

  setUserOnline: (userId) => {
    set((state) => {
      const online = new Set(state.onlineUsers);
      online.add(userId);
      return { onlineUsers: online };
    });
  },

  setUserOffline: (userId) => {
    set((state) => {
      const online = new Set(state.onlineUsers);
      online.delete(userId);
      return { onlineUsers: online };
    });
  },

  // Drafts
  saveDraft: (conversationId, text) => {
    const drafts = { ...get().drafts };
    if (text) {
      drafts[conversationId] = text;
    } else {
      delete drafts[conversationId];
    }
    localStorage.setItem('nexchat_drafts', JSON.stringify(drafts));
    set({ drafts });
  },

  getDraft: (conversationId) => {
    return get().drafts[conversationId] || '';
  },
}));

export default useChatStore;
