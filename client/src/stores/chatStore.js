import { create } from 'zustand';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import useAuthStore from './authStore';

export const getConvTime = (c) => {
  if (!c) return 0;
  if (c.lastMessage?.createdAt) {
    const t = new Date(c.lastMessage.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (c.lastMessageAt) {
    const t = new Date(c.lastMessageAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (c.createdAt) {
    const t = new Date(c.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
};

export const sortConversations = (conversations) => {
  if (!Array.isArray(conversations)) return [];
  return [...conversations].sort((a, b) => {
    // 1. Pinned conversations always on top
    const aPinned = a._participant?.isPinned || a.isPinned ? 1 : 0;
    const bPinned = b._participant?.isPinned || b.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    // 2. Strict latest activity timestamp (0ms instant ordering)
    const aTime = getConvTime(a);
    const bTime = getConvTime(b);
    if (bTime !== aTime) return bTime - aTime;
    return (b._id?.toString() || '').localeCompare(a._id?.toString() || '');
  });
};

const getCachedConversations = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('nexchat_cached_conversations');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const initialCachedConvs = getCachedConversations();

const useChatStore = create((set, get) => ({
  conversations: initialCachedConvs,
  activeConversation: null,
  messages: [],
  messagesCache: {}, // { [conversationId]: { messages: [], hasMore: boolean } }
  isLoadingConversations: false,
  isLoadingMessages: false,
  hasMoreMessages: true,
  typingUsers: {}, // { conversationId: { userId: displayName } }
  recordingUsers: {}, // { conversationId: { userId: displayName } }
  onlineUsers: new Set(),
  drafts: (() => {
    try {
      return typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('nexchat_drafts') || '{}') : {};
    } catch (e) {
      return {};
    }
  })(),
  unreadTotal: initialCachedConvs.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
  lastSyncTime: null,

  // ====== CONVERSATIONS ======
  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const { data } = await api.get('/conversations');
      const rawConvs = data.conversations || [];
      const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();

      // Ensure no private conversation with a deleted user enters the store
      const convs = rawConvs.filter((c) => {
        if (!c) return false;
        if (c.type === 'private') {
          const other = c.participants?.find((p) => {
            if (!p || !p.user) return false;
            const pId = (p.user._id || p.user)?.toString();
            return pId && myId && pId !== myId;
          });
          if (!other || !other.user) return false;
          if (typeof other.user === 'object' && !other.user._id && !other.user.displayName && !other.user.username) {
            return false;
          }
        }
        return true;
      });

      const unreadTotal = convs.reduce((sum, c) => {
        const myP = c._participant || c.participants?.find(p => (p.user?._id || p.user)?.toString() === myId);
        const count = typeof c.unreadCount === 'number' ? c.unreadCount : (myP?.unreadCount || 0);
        return sum + Math.max(0, count);
      }, 0);
      const sorted = sortConversations(convs);
      set({ conversations: sorted, isLoadingConversations: false, unreadTotal });
      try {
        localStorage.setItem('nexchat_cached_conversations', JSON.stringify(sorted.slice(0, 50)));
      } catch (e) {}
    } catch (error) {
      console.error('Fetch conversations error:', error);
      set({ isLoadingConversations: false });
    }
  },

  syncMissedMessages: async () => {
    try {
      const lastSync = get().lastSyncTime || new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await api.get('/messages/sync', { params: { since: lastSync } });
      const missed = data.messages || [];
      const syncTimestamp = data.syncTimestamp || new Date().toISOString();

      if (missed.length > 0) {
        const state = get();
        const activeConvId = (state.activeConversation?._id || state.activeConversation?.id || state.activeConversation)?.toString();

        missed.forEach((msg) => {
          const msgConvId = (msg.conversation?._id || msg.conversation)?.toString();
          if (activeConvId && msgConvId && activeConvId === msgConvId) {
            state.addMessage(msg, msgConvId);
          } else {
            state.updateConversationInList(msgConvId, msg);
          }
        });
      }

      set({ lastSyncTime: syncTimestamp });
    } catch (error) {
      console.warn('Sync missed messages note:', error.message);
    }
  },

  getOrCreateConversation: async (userId) => {
    try {
      const { data } = await api.post(`/conversations/private/${userId}`);
      const conv = data.conversation;
      set((state) => {
        const exists = state.conversations.find(c => c._id === conv._id);
        if (!exists) {
          return { conversations: sortConversations([conv, ...state.conversations]) };
        }
        return {};
      });
      return conv;
    } catch (error) {
      console.error('Get/create conversation error:', error);
      throw error;
    }
  },

  // Monotonically increasing counter to prevent stale fetch responses from overwriting current conversation
  _fetchGeneration: 0,

  setActiveConversation: (conversation) => {
    // Bump generation so any in-flight fetchMessages for the OLD conversation is discarded
    const gen = (get()._fetchGeneration || 0) + 1;
    if (!conversation) {
      set({
        activeConversation: null,
        messages: [],
        hasMoreMessages: false,
        isLoadingMessages: false,
        _fetchGeneration: gen,
      });
      return;
    }

    const convId = (conversation._id || conversation.id)?.toString();
    const cached = get().messagesCache[convId];

    if (cached && Array.isArray(cached.messages) && cached.messages.length > 0) {
      // 0ms instant display from memory cache — no spinner, zero delay!
      set({
        activeConversation: conversation,
        messages: cached.messages,
        hasMoreMessages: cached.hasMore ?? false,
        isLoadingMessages: false,
        _fetchGeneration: gen,
      });
      // Silently revalidate in background (SWR pattern)
      get().fetchMessages(convId, null, true);
    } else {
      // Clean fresh load: avoid flashing days-old lastMessage which triggered inverted scroll pagination
      set({
        activeConversation: conversation,
        messages: [],
        hasMoreMessages: true,
        isLoadingMessages: true,
        _fetchGeneration: gen,
      });
      get().fetchMessages(convId);
    }

    // Silently revalidate conversation participants (avatar, name, bio) in background
    api.get(`/conversations/${convId}`).then((res) => {
      if (res.data?.conversation) {
        const freshConv = res.data.conversation;
        set((s) => {
          const isStillActive = (s.activeConversation?._id || s.activeConversation?.id)?.toString() === convId;
          const updatedConvs = s.conversations.map((c) =>
            (c._id || c.id)?.toString() === convId ? { ...c, ...freshConv } : c
          );
          return {
            conversations: updatedConvs,
            activeConversation: isStillActive ? { ...s.activeConversation, ...freshConv } : s.activeConversation,
          };
        });
      }
    }).catch(() => {});

    get().markAsRead(convId);
  },

  updateUserAvatar: (userId, avatar) => {
    if (!userId) return;
    const uid = userId.toString();
    set((state) => {
      const updatedConvs = state.conversations.map((c) => {
        let hasParticipant = false;
        const newParticipants = (c.participants || []).map((p) => {
          const pId = (p.user?._id || p.user)?.toString();
          if (pId === uid) {
            hasParticipant = true;
            return {
              ...p,
              user: typeof p.user === 'object' && p.user !== null
                ? { ...p.user, avatar }
                : { _id: p.user, avatar },
            };
          }
          return p;
        });

        if (hasParticipant) {
          return { ...c, participants: newParticipants };
        }
        return c;
      });

      let updatedActive = state.activeConversation;
      if (updatedActive) {
        const otherP = updatedActive.participants?.find((p) => (p.user?._id || p.user)?.toString() === uid);
        if (otherP) {
          const updatedActiveParticipants = updatedActive.participants.map((p) => {
            if ((p.user?._id || p.user)?.toString() === uid) {
              return {
                ...p,
                user: typeof p.user === 'object' && p.user !== null ? { ...p.user, avatar } : { _id: p.user, avatar },
              };
            }
            return p;
          });
          updatedActive = { ...updatedActive, participants: updatedActiveParticipants };
        }
      }

      try {
        localStorage.setItem('nexchat_cached_conversations', JSON.stringify(updatedConvs.slice(0, 50)));
      } catch (e) {}

      return {
        conversations: updatedConvs,
        activeConversation: updatedActive,
      };
    });
  },

  addConversation: (conv) => {
    if (!conv || !conv._id) return;
    set((state) => {
      const filtered = state.conversations.filter(c => c._id?.toString() !== conv._id?.toString());
      return { conversations: sortConversations([conv, ...filtered]) };
    });
  },

  updateConversationInStore: (conversationId, updates) => {
    if (!conversationId) return;
    set((state) => {
      const updated = state.conversations.map(c =>
        c._id?.toString() === conversationId?.toString() ? { ...c, ...updates } : c
      );
      return { conversations: sortConversations(updated) };
    });
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

  clearConversationMessages: async (conversationId) => {
    try {
      await api.post(`/conversations/${conversationId}/clear`);
      const state = get();
      const currentActiveId = (state.activeConversation?._id || state.activeConversation?.id)?.toString();
      if (currentActiveId === conversationId?.toString()) {
        set({
          messages: [],
          activeConversation: {
            ...state.activeConversation,
            lastMessage: null,
            pinnedMessages: [],
          },
        });
      }
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c._id?.toString() === conversationId?.toString()
            ? { ...c, lastMessage: null, unreadCount: 0 }
            : c
        ),
        messagesCache: conversationId ? {
          ...s.messagesCache,
          [conversationId.toString()]: { messages: [], hasMore: false },
        } : s.messagesCache,
      }));
    } catch (error) {
      console.error('Clear conversation error:', error);
      throw error;
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      await api.delete(`/conversations/${conversationId}`);
      const state = get();
      const nextConversations = state.conversations.filter(
        (c) => c._id?.toString() !== conversationId?.toString()
      );
      const isCurrentActive =
        (state.activeConversation?._id || state.activeConversation?.id)?.toString() ===
        conversationId?.toString();

      const nextCache = { ...state.messagesCache };
      if (conversationId) delete nextCache[conversationId.toString()];

      set({
        conversations: nextConversations,
        messagesCache: nextCache,
        ...(isCurrentActive ? { activeConversation: null, messages: [] } : {}),
      });
    } catch (error) {
      console.error('Delete conversation error:', error);
      throw error;
    }
  },

  // ====== MESSAGES ======
  fetchMessages: async (conversationId, before = null, silent = false) => {
    const genAtStart = get()._fetchGeneration;
    const convIdStr = conversationId?.toString();
    if (!before && !silent) {
      // Only set loading for initial fetch when not silent and not cached
      set({ isLoadingMessages: true });
    }
    try {
      const params = { limit: 30 };
      if (before) params.before = before;
      const { data } = await api.get(`/messages/${convIdStr}`, { params });

      const incoming = data.messages || [];
      const hasMore = Boolean(data.pagination?.hasMore);

      // Guard: if user switched conversation during fetch, store in cache for that conversation anyway
      if (get()._fetchGeneration !== genAtStart) {
        if (!before && convIdStr) {
          set((state) => ({
            messagesCache: {
              ...state.messagesCache,
              [convIdStr]: { messages: incoming, hasMore },
            },
          }));
        }
        return;
      }

      set((state) => {
        const nextMessages = before ? [...incoming, ...state.messages] : incoming;
        return {
          messages: nextMessages,
          hasMoreMessages: hasMore,
          isLoadingMessages: false,
          messagesCache: convIdStr ? {
            ...state.messagesCache,
            [convIdStr]: {
              messages: nextMessages,
              hasMore,
            },
          } : state.messagesCache,
        };
      });
    } catch (error) {
      console.error('Fetch messages error:', error);
      // Only clear loading if we're still on the same conversation
      if (get()._fetchGeneration === genAtStart) {
        set({ isLoadingMessages: false });
      }
    }
  },

  sendMessage: async (conversationId, messageData) => {
    try {
      const clientId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const currentUser = useAuthStore.getState().user;

      // Optimistic update — 0ms instant display in DOM like WhatsApp
      const optimisticMsg = {
        _id: clientId,
        ...messageData,
        clientId,
        status: 'sending',
        createdAt: new Date().toISOString(),
        sender: currentUser || { _id: 'self' },
        reactions: [],
        _optimistic: true,
      };

      set((state) => {
        const nextMsgs = [...state.messages, optimisticMsg];
        const convKey = conversationId?.toString();
        return {
          messages: nextMsgs,
          messagesCache: convKey ? {
            ...state.messagesCache,
            [convKey]: {
              messages: nextMsgs,
              hasMore: state.messagesCache[convKey]?.hasMore ?? false,
            },
          } : state.messagesCache,
        };
      });

      // Immediately jump conversation to top of chat list (0ms instant)
      get().updateConversationInList(conversationId, optimisticMsg);

      // Direct HTTP send (matching reactToMessage / editMessage pattern)
      const { data } = await api.post(`/messages/${conversationId}`, {
        ...messageData,
        clientId,
      });

      // Replace optimistic message with canonical server message
      set((state) => {
        const nextMsgs = state.messages.map(m =>
          m.clientId === clientId ? data.message : m
        );
        const convKey = conversationId?.toString();
        return {
          messages: nextMsgs,
          messagesCache: convKey ? {
            ...state.messagesCache,
            [convKey]: {
              messages: nextMsgs,
              hasMore: state.messagesCache[convKey]?.hasMore ?? false,
            },
          } : state.messagesCache,
        };
      });

      // Update conversation list
      get().updateConversationInList(conversationId, data.message);

      return data.message;
    } catch (error) {
      // Mark optimistic message as failed
      set((state) => ({
        messages: state.messages.map(m =>
          m._optimistic && (m.status === 'sending' || m.status === 'uploading')
            ? { ...m, status: 'failed' }
            : m
        ),
      }));
      console.error('Send message error:', error);
      throw error;
    }
  },

  addOptimisticMessage: (optimisticMsg) => {
    set((state) => ({
      messages: [...state.messages, optimisticMsg],
    }));
  },

  updateOptimisticMessage: (clientId, updates) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.clientId === clientId || m._id === clientId ? { ...m, ...updates } : m
      ),
    }));
  },

  removeOptimisticMessage: (clientId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.clientId !== clientId && m._id !== clientId),
    }));
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

  _lastMarkReadTimes: {},

  markAsRead: async (conversationId) => {
    try {
      if (!conversationId) return;
      const cid = conversationId.toString();

      // Throttling guard: don't hammer server if already marked read within last 3 seconds
      const now = Date.now();
      const lastTime = get()._lastMarkReadTimes?.[cid] || 0;
      if (now - lastTime < 3000) return;

      set((s) => ({
        _lastMarkReadTimes: { ...(s._lastMarkReadTimes || {}), [cid]: now },
      }));

      // Notify server via socket and REST unconditionally
      const socket = getSocket();
      if (socket) {
        socket.emit('message:read', { conversationId: cid });
      }
      api.post(`/messages/${cid}/read`).catch(() => {});

      const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
      set((state) => {
        const convs = state.conversations.map((c) => {
          if ((c._id || c.id)?.toString() === cid) {
            return {
              ...c,
              unreadCount: 0,
              _participant: { ...(c._participant || {}), unreadCount: 0 },
              participants: (c.participants || []).map((p) =>
                (p.user?._id || p.user)?.toString() === myId
                  ? { ...p, unreadCount: 0 }
                  : p
              ),
            };
          }
          return c;
        });

        const unreadTotal = convs.reduce((sum, c) => {
          const myP = c._participant || c.participants?.find((p) => (p.user?._id || p.user)?.toString() === myId);
          const count = typeof c.unreadCount === 'number' ? c.unreadCount : (myP?.unreadCount || 0);
          return sum + Math.max(0, count);
        }, 0);

        try {
          localStorage.setItem('nexchat_cached_conversations', JSON.stringify(convs.slice(0, 50)));
        } catch (e) {}

        if (typeof window !== 'undefined' && window.electronAPI?.setBadgeCount) {
          window.electronAPI.setBadgeCount(unreadTotal);
        }

        return {
          conversations: convs,
          unreadTotal,
          activeConversation: (state.activeConversation?._id || state.activeConversation?.id)?.toString() === cid
            ? {
                ...state.activeConversation,
                unreadCount: 0,
                _participant: { ...(state.activeConversation._participant || {}), unreadCount: 0 },
              }
            : state.activeConversation,
        };
      });
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  },

  // ====== REAL-TIME HANDLERS ======
  addMessage: (message, conversationId) => {
    if (!message) return;
    const state = get();
    const activeConv = state.activeConversation;
    const activeConvId = (activeConv?._id || activeConv?.id || activeConv)?.toString();
    const msgConvId = (conversationId || message?.conversation?._id || message?.conversation?.id || message?.conversation)?.toString();

    console.log(`[CHAT STORE] addMessage -> ID: ${message?._id} | MsgConv: ${msgConvId} | ActiveConv: ${activeConvId}`);

    if (activeConvId && msgConvId && activeConvId === msgConvId) {
      const msgs = [...state.messages];
      const mId = (message._id || message.id)?.toString();
      const matchIdx = msgs.findIndex(m =>
        (m.clientId && message.clientId && m.clientId === message.clientId) ||
        ((m._id || m.id) && mId && (m._id || m.id).toString() === mId)
      );

      if (matchIdx !== -1) {
        msgs[matchIdx] = message;
      } else {
        msgs.push(message);
      }
      set((s) => ({
        messages: msgs,
        messagesCache: {
          ...s.messagesCache,
          [msgConvId]: {
            messages: msgs,
            hasMore: s.messagesCache[msgConvId]?.hasMore ?? s.hasMoreMessages,
          },
        },
      }));
    } else if (msgConvId) {
      const cached = state.messagesCache[msgConvId];
      if (cached && Array.isArray(cached.messages)) {
        const msgs = [...cached.messages];
        const mId = (message._id || message.id)?.toString();
        const matchIdx = msgs.findIndex(m =>
          (m.clientId && message.clientId && m.clientId === message.clientId) ||
          ((m._id || m.id) && mId && (m._id || m.id).toString() === mId)
        );
        if (matchIdx !== -1) {
          msgs[matchIdx] = message;
        } else {
          msgs.push(message);
        }
        set((s) => ({
          messagesCache: {
            ...s.messagesCache,
            [msgConvId]: { ...cached, messages: msgs },
          },
        }));
      }
    }
    state.updateConversationInList(msgConvId, message);
  },

  updateMessageInList: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map(m =>
        m._id?.toString() === messageId?.toString() ? { ...m, ...updates } : m
      ),
    }));
  },

  updateConversationInList: (conversationId, lastMessage) => {
    const state = get();
    const targetId = (conversationId || lastMessage?.conversation?._id || lastMessage?.conversation)?.toString();
    if (!targetId) return;

    const myId = (useAuthStore.getState().user?._id || useAuthStore.getState().user)?.toString();
    const senderId = (lastMessage?.sender?._id || lastMessage?.sender)?.toString();
    const isFromMe = Boolean(senderId && myId && senderId === myId);

    const activeConvId = (state.activeConversation?._id || state.activeConversation?.id || state.activeConversation)?.toString();
    const isCurrentlyActive = Boolean(
      activeConvId &&
      activeConvId === targetId &&
      typeof document !== 'undefined' &&
      !document.hidden
    );

    const convs = [...state.conversations];
    const idx = convs.findIndex((c) => c._id?.toString() === targetId);

    if (idx !== -1) {
      const existingConv = convs[idx];
      const existingLastMsgId = (existingConv.lastMessage?._id || existingConv.lastMessage?.id)?.toString();
      const newMsgId = (lastMessage?._id || lastMessage?.id)?.toString();

      // Check if message is already read by me or from me
      const isAlreadyReadByMe = Boolean(
        isFromMe ||
        isCurrentlyActive ||
        lastMessage?.status === 'read' ||
        (Array.isArray(lastMessage?.readBy) && lastMessage.readBy.some(r => (r.user?._id || r.user)?.toString() === myId))
      );

      const myP = existingConv._participant || existingConv.participants?.find((p) => (p.user?._id || p.user)?.toString() === myId);
      const currentUnread = typeof existingConv.unreadCount === 'number'
        ? existingConv.unreadCount
        : (typeof myP?.unreadCount === 'number' ? myP.unreadCount : 0);

      // IDEMPOTENCY GUARD:
      // If message is already read by me or from me, unread is 0.
      // If this exact message ID was already the lastMessage, DO NOT increment again!
      let newUnread = currentUnread;
      if (isAlreadyReadByMe) {
        newUnread = 0;
      } else if (existingLastMsgId && newMsgId && existingLastMsgId === newMsgId) {
        newUnread = currentUnread;
      } else {
        newUnread = Math.max(0, currentUnread + 1);
      }

      const updatedConv = {
        ...existingConv,
        lastMessage,
        lastMessageAt: lastMessage?.createdAt || new Date().toISOString(),
        unreadCount: newUnread,
        _participant: {
          ...(existingConv._participant || {}),
          unreadCount: newUnread,
        },
        participants: (existingConv.participants || []).map((p) =>
          (p.user?._id || p.user)?.toString() === myId
            ? { ...p, unreadCount: newUnread }
            : p
        ),
      };

      convs[idx] = updatedConv;
      const sortedConvs = sortConversations(convs);

      const unreadTotal = sortedConvs.reduce((sum, c) => {
        const pObj = c._participant || c.participants?.find((p) => (p.user?._id || p.user)?.toString() === myId);
        const count = typeof c.unreadCount === 'number' ? c.unreadCount : (pObj?.unreadCount || 0);
        return sum + Math.max(0, count);
      }, 0);

      try {
        localStorage.setItem('nexchat_cached_conversations', JSON.stringify(sortedConvs.slice(0, 50)));
      } catch (e) {}

      if (typeof window !== 'undefined' && window.electronAPI?.setBadgeCount) {
        window.electronAPI.setBadgeCount(unreadTotal);
      }

      set({ conversations: sortedConvs, unreadTotal });

      if (isCurrentlyActive && !isFromMe) {
        get().markAsRead(targetId);
      }
    } else {
      // If conversation is new or not in the current list, fetch fresh conversations
      get().fetchConversations();
    }
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

  setOnlineUsers: (userIds) => {
    const list = Array.isArray(userIds) ? userIds : [];
    const normalized = new Set(
      list.map((id) => (id?._id || id)?.toString()).filter(Boolean)
    );
    set({ onlineUsers: normalized });
  },

  setUserOnline: (userId) => {
    if (!userId) return;
    const strId = (userId?._id || userId)?.toString();
    set((state) => {
      const online = new Set(state.onlineUsers);
      online.add(strId);
      return { onlineUsers: online };
    });
  },

  setUserOffline: (userId) => {
    if (!userId) return;
    const strId = (userId?._id || userId)?.toString();
    set((state) => {
      const online = new Set(state.onlineUsers);
      online.delete(strId);
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
    try {
      localStorage.setItem('nexchat_drafts', JSON.stringify(drafts));
    } catch (e) {}
    set({ drafts });
  },

  getDraft: (conversationId) => {
    return get().drafts[conversationId] || '';
  },
}));

export default useChatStore;
