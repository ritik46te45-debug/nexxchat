import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import cloudinary from '../config/cloudinary.js';
import { sendPushNotification } from '../config/webPush.js';
import connectionManager from '../socket/connectionManager.js';

// Helper: Broadcast event to a conversation and all its participants reliably
export const emitToConversationParticipants = (io, conversation, event, data) => {
  if (!io || !conversation) {
    console.warn(`[RT-EMIT-WARN] Cannot emit ${event} — io (${Boolean(io)}) or conversation (${Boolean(conversation)}) missing`);
    return;
  }
  const convId = conversation._id?.toString() || conversation.toString();
  const convRoom = `conv:${convId}`;
  const participants = conversation.participants || [];

  console.log(`[RT-EMIT-001] emitToConversationParticipants ENTERED -> event: ${event} | convId: ${convId} | participants: ${participants.length}`);

  // 1. Emit to each participant via direct socket IDs AND persistent user room
  participants.forEach(p => {
    const pUserId = (p.user?._id || p.user || p)?.toString();
    if (pUserId) {
      const socketIds = connectionManager.getUserSockets(pUserId);
      console.log(`[RT-EMIT-002] Target user: ${pUserId} | SocketIds: [${socketIds.join(', ')}] | Count: ${socketIds.length}`);

      socketIds.forEach(sid => {
        io.to(sid).emit(event, data);
      });

      io.to(`user:${pUserId}`).emit(event, data);
    }
  });

  // 2. Emit to conversation room
  io.to(convRoom).emit(event, data);
  console.log(`[RT-EMIT-003] Emitted ${event} successfully to all targets for conv: ${convId}`);
};

// SEND MESSAGE
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      content, type = 'text', replyTo, mentions,
      clientId, location, contact, poll, linkPreview, attachments,
    } = req.body;

    console.log(`[MSG-1] SEND_MESSAGE_REQUEST -> senderId: ${req.userId} | convId: ${conversationId} | clientId: ${clientId} | type: ${type}`);

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      console.error(`[MSG-ERR] Conversation not found or user not participant: ${conversationId}`);
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check group settings
    if (conversation.type === 'group' && conversation.groupSettings?.onlyAdminsCanSend) {
      const participant = conversation.getParticipant(req.userId);
      if (!['admin', 'owner'].includes(participant?.role)) {
        return res.status(403).json({ error: 'Only admins can send messages in this group' });
      }
    }

    // Check if blocked (for private chats)
    if (conversation.type === 'private') {
      const otherParticipant = conversation.participants.find(
        p => p.user.toString() !== req.userId.toString()
      );
      const otherUser = await User.findById(otherParticipant.user);
      if (otherUser?.blockedUsers.includes(req.userId)) {
        return res.status(403).json({ error: 'Cannot send message' });
      }
    }

    // Deduplicate by clientId
    if (clientId) {
      const existing = await Message.findOne({ clientId, sender: req.userId });
      if (existing) {
        console.log(`[MSG-DEDUP] Returning existing message for clientId: ${clientId}`);
        return res.json({ message: existing });
      }
    }

    // Build message
    const messageData = {
      conversation: conversationId,
      sender: req.userId,
      type,
      content: content || '',
      clientId,
      mentions: mentions || [],
      isViewOnce: Boolean(req.body.isViewOnce),
    };

    if (attachments && Array.isArray(attachments)) messageData.attachments = attachments;
    if (replyTo) messageData.replyTo = replyTo;
    if (location) messageData.location = location;
    if (contact) messageData.contact = contact;
    if (poll) messageData.poll = poll;
    if (linkPreview) messageData.linkPreview = linkPreview;

    // Handle disappearing messages
    if (conversation.disappearingMessages?.enabled && conversation.disappearingMessages.duration > 0) {
      messageData.expiresAt = new Date(Date.now() + conversation.disappearingMessages.duration * 1000);
    }

    const message = await Message.create(messageData);
    console.log(`[MSG-2] MESSAGE_SAVED -> messageId: ${message._id} | convId: ${conversationId} | senderId: ${req.userId}`);

    // Update conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();

    // Increment unread count for other participants
    conversation.participants.forEach(p => {
      if (p.user.toString() !== req.userId.toString()) {
        p.unreadCount = (p.unreadCount || 0) + 1;
      }
    });

    // Restore conversation for participants who deleted it
    conversation.participants.forEach(p => {
      if (p.isDeleted) {
        p.isDeleted = false;
        p.deletedAt = null;
      }
    });

    await conversation.save();

    // Populate sender info
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username displayName avatar')
      .populate({
        path: 'replyTo',
        select: 'content type sender attachments',
        populate: { path: 'sender', select: 'username displayName' },
      });

    // Recipients resolution
    const recipientIds = conversation.participants
      .filter(p => (p.user?._id || p.user)?.toString() !== req.userId.toString())
      .map(p => (p.user?._id || p.user)?.toString());
    console.log(`[MSG-3] RECIPIENT_RESOLUTION -> recipientIds: [${recipientIds.join(', ')}]`);

    recipientIds.forEach(rId => {
      const sIds = connectionManager.getUserSockets(rId);
      console.log(`[MSG-4] RECIPIENT_SOCKET_RESOLUTION -> recipientUserId: ${rId} | socketIds: [${sIds.join(', ')}] | count: ${sIds.length}`);
    });

    // Emit socket event to conversation room & participant rooms (EXACTLY like reactToMessage)
    const io = req.app.get('io');
    if (io) {
      console.log(`[MSG-5] ABOUT_TO_EMIT -> event: message:new | messageId: ${message._id}`);
      emitToConversationParticipants(io, conversation, 'message:new', {
        message: populatedMessage,
        conversationId,
      });
      console.log(`[MSG-6] MESSAGE_NEW_EMITTED -> messageId: ${message._id} | target: conv:${conversationId} & user rooms`);
    } else {
      console.error(`[MSG-ERR] req.app.get('io') returned null/undefined!`);
    }

    if (!req.body.isSilent) {
      const otherParticipants = conversation.participants.filter(
        p => (p.user?._id || p.user)?.toString() !== req.userId.toString()
      );

      const notifTitle = conversation.type === 'group'
        ? `${conversation.groupName || 'Group'} (${populatedMessage.sender?.displayName || 'User'})`
        : populatedMessage.sender?.displayName || 'New Message';

      const notifBody = content || (type === 'video_note' ? 'Sent a video note 🎥' : type === 'voice' ? 'Sent a voice message 🎤' : `Sent a ${type}`);

      otherParticipants.forEach(async (p) => {
        try {
          const user = await User.findById(p.user);
          if (user && user.notificationSettings?.messages !== false && Array.isArray(user.pushSubscriptions) && user.pushSubscriptions.length > 0) {
            const title = notifTitle;
            const body = user.notificationSettings?.showPreview !== false ? notifBody : 'New message';

            const payload = {
              title,
              body,
              icon: populatedMessage.sender?.avatar?.url || '/favicon.ico',
              badge: '/favicon.ico',
              data: {
                conversationId: conversationId.toString(),
                messageId: message._id.toString(),
                url: `/?conversation=${conversationId}`,
              },
            };

            for (const sub of user.pushSubscriptions) {
              const res = await sendPushNotification(sub, payload);
              if (res?.expired) {
                // Auto-cleanup expired browser subscription
                await User.findByIdAndUpdate(user._id, {
                  $pull: { pushSubscriptions: { endpoint: res.endpoint } },
                });
              }
            }
          }
        } catch (err) {
          console.warn('Push delivery error:', err.message);
        }
      });
    }

    res.status(201).json({ message: populatedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// GET MESSAGES
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50, before } = req.query;

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const query = {
      conversation: conversationId,
      deletedFor: { $ne: req.userId },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ],
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'username displayName avatar')
      .populate({
        path: 'replyTo',
        select: 'content type sender attachments',
        populate: { path: 'sender', select: 'username displayName' },
      })
      .populate('reactions.user', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(before ? 0 : (parseInt(page) - 1) * parseInt(limit));

    const total = await Message.countDocuments({
      conversation: conversationId,
      deletedFor: { $ne: req.userId },
    });

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        hasMore: before ? messages.length === parseInt(limit) : (parseInt(page) * parseInt(limit)) < total,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// EDIT MESSAGE
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await Message.findOne({ _id: messageId, sender: req.userId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }

    if (message.type !== 'text') {
      return res.status(400).json({ error: 'Only text messages can be edited' });
    }

    // Save edit history
    message.editHistory.push({ content: message.content, editedAt: new Date() });
    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('sender', 'username displayName avatar');

    // Notify via Socket.IO directly to room and participants
    const io = req.app.get('io');
    const conversation = await Conversation.findById(message.conversation);
    if (io && conversation) {
      emitToConversationParticipants(io, conversation, 'message:edited', {
        message: populatedMessage,
        conversationId: message.conversation,
      });
    }

    res.json({ message: populatedMessage });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
};

// DELETE MESSAGE
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { forEveryone = false } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (forEveryone) {
      // Only sender can delete for everyone
      if (message.sender.toString() !== req.userId.toString()) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      message.isDeletedForEveryone = true;
      message.deletedAt = new Date();
      message.content = '';
      message.attachments = [];
      await message.save();

      // Notify via Socket.IO directly to room and participants
      const io = req.app.get('io');
      const conversation = await Conversation.findById(message.conversation);
      if (io && conversation) {
        emitToConversationParticipants(io, conversation, 'message:deleted', {
          messageId,
          conversationId: message.conversation,
          forEveryone: true,
        });
      }
    } else {
      // Delete for me
      message.deletedFor.push(req.userId);
      await message.save();
    }

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// REACT TO MESSAGE
export const reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Remove existing reaction from this user
    message.reactions = message.reactions.filter(
      r => r.user.toString() !== req.userId.toString()
    );

    // Add new reaction (if emoji provided)
    if (emoji) {
      message.reactions.push({ user: req.userId, emoji });
    }

    await message.save();

    const populatedMessage = await Message.findById(messageId)
      .populate('reactions.user', 'username displayName');

    // Notify via Socket.IO directly to room and participants
    const io = req.app.get('io');
    const conversation = await Conversation.findById(message.conversation);
    if (io && conversation) {
      emitToConversationParticipants(io, conversation, 'message:reaction', {
        messageId,
        conversationId: message.conversation,
        reactions: populatedMessage.reactions,
        user: { _id: req.userId, displayName: req.user.displayName },
        emoji,
      });
    }

    res.json({ reactions: populatedMessage.reactions });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
};

// STAR / UNSTAR MESSAGE
export const toggleStarMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isStarred = message.starredBy.includes(req.userId);
    if (isStarred) {
      message.starredBy.pull(req.userId);
    } else {
      message.starredBy.push(req.userId);
    }
    await message.save();

    res.json({ starred: !isStarred });
  } catch (error) {
    console.error('Toggle star error:', error);
    res.status(500).json({ error: 'Failed to toggle star' });
  }
};

// GET STARRED MESSAGES
export const getStarredMessages = async (req, res) => {
  try {
    const messages = await Message.find({ starredBy: req.userId })
      .populate('sender', 'username displayName avatar')
      .populate('conversation', 'type groupName')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ messages });
  } catch (error) {
    console.error('Get starred messages error:', error);
    res.status(500).json({ error: 'Failed to get starred messages' });
  }
};

// FORWARD MESSAGE
export const forwardMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { conversationIds } = req.body;

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const forwarded = [];

    for (const convId of conversationIds) {
      const conversation = await Conversation.findOne({
        _id: convId,
        'participants.user': req.userId,
      });

      if (!conversation) continue;

      const newMessage = await Message.create({
        conversation: convId,
        sender: req.userId,
        type: originalMessage.type,
        content: originalMessage.content,
        attachments: originalMessage.attachments,
        isForwarded: true,
        forwardedFrom: messageId,
        location: originalMessage.location,
        contact: originalMessage.contact,
      });

      // Update conversation
      conversation.lastMessage = newMessage._id;
      conversation.lastMessageAt = new Date();
      conversation.participants.forEach(p => {
        if (p.user.toString() !== req.userId.toString()) {
          p.unreadCount = (p.unreadCount || 0) + 1;
        }
      });
      await conversation.save();

      const populated = await Message.findById(newMessage._id)
        .populate('sender', 'username displayName avatar');

      forwarded.push(populated);

      // Emit to conversation and user rooms
      const io = req.app.get('io');
      if (io) {
        emitToConversationParticipants(io, conversation, 'message:new', {
          message: populated,
          conversationId: convId,
        });
      }
    }

    res.json({ messages: forwarded });
  } catch (error) {
    console.error('Forward message error:', error);
    res.status(500).json({ error: 'Failed to forward message' });
  }
};

// SEARCH MESSAGES
export const searchMessages = async (req, res) => {
  try {
    const { q, conversationId, type, from, page = 1, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const query = {
      deletedFor: { $ne: req.userId },
      isDeletedForEveryone: false,
      $text: { $search: q },
    };

    if (conversationId) {
      query.conversation = conversationId;
    } else {
      // Only search in user's conversations
      const userConversations = await Conversation.find({
        'participants.user': req.userId,
      }).select('_id');
      query.conversation = { $in: userConversations.map(c => c._id) };
    }

    if (type) query.type = type;
    if (from) query.sender = from;

    const messages = await Message.find(query)
      .populate('sender', 'username displayName avatar')
      .populate('conversation', 'type groupName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    res.json({ messages });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// MARK MESSAGES AS READ
export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Reset unread count
    const participantIndex = conversation.participants.findIndex(
      p => p.user.toString() === req.userId.toString()
    );
    conversation.participants[participantIndex].unreadCount = 0;
    conversation.participants[participantIndex].lastReadAt = new Date();
    await conversation.save();

    // Update message read status
    const unreadMessages = await Message.find({
      conversation: conversationId,
      sender: { $ne: req.userId },
      'readBy.user': { $ne: req.userId },
    });

    for (const msg of unreadMessages) {
      msg.readBy.push({ user: req.userId, readAt: new Date() });
      msg.status = 'read';
      await msg.save();
    }

    // Notify senders that messages were read directly via room emissions
    const io = req.app.get('io');
    if (io) {
      emitToConversationParticipants(io, conversation, 'message:read', {
        conversationId,
        readBy: req.userId,
        readAt: new Date(),
      });
    }

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
};

// GET MEDIA GALLERY FOR CONVERSATION
export const getMediaGallery = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { type = 'all', page = 1, limit = 30 } = req.query;

    const query = {
      conversation: conversationId,
      deletedFor: { $ne: req.userId },
      isDeletedForEveryone: false,
    };

    if (type === 'media') {
      query.type = { $in: ['image', 'video', 'gif'] };
    } else if (type === 'files') {
      query.type = { $in: ['document', 'file'] };
    } else if (type === 'links') {
      query.type = 'link';
    } else if (type === 'audio') {
      query.type = { $in: ['audio', 'voice'] };
    } else {
      query.type = { $in: ['image', 'video', 'gif', 'document', 'file', 'audio', 'voice', 'link'] };
    }

    const messages = await Message.find(query)
      .populate('sender', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    res.json({ messages });
  } catch (error) {
    console.error('Get media gallery error:', error);
    res.status(500).json({ error: 'Failed to get media gallery' });
  }
};

// PIN MESSAGE
export const pinMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check permission for groups
    if (conversation.type === 'group' && conversation.groupSettings?.onlyAdminsCanPin) {
      const participant = conversation.getParticipant(req.userId);
      if (!['admin', 'owner'].includes(participant?.role)) {
        return res.status(403).json({ error: 'Only admins can pin messages' });
      }
    }

    const alreadyPinned = conversation.pinnedMessages.some(
      p => p.message.toString() === messageId
    );

    if (alreadyPinned) {
      return res.status(400).json({ error: 'Message already pinned' });
    }

    conversation.pinnedMessages.push({
      message: messageId,
      pinnedBy: req.userId,
    });
    await conversation.save();

    res.json({ message: 'Message pinned' });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
};

// UNPIN MESSAGE
export const unpinMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    await Conversation.findOneAndUpdate(
      { _id: conversationId, 'participants.user': req.userId },
      { $pull: { pinnedMessages: { message: messageId } } }
    );

    res.json({ message: 'Message unpinned' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
};

// POLL: VOTE
export const votePoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { optionIndex } = req.body;

    const message = await Message.findOne({ _id: messageId, type: 'poll' });
    if (!message) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (message.poll?.expiresAt && new Date(message.poll.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Poll has expired' });
    }

    if (!message.poll?.isMultipleChoice) {
      // Remove existing votes from all options
      message.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v.toString() !== req.userId.toString());
      });
    }

    if (optionIndex >= 0 && optionIndex < message.poll.options.length) {
      const option = message.poll.options[optionIndex];
      const alreadyVoted = option.votes.some(v => v.toString() === req.userId.toString());

      if (alreadyVoted) {
        option.votes = option.votes.filter(v => v.toString() !== req.userId.toString());
      } else {
        option.votes.push(req.userId);
      }
    }

    await message.save();

    // Emit update directly to room and participants
    const io = req.app.get('io');
    if (io) {
      const conversation = await Conversation.findById(message.conversation);
      if (conversation) {
        emitToConversationParticipants(io, conversation, 'poll:updated', {
          messageId,
          conversationId: message.conversation,
          poll: message.poll,
        });
      }
    }

    res.json({ poll: message.poll });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
};

// MARK VIEW-ONCE MEDIA AS OPENED
export const markViewOnceOpened = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!message.isViewOnce) {
      return res.status(400).json({ error: 'Not a view-once message' });
    }

    const alreadyViewed = message.viewedBy.some(v => v.user.toString() === req.userId.toString());
    if (!alreadyViewed) {
      message.viewedBy.push({ user: req.userId, viewedAt: new Date() });
      await message.save();

      const io = req.app.get('io');
      if (io) {
        const conversation = await Conversation.findById(message.conversation);
        if (conversation) {
          conversation.participants.forEach(p => {
            io.to(p.user.toString()).emit('message:viewOnceOpened', {
              messageId: message._id,
              conversationId: message.conversation,
              viewedBy: message.viewedBy,
            });
          });
        }
      }
    }

    res.json({ message: 'Marked as viewed', viewedBy: message.viewedBy });
  } catch (error) {
    console.error('Mark view-once opened error:', error);
    res.status(500).json({ error: 'Failed to update view-once status' });
  }
};
