import mongoose from 'mongoose';
import { authenticateSocket } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Call from '../models/Call.js';
import connectionManager from './connectionManager.js';

// Track active calls in memory: Map<callId, { caller, receiver, type, conversationId }>
const activeCalls = new Map();

export const setupSocket = (io) => {
  // Auth middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const transport = socket.conn.transport.name;
    console.log(`[REALTIME] SOCKET CONNECTED -> User: ${userId} | Socket: ${socket.id} | Transport: ${transport}`);

    // Register socket in centralized connection manager
    connectionManager.registerSocket(userId, socket.id);

    // Update user online status and socketIds in DB
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
      $addToSet: { socketIds: socket.id },
    });

    // Join personal user room
    socket.join(userId.toString());
    socket.join(`user:${userId.toString()}`);

    // Automatically join all existing conversations for this user
    try {
      const userConversations = await Conversation.find({
        'participants.user': userId,
      }).select('_id');

      userConversations.forEach((conv) => {
        socket.join(conv._id.toString());
        socket.join(`conv:${conv._id.toString()}`);
      });
      console.log(`[REALTIME] Auto-joined ${userConversations.length} conversation room(s) for user ${userId}`);
    } catch (e) {
      console.warn('Socket auto room join note:', e.message);
    }

    // Join/Leave active conversation rooms
    socket.on('conversation:join', async ({ conversationId }) => {
      if (conversationId) {
        socket.join(conversationId.toString());
        socket.join(`conv:${conversationId.toString()}`);
        const roomSockets = io.sockets.adapter.rooms.get(`conv:${conversationId.toString()}`)?.size || 0;
        console.log(`[REALTIME] JOIN CONVERSATION -> User: ${userId} | Room: conv:${conversationId} (active sockets: ${roomSockets})`);
      }
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      if (conversationId) {
        socket.leave(conversationId.toString());
        socket.leave(`conv:${conversationId.toString()}`);
      }
    });

    // Broadcast online status to friends
    const user = await User.findById(userId);
    if (user?.friends) {
      user.friends.forEach(friendId => {
        const friendSockets = connectionManager.getUserSockets(friendId.toString());
        friendSockets.forEach(sid => {
          io.to(sid).emit('user:online', { userId, lastSeen: new Date() });
        });
      });
    }

    // ====== TYPING ======
    socket.on('typing:start', ({ conversationId }) => {
      broadcastToConversation(io, conversationId, userId, 'typing:start', {
        userId,
        conversationId,
        displayName: socket.user?.displayName,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      broadcastToConversation(io, conversationId, userId, 'typing:stop', {
        userId,
        conversationId,
      });
    });

    // ====== RECORDING ======
    socket.on('recording:start', ({ conversationId }) => {
      broadcastToConversation(io, conversationId, userId, 'recording:start', {
        userId,
        conversationId,
        displayName: socket.user?.displayName,
      });
    });

    socket.on('recording:stop', ({ conversationId }) => {
      broadcastToConversation(io, conversationId, userId, 'recording:stop', {
        userId,
        conversationId,
      });
    });

    // ====== REAL-TIME MESSAGE SEND (AUTHORITATIVE WEBSOCKET PIPELINE) ======
    socket.on('message:send', async ({ conversationId, content, type = 'text', clientId, replyTo, attachments, isViewOnce, location, contact, poll, linkPreview }, callback) => {
      try {
        console.log(`[RT-001] message:send RECEIVED -> socketId=${socket.id} conversationId=${conversationId} clientId=${clientId}`);

        // [RT-002] sender AUTHENTICATED
        console.log(`[RT-002] sender AUTHENTICATED -> senderUserId=${userId}`);

        // [RT-003] conversation VERIFIED
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.user': userId,
        });

        if (!conversation) {
          console.warn(`[RT-WARN] Conversation ${conversationId} not found or user ${userId} is not a participant`);
          if (typeof callback === 'function') callback({ error: 'Conversation not found' });
          return;
        }
        console.log(`[RT-003] conversation VERIFIED -> convId=${conversationId}`);

        // [RT-004] recipients RESOLVED
        const recipientIds = conversation.participants
          .filter(p => (p.user?._id || p.user || p)?.toString() !== userId.toString())
          .map(p => (p.user?._id || p.user || p)?.toString());
        console.log(`[RT-004] recipients RESOLVED -> recipientIds=[${recipientIds.join(', ')}]`);

        // Check group admin permissions
        if (conversation.type === 'group' && conversation.groupSettings?.onlyAdminsCanSend) {
          const participant = conversation.getParticipant(userId);
          if (!['admin', 'owner'].includes(participant?.role)) {
            if (typeof callback === 'function') callback({ error: 'Only admins can send messages in this group' });
            return;
          }
        }

        // [RT-005] MongoDB SAVE SUCCESS (idempotent via clientId)
        let message = null;
        if (clientId) {
          message = await Message.findOne({ clientId, sender: userId });
        }

        if (!message) {
          message = await Message.create({
            conversation: conversationId,
            sender: userId,
            type,
            content: content || '',
            clientId,
            attachments: attachments || [],
            replyTo,
            isViewOnce: Boolean(isViewOnce),
            location,
            contact,
            poll,
            linkPreview,
          });

          conversation.lastMessage = message._id;
          conversation.lastMessageAt = new Date();
          conversation.participants.forEach(p => {
            if (p.user.toString() !== userId.toString()) {
              p.unreadCount = (p.unreadCount || 0) + 1;
            }
          });
          await conversation.save();
        }
        console.log(`[RT-005] MongoDB SAVE SUCCESS -> messageId=${message._id}`);

        // [RT-006] canonical MESSAGE CREATED
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username displayName avatar')
          .populate({
            path: 'replyTo',
            select: 'content type sender attachments',
            populate: { path: 'sender', select: 'username displayName' },
          });

        const canonicalMessage = {
          ...populatedMessage.toObject(),
          id: populatedMessage._id.toString(),
          _id: populatedMessage._id.toString(),
          conversationId: conversationId.toString(),
        };
        console.log(`[RT-006] canonical MESSAGE CREATED -> messageId=${canonicalMessage._id}`);

        const payload = {
          message: canonicalMessage,
          conversationId: conversationId.toString(),
        };

        // [RT-007] recipient SOCKETS RESOLVED & [RT-008] message:new EMITTING
        recipientIds.forEach(rId => {
          const sIds = connectionManager.getUserSockets(rId);
          console.log(`[RT-007] recipient SOCKETS RESOLVED -> recipient=${rId} socketIds=[${sIds.join(', ')}] count=${sIds.length}`);

          sIds.forEach(sid => {
            console.log(`[RT-008] message:new EMITTING -> targetSocketId=${sid} messageId=${canonicalMessage._id}`);
            io.to(sid).emit('message:new', payload);
          });

          // Also emit to persistent user room as backup
          io.to(`user:${rId}`).emit('message:new', payload);
        });

        // Also emit to other sockets of sender for multi-device sync
        const senderSockets = connectionManager.getUserSockets(userId);
        senderSockets.forEach(sid => {
          if (sid !== socket.id) {
            io.to(sid).emit('message:new', payload);
          }
        });

        // Emit to conversation room
        io.to(`conv:${conversationId}`).emit('message:new', payload);

        // Acknowledge back to sender socket
        if (typeof callback === 'function') {
          callback({ success: true, message: canonicalMessage });
        }
      } catch (err) {
        console.error('[RT-SERVER-ERR] message:send error:', err);
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    // ====== MESSAGE DELIVERY ======
    socket.on('message:delivered', async ({ messageId, conversationId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const alreadyDelivered = message.deliveredTo.some(
          d => d.user.toString() === userId
        );

        if (!alreadyDelivered) {
          message.deliveredTo.push({ user: userId, deliveredAt: new Date() });
          if (message.status === 'sent') {
            message.status = 'delivered';
          }
          await message.save();

          const senderIdStr = message.sender.toString();
          const senderSockets = connectionManager.getUserSockets(senderIdStr);
          senderSockets.forEach(sid => {
            io.to(sid).emit('message:delivered', {
              messageId,
              conversationId,
              deliveredBy: userId,
            });
          });
          io.to(`user:${senderIdStr}`).emit('message:delivered', {
            messageId,
            conversationId,
            deliveredBy: userId,
          });

          if (conversationId) {
            io.to(`conv:${conversationId.toString()}`).emit('message:delivered', {
              messageId,
              conversationId,
              deliveredBy: userId,
            });
          }
        }
      } catch (error) {
        console.error('Message delivered error:', error);
      }
    });

    // ====== MESSAGE READ ======
    socket.on('message:read', async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.user': userId,
        });
        if (!conversation) return;

        // Reset unread count for reader
        const pIdx = conversation.participants.findIndex(
          p => p.user.toString() === userId
        );
        if (pIdx !== -1) {
          conversation.participants[pIdx].unreadCount = 0;
          conversation.participants[pIdx].lastReadAt = new Date();
          await conversation.save();
        }

        // Mark unread messages
        await Message.updateMany(
          {
            conversation: conversationId,
            sender: { $ne: userId },
            'readBy.user': { $ne: userId },
          },
          {
            $push: { readBy: { user: userId, readAt: new Date() } },
            $set: { status: 'read' },
          }
        );

        // Notify other participants via direct socket dispatch & rooms
        const payload = {
          conversationId,
          readBy: userId,
          readAt: new Date(),
        };

        conversation.participants.forEach(p => {
          const pUserId = (p.user?._id || p.user || p)?.toString();
          if (pUserId && pUserId !== userId.toString()) {
            const sockets = connectionManager.getUserSockets(pUserId);
            sockets.forEach(sid => {
              io.to(sid).emit('message:read', payload);
            });
            io.to(`user:${pUserId}`).emit('message:read', payload);
          }
        });
        io.to(`conv:${conversationId}`).emit('message:read', payload);
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // ====== CALLS ======
    socket.on('call:initiate', async ({ conversationId, receiverId, to, type = 'voice', isGroup = false }) => {
      try {
        const targetReceiver = (receiverId || to)?.toString();
        console.log(`[CALL] initiate: from ${userId} to ${targetReceiver}, conv: ${conversationId}, type: ${type}`);

        if (!targetReceiver && !isGroup) {
          return socket.emit('call:error', { error: 'Receiver ID is required' });
        }

        // Auto-resolve conversation if not provided
        let convId = conversationId;
        if (!convId && targetReceiver) {
          let conv = await Conversation.findOne({
            type: 'private',
            'participants.user': { $all: [userId, targetReceiver] },
          });
          if (!conv) {
            conv = await Conversation.create({
              type: 'private',
              participants: [
                { user: userId, role: 'member' },
                { user: targetReceiver, role: 'member' },
              ],
            });
          }
          convId = conv._id;
        }

        const call = await Call.create({
          conversation: convId,
          caller: userId,
          receiver: isGroup ? null : targetReceiver,
          type,
          status: 'ringing',
        });

        const populatedCall = await Call.findById(call._id)
          .populate('caller', 'username displayName avatar')
          .populate('receiver', 'username displayName avatar');

        activeCalls.set(call._id.toString(), {
          caller: userId,
          receiver: targetReceiver,
          type,
          conversationId: convId,
          isGroup,
        });

        if (isGroup) {
          broadcastToConversation(io, convId, userId, 'call:incoming', {
            call: populatedCall,
            callId: call._id.toString(),
            from: populatedCall.caller,
            type,
            conversationId: convId,
          });
        } else if (targetReceiver) {
          const receiverSockets = connectionManager.getUserSockets(targetReceiver);
          console.log(`[CALL] Emitting call:incoming to receiver ${targetReceiver} (active sockets: ${receiverSockets.length})`);
          receiverSockets.forEach(sid => {
            io.to(sid).emit('call:incoming', {
              call: populatedCall,
              callId: call._id.toString(),
              from: populatedCall.caller,
              type,
              conversationId: convId,
            });
          });
          io.to(`user:${targetReceiver}`).emit('call:incoming', {
            call: populatedCall,
            callId: call._id.toString(),
            from: populatedCall.caller,
            type,
            conversationId: convId,
          });
        }

        socket.emit('call:initiated', {
          call: populatedCall,
          callId: call._id.toString(),
        });
        socket.emit('call:ringing', {
          callId: call._id.toString(),
          call: populatedCall,
        });
      } catch (error) {
        console.error('Call initiate error:', error);
        socket.emit('call:error', { error: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', async ({ callId }) => {
      try {
        const call = await Call.findById(callId);
        if (!call) return;

        call.status = 'ongoing';
        call.startedAt = new Date();
        const pIndex = call.participants.findIndex(p => p.user.toString() === userId);
        if (pIndex !== -1) {
          call.participants[pIndex].status = 'joined';
          call.participants[pIndex].joinedAt = new Date();
        } else {
          call.participants.push({ user: userId, status: 'joined', joinedAt: new Date() });
        }
        await call.save();

        const populatedCall = await Call.findById(callId)
          .populate('caller', 'username displayName avatar')
          .populate('receiver', 'username displayName avatar')
          .populate('participants.user', 'username displayName avatar');

        const callerSockets = connectionManager.getUserSockets(call.caller.toString());
        callerSockets.forEach(sid => {
          io.to(sid).emit('call:accepted', { call: populatedCall, userId });
        });

        if (call.isGroup) {
          broadcastToConversation(io, call.conversation, userId, 'call:participant-joined', {
            call: populatedCall,
            userId,
          });
        }
      } catch (error) {
        console.error('Call accept error:', error);
      }
    });

    socket.on('call:reject', async ({ callId, reason = 'declined' }) => {
      try {
        const call = await Call.findById(callId);
        if (!call) return;

        call.status = 'rejected';
        call.endedAt = new Date();
        call.endReason = reason;
        await call.save();

        activeCalls.delete(callId);

        const callerSockets = connectionManager.getUserSockets(call.caller.toString());
        callerSockets.forEach(sid => {
          io.to(sid).emit('call:rejected', { callId, reason, userId });
        });
      } catch (error) {
        console.error('Call reject error:', error);
      }
    });

    socket.on('call:end', async ({ callId, duration = 0 }) => {
      try {
        const call = await Call.findById(callId);
        if (!call) return;

        call.status = 'ended';
        call.endedAt = new Date();
        call.duration = duration;
        call.endReason = 'completed';
        await call.save();

        activeCalls.delete(callId);

        const callData = activeCalls.get(callId);
        if (callData?.isGroup) {
          broadcastToConversation(io, call.conversation, userId, 'call:ended', {
            callId,
            duration,
          });
        } else {
          const otherUserId = call.caller.toString() === userId
            ? call.receiver?.toString()
            : call.caller.toString();

          if (otherUserId) {
            const otherSockets = connectionManager.getUserSockets(otherUserId);
            otherSockets.forEach(sid => {
              io.to(sid).emit('call:ended', { callId, duration });
            });
          }
        }
      } catch (error) {
        console.error('Call end error:', error);
      }
    });

    // WebRTC signaling
    socket.on('call:offer', ({ to, offer, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:offer', { from: userId, offer, callId });
      });
    });

    socket.on('call:answer', ({ to, answer, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:answer', { from: userId, answer, callId });
      });
    });

    socket.on('call:ice-candidate', ({ to, candidate, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:ice-candidate', { from: userId, candidate, callId });
      });
    });

    socket.on('call:ice-restart', ({ to, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:ice-restart', { from: userId, callId });
      });
    });

    socket.on('call:renegotiate', ({ to, offer, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:renegotiate', { from: userId, offer, callId });
      });
    });

    socket.on('call:screen-share', ({ to, enabled, callId }) => {
      const targetId = to?.toString();
      const targetSockets = connectionManager.getUserSockets(targetId);
      targetSockets.forEach(sid => {
        io.to(sid).emit('call:screen-share', { from: userId, enabled, callId });
      });
    });

    // ====== DISCONNECT ======
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${userId} (${socket.id})`);

      // Unregister from centralized connection manager
      connectionManager.removeSocket(userId, socket.id);

      if (!connectionManager.isUserOnline(userId)) {
        // Update user to offline in DB
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: new Date(),
          $pull: { socketIds: socket.id },
        });

        // Broadcast offline status
        const offlineUser = await User.findById(userId);
        if (offlineUser?.friends) {
          offlineUser.friends.forEach(friendId => {
            const friendSockets = connectionManager.getUserSockets(friendId.toString());
            friendSockets.forEach(sid => {
              io.to(sid).emit('user:offline', {
                userId,
                lastSeen: new Date(),
              });
            });
          });
        }
      } else {
        await User.findByIdAndUpdate(userId, {
          $pull: { socketIds: socket.id },
        });
      }
    });
  });
};

// Helper: broadcast to all participants in a conversation except sender
export async function broadcastToConversation(io, conversationId, senderId, event, data) {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    conversation.participants.forEach(p => {
      const pUserId = (p.user?._id || p.user || p)?.toString();
      if (pUserId !== senderId.toString()) {
        const sockets = connectionManager.getUserSockets(pUserId);
        sockets.forEach(sid => {
          io.to(sid).emit(event, data);
        });
        io.to(`user:${pUserId}`).emit(event, data);
      }
    });
  } catch (error) {
    console.error(`Broadcast error (${event}):`, error);
  }
}

export { connectionManager };
export default setupSocket;
