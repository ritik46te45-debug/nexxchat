import mongoose from 'mongoose';
import dns from 'dns/promises';
import net from 'net';
import { getLinkPreview as fetchLinkPreview } from 'link-preview-js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import cloudinary from '../config/cloudinary.js';
import { sendPushNotification } from '../config/webPush.js';
import connectionManager from '../socket/connectionManager.js';
import { dispatchPush } from '../services/pushService.js';
import { verifyDeliveryAck } from '../utils/deliveryToken.js';

const verifyConversationAccess = async (conversationId, userId) => {
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, 'participants.user': userId });
};

const isPrivateOrReservedIp = (ip) => {
  if (!ip || !net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.') ||
    lower.startsWith('::ffff:169.254.')
  );
};

// Mark all pending 'sent' messages addressed to userId as 'delivered' and notify senders (WhatsApp double grey tick)
export const markPendingDeliveredForUser = async (io, userId, convIds = null) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return 0;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    let targetConvIds = convIds;
    if (!Array.isArray(targetConvIds)) {
      const userConvs = await Conversation.find({ 'participants.user': userObjectId }).select('_id').lean();
      targetConvIds = userConvs.map(c => c._id);
    }
    if (targetConvIds.length === 0) return 0;

    const pendingMessages = await Message.find({
      conversation: { $in: targetConvIds },
      sender: { $ne: userObjectId },
      status: 'sent',
      'deliveredTo.user': { $ne: userObjectId },
    })
      .select('_id conversation sender')
      .limit(200)
      .lean();

    if (pendingMessages.length === 0) return 0;

    const now = new Date();
    const pendingIds = pendingMessages.map(m => m._id);
    await Message.updateMany(
      { _id: { $in: pendingIds } },
      {
        $push: { deliveredTo: { user: userObjectId, deliveredAt: now } },
        $set: { status: 'delivered' },
      }
    );

    if (io) {
      const grouped = new Map();
      for (const m of pendingMessages) {
        const convIdStr = m.conversation.toString();
        const senderIdStr = m.sender.toString();
        const key = `${convIdStr}:${senderIdStr}`;
        if (!grouped.has(key)) {
          grouped.set(key, { convIdStr, senderIdStr, messageIds: [] });
        }
        grouped.get(key).messageIds.push(m._id.toString());
      }

      grouped.forEach(({ convIdStr, senderIdStr, messageIds }) => {
        io.to(senderIdStr)
          .to(`user:${senderIdStr}`)
          .to(`conv:${convIdStr}`)
          .emit('message:delivered', {
            conversationId: convIdStr,
            messageIds,
            messageId: messageIds[0],
            status: 'delivered',
            deliveredBy: userId.toString(),
            deliveredAt: now,
          });
      });
    }

    return pendingMessages.length;
  } catch (err) {
    console.warn('[DELIVERY] markPendingDeliveredForUser error:', err.message);
    return 0;
  }
};

// Helper: Broadcast event to a conversation and all its participants reliably without duplicate emissions
export const emitToConversationParticipants = (io, conversation, event, data) => {
  if (!io || !conversation) {
    console.warn(`[RT-EMIT-WARN] Cannot emit ${event} — io (${Boolean(io)}) or conversation (${Boolean(conversation)}) missing`);
    return;
  }
  const convId = conversation._id?.toString() || conversation.toString();
  const convRoom = `conv:${convId}`;
  const participants = conversation.participants || [];

  // Chain rooms into a single broadcaster so Socket.IO automatically de-duplicates sockets
  let broadcaster = io.to(convRoom);
  participants.forEach(p => {
    const pUserId = (p.user?._id || p.user || p)?.toString();
    if (pUserId) {
      broadcaster = broadcaster.to(`user:${pUserId}`).to(pUserId);
    }
  });

  broadcaster.emit(event, data);
  console.log(`[RT-EMIT] Broadcasted ${event} cleanly to conv:${convId}`);
};

// SEND MESSAGE
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      content, type = 'text', replyTo, mentions,
      clientId, location, contact, poll, linkPreview, attachments,
      isEncrypted, iv,
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
        p => (p.user?._id || p.user)?.toString() !== req.userId.toString()
      );
      if (!otherParticipant || !otherParticipant.user) {
        return res.status(404).json({ error: 'Recipient not found in conversation' });
      }
      const otherUserId = (otherParticipant.user?._id || otherParticipant.user)?.toString();
      const otherUser = await User.findById(otherUserId);
      const isBlocked = otherUser?.blockedUsers?.some(
        id => (id?._id || id)?.toString() === req.userId.toString()
      ) || req.user?.blockedUsers?.some(
        id => (id?._id || id)?.toString() === otherUserId
      );
      if (isBlocked) {
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

    // Determine initial delivery status: 2 grey ticks ('delivered') if any recipient is online now, else 1 grey tick ('sent')
    const onlineRecipientIds = conversation.participants
      .map(p => (p.user?._id || p.user)?.toString())
      .filter(pId => pId && pId !== req.userId.toString() && connectionManager.isUserOnline(pId));

    // Build message
    const messageData = {
      conversation: conversationId,
      sender: req.userId,
      type,
      content: content || '',
      clientId,
      mentions: mentions || [],
      isViewOnce: Boolean(req.body.isViewOnce),
      isEncrypted: Boolean(isEncrypted),
      iv: iv || null,
      status: onlineRecipientIds.length > 0 ? 'delivered' : 'sent',
      deliveredTo: onlineRecipientIds.map(id => ({ user: id, deliveredAt: new Date() })),
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

    // Fast-path sender population: Use in-memory req.user to eliminate a redundant MongoDB Atlas query
    let populatedMessage;
    if (replyTo) {
      populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username displayName avatar')
        .populate({
          path: 'replyTo',
          select: 'content type sender attachments',
          populate: { path: 'sender', select: 'username displayName' },
        });
    } else {
      populatedMessage = message.toObject();
      populatedMessage.sender = {
        _id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        avatar: req.user.avatar || { url: '', publicId: '' },
      };
    }

    // Recipients resolution
    const recipientIds = conversation.participants
      .filter(p => (p.user?._id || p.user)?.toString() !== req.userId.toString())
      .map(p => (p.user?._id || p.user)?.toString());

    // Emit socket event to conversation room & participant rooms instantly
    const io = req.app.get('io');
    if (io) {
      emitToConversationParticipants(io, conversation, 'message:new', {
        message: populatedMessage,
        conversationId,
      });
    }

    // Respond to client IMMEDIATELY for WhatsApp-parity instant confirmation
    res.status(201).json({ message: populatedMessage });

    // Non-blocking background worker for in-app notifications and push notifications
    if (!req.body.isSilent) {
      setImmediate(async () => {
        try {
          const otherParticipants = conversation.participants.filter(
            p => (p.user?._id || p.user)?.toString() !== req.userId.toString()
          );

          const notifBody = content || (type === 'video_note' ? 'Sent a video note 🎥' : type === 'voice' ? 'Sent a voice message 🎤' : `Sent a ${type}`);

          for (const p of otherParticipants) {
            const pUserId = (p.user?._id || p.user)?.toString();
            if (!pUserId) continue;

            try {
              const notifType = conversation.type === 'group' ? 'group_message' : 'message';
              const notifTitle = conversation.type === 'group'
                ? `${populatedMessage.sender?.displayName || 'User'} (${conversation.groupName || conversation.groupDetails?.name || 'Group'})`
                : (populatedMessage.sender?.displayName || 'User');

              const notif = await Notification.create({
                recipient: pUserId,
                sender: req.userId,
                type: notifType,
                title: notifTitle,
                body: notifBody,
                data: {
                  conversationId: conversationId.toString(),
                  messageId: populatedMessage._id.toString(),
                },
              });

              const unreadCount = await Notification.countDocuments({ recipient: pUserId, isRead: false });
              if (io) {
                io.to(`user:${pUserId}`).to(pUserId).emit('notification:count', { count: unreadCount });
                io.to(`user:${pUserId}`).to(pUserId).emit('notification:new', notif);
              }
            } catch (notifErr) {
              console.warn('[NOTIF] Background in-app notification error:', notifErr.message);
            }

            dispatchPush(
              pUserId,
              conversation.type === 'group' ? 'group_message' : 'message',
              {
                senderName: populatedMessage.sender?.displayName || 'User',
                senderAvatar: populatedMessage.sender?.avatar?.url || '',
                content: notifBody,
                type: populatedMessage.type || 'text',
                conversationId: conversationId.toString(),
                messageId: populatedMessage._id.toString(),
                senderId: req.userId.toString(),
              },
              {
                conversationId: conversationId.toString(),
                skipForegroundDevices: true,
              }
            ).catch(e => console.warn('[PUSH] Background push dispatch error:', e.message));
          }
        } catch (bgErr) {
          console.warn('[MSG-BG] Non-blocking worker error:', bgErr.message);
        }
      });
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// GET MESSAGES
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 30, before } = req.query;
    const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 30), 100);

    // Fast index-only existence check
    const isParticipant = await Conversation.exists({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!isParticipant) {
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

    // Lean query returning plain JSON objects without heavy Mongoose Document overhead
    const messages = await Message.find(query)
      .select('-__v')
      .slice('readBy', -5)
      .populate('sender', 'username displayName avatar')
      .populate({
        path: 'replyTo',
        select: 'content type sender attachments',
        populate: { path: 'sender', select: 'username displayName' },
      })
      .populate('reactions.user', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(before ? 0 : (parseInt(page) - 1) * parsedLimit)
      .lean();

    const hasMore = messages.length === parsedLimit;

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        hasMore,
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

    const accessConv = await verifyConversationAccess(message.conversation, req.userId);
    if (!accessConv) {
      return res.status(403).json({ error: 'Not authorized' });
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

    const accessConv = await verifyConversationAccess(message.conversation, req.userId);
    if (!accessConv) {
      return res.status(403).json({ error: 'Not authorized' });
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

    const accessConv = await verifyConversationAccess(message.conversation, req.userId);
    if (!accessConv) {
      return res.status(403).json({ error: 'Not authorized' });
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

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const escapedQ = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = {
      deletedFor: { $ne: req.userId },
      isDeletedForEveryone: false,
      isEncrypted: { $ne: true },
      content: { $regex: escapedQ, $options: 'i' },
    };

    if (conversationId) {
      const accessConv = await verifyConversationAccess(conversationId, req.userId);
      if (!accessConv) {
        return res.status(403).json({ error: 'Not authorized' });
      }
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
    const userObjectId = new mongoose.Types.ObjectId(req.userId);
    const convObjectId = new mongoose.Types.ObjectId(conversationId);

    const conversation = await Conversation.findOne({
      _id: convObjectId,
      'participants.user': userObjectId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // 1. Atomic reset unread count & lastReadAt
    await Conversation.updateOne(
      { _id: convObjectId, 'participants.user': userObjectId },
      {
        $set: {
          'participants.$.unreadCount': 0,
          'participants.$.lastReadAt': new Date(),
        }
      }
    );

    // 2. Update message read status in bulk (only for messages not yet read by this user)
    await Message.updateMany(
      {
        conversation: convObjectId,
        sender: { $ne: userObjectId },
        'readBy.user': { $ne: userObjectId },
      },
      {
        $push: { readBy: { user: userObjectId, readAt: new Date() } },
        $set: { status: 'read' },
      }
    );

    // 3. Mark in-app notifications for this conversation as read
    await Notification.updateMany(
      {
        recipient: req.userId,
        'data.conversationId': conversationId,
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() }
      }
    );

    const unreadNotifCount = await Notification.countDocuments({
      recipient: req.userId,
      isRead: false,
    });

    // Notify senders that messages were read directly via room emissions
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.userId}`).to(req.userId.toString()).emit('notification:count', { count: unreadNotifCount });
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

    const accessConv = await verifyConversationAccess(conversationId, req.userId);
    if (!accessConv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

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

    const accessConv = await verifyConversationAccess(message.conversation, req.userId);
    if (!accessConv) {
      return res.status(403).json({ error: 'Not authorized' });
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

    const accessConv = await verifyConversationAccess(message.conversation, req.userId);
    if (!accessConv) {
      return res.status(403).json({ error: 'Not authorized' });
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

// SYNC MISSED MESSAGES (Delta sync on reconnect)
export const syncMessages = async (req, res) => {
  try {
    const { since } = req.query;
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find all conversations the user is in
    const userConvs = await Conversation.find({
      'participants.user': req.userId,
    }).select('_id').lean();

    const convIds = userConvs.map(c => c._id);

    // Mark offline 'sent' messages as 'delivered' when user syncs (device data is ON)
    await markPendingDeliveredForUser(req.app.get('io'), req.userId, convIds);

    // Find messages in these conversations created or updated since timestamp
    const missedMessages = await Message.find({
      conversation: { $in: convIds },
      updatedAt: { $gt: sinceDate },
      deletedFor: { $ne: req.userId },
    })
      .select('-__v')
      .slice('readBy', -5)
      .populate('sender', 'username displayName avatar')
      .populate({
        path: 'replyTo',
        select: 'content type sender attachments',
        populate: { path: 'sender', select: 'username displayName' },
      })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    res.json({
      messages: missedMessages,
      syncTimestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync messages error:', error);
    res.status(500).json({ error: 'Failed to sync messages' });
  }
};

// HMAC-AUTHENTICATED DELIVERY ACK (Fired from Web Push / Service Worker / Background Push)
export const ackMessageDelivery = async (req, res) => {
  try {
    const { messageId, conversationId, userId, token } = req.body || {};
    if (!messageId || !userId || !token || !mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    if (!verifyDeliveryAck(messageId, userId, token)) {
      return res.status(403).json({ error: 'Invalid delivery receipt token' });
    }

    const message = await Message.findById(messageId).select('_id conversation sender status deliveredTo');
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.sender.toString() === userId.toString()) return res.json({ ok: true });

    const alreadyDelivered = message.deliveredTo?.some(d => d.user?.toString() === userId.toString());
    if (!alreadyDelivered) {
      const now = new Date();
      await Message.updateOne(
        { _id: message._id, 'deliveredTo.user': { $ne: userId } },
        {
          $push: { deliveredTo: { user: userId, deliveredAt: now } },
          ...(message.status === 'sent' ? { $set: { status: 'delivered' } } : {}),
        }
      );

      const io = req.app.get('io');
      if (io) {
        const senderIdStr = message.sender.toString();
        const cid = (conversationId || message.conversation).toString();
        io.to(senderIdStr)
          .to(`user:${senderIdStr}`)
          .to(`conv:${cid}`)
          .emit('message:delivered', {
            messageId: message._id.toString(),
            conversationId: cid,
            status: 'delivered',
            deliveredBy: userId.toString(),
            deliveredAt: now,
          });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.warn('ackMessageDelivery note:', error.message);
    res.status(500).json({ error: 'Failed to acknowledge delivery' });
  }
};

// LINK PREVIEW METADATA (SSRF-safe)
export const getLinkPreview = async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return res.status(400).json({ error: 'Blocked hostname' });
    }

    if (net.isIP(hostname) && isPrivateOrReservedIp(hostname)) {
      return res.status(400).json({ error: 'Blocked IP address' });
    }

    try {
      const resolved = await dns.lookup(hostname, { all: true });
      if (!resolved.length || resolved.some(r => isPrivateOrReservedIp(r.address))) {
        return res.status(400).json({ error: 'Blocked destination IP' });
      }
    } catch {
      return res.status(400).json({ error: 'Hostname could not be resolved' });
    }

    const preview = await fetchLinkPreview(parsedUrl.toString(), {
      timeout: 3500,
      followRedirects: 'manual',
      headers: { 'user-agent': 'NexChatBot/1.0 (+https://nexxchat-zeta.vercel.app)' },
    });

    const title = preview?.title || '';
    const description = preview?.description || '';
    const image = Array.isArray(preview?.images) ? (preview.images[0] || '') : '';

    if (!title && !description && !image) {
      return res.json({ linkPreview: null });
    }

    res.json({
      linkPreview: {
        url: preview?.url || parsedUrl.toString(),
        title: String(title).slice(0, 140),
        description: String(description).slice(0, 260),
        image: typeof image === 'string' && /^https?:\/\//i.test(image) ? image : '',
        domain: hostname.replace(/^www\./, ''),
      },
    });
  } catch (error) {
    res.json({ linkPreview: null });
  }
};
