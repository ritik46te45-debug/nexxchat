import mongoose from 'mongoose';
import { authenticateSocket } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Call from '../models/Call.js';
import Notification from '../models/Notification.js';
import connectionManager from './connectionManager.js';
import { dispatchPush } from '../services/pushService.js';

// In-memory registry of active ongoing calls (callId -> metadata)
const activeCalls = new Map();

export const setupSocket = (io) => {
  // Auth middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const deviceId = socket.handshake.auth?.deviceId || socket.handshake.query?.deviceId || null;
    const transport = socket.conn.transport.name;
    console.log(`[REALTIME] SOCKET CONNECTED -> User: ${userId} | Socket: ${socket.id} | Device: ${deviceId || 'N/A'} | Transport: ${transport}`);

    // Register socket in centralized connection manager
    connectionManager.registerSocket(userId, socket.id, deviceId);

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

    // Send currently online user IDs to the newly connected user immediately!
    const onlineIds = connectionManager.getOnlineUserIds();
    socket.emit('users:online_list', { userIds: onlineIds });

    // Helper to find all peers (friends + all participants of user's conversations)
    const broadcastPresence = async (event, payload) => {
      try {
        const targetIds = new Set();
        // 1. All participants across all user's conversations
        const userConversations = await Conversation.find({
          'participants.user': userId,
        }).select('participants.user').lean();
        
        userConversations.forEach(c => {
          (c.participants || []).forEach(p => {
            const pId = (p.user?._id || p.user)?.toString();
            if (pId && pId !== userId.toString()) targetIds.add(pId);
          });
        });

        // 2. All friends
        const u = await User.findById(userId).select('friends').lean();
        if (u?.friends) {
          u.friends.forEach(f => {
            const fId = (f?._id || f)?.toString();
            if (fId && fId !== userId.toString()) targetIds.add(fId);
          });
        }

        // Broadcast to all peers
        targetIds.forEach(targetId => {
          io.to(targetId).to(`user:${targetId}`).emit(event, payload);
        });
      } catch (err) {
        console.warn(`Presence broadcast error (${event}):`, err.message);
      }
    };

    // Broadcast that this user is now online
    broadcastPresence('user:online', { userId, lastSeen: new Date() });

    // Automatically check and emit any pending ringing incoming call (reconnect / app launch sync)
    const checkAndEmitPendingCall = async () => {
      try {
        const ringingCall = await Call.findOne({
          receiver: userId,
          status: 'ringing',
          createdAt: { $gte: new Date(Date.now() - 60000) }, // Call initiated in last 60 seconds
        })
          .populate('caller', 'username displayName avatar isOnline')
          .sort({ createdAt: -1 });

        if (ringingCall) {
          console.log(`[CALL] Emitting pending ringing call ${ringingCall._id} to user ${userId}`);
          socket.emit('call:incoming', {
            call: ringingCall,
            callId: ringingCall._id.toString(),
            from: ringingCall.caller,
            type: ringingCall.type,
            conversationId: ringingCall.conversation?.toString(),
          });
        }
      } catch (e) {
        console.warn('[CALL] checkAndEmitPendingCall note:', e.message);
      }
    };

    checkAndEmitPendingCall();
    socket.on('call:check-pending', checkAndEmitPendingCall);

    // Allow client to request fresh online users list at any time
    socket.on('users:get_online', () => {
      socket.emit('users:online_list', { userIds: connectionManager.getOnlineUserIds() });
    });


    // ====== TYPING ======
    socket.on('typing:start', ({ conversationId }) => {
      if (!conversationId) return;
      const cid = conversationId.toString();
      socket.to(`conv:${cid}`).to(cid).emit('typing:start', {
        userId,
        conversationId: cid,
        displayName: socket.user?.displayName,
      });
      broadcastToConversation(io, cid, userId, 'typing:start', {
        userId,
        conversationId: cid,
        displayName: socket.user?.displayName,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      if (!conversationId) return;
      const cid = conversationId.toString();
      socket.to(`conv:${cid}`).to(cid).emit('typing:stop', {
        userId,
        conversationId: cid,
      });
      broadcastToConversation(io, cid, userId, 'typing:stop', {
        userId,
        conversationId: cid,
      });
    });

    // ====== RECORDING ======
    socket.on('recording:start', ({ conversationId }) => {
      if (!conversationId) return;
      const cid = conversationId.toString();
      socket.to(`conv:${cid}`).to(cid).emit('recording:start', {
        userId,
        conversationId: cid,
        displayName: socket.user?.displayName,
      });
      broadcastToConversation(io, cid, userId, 'recording:start', {
        userId,
        conversationId: cid,
        displayName: socket.user?.displayName,
      });
    });

    socket.on('recording:stop', ({ conversationId }) => {
      if (!conversationId) return;
      const cid = conversationId.toString();
      socket.to(`conv:${cid}`).to(cid).emit('recording:stop', {
        userId,
        conversationId: cid,
      });
      broadcastToConversation(io, cid, userId, 'recording:stop', {
        userId,
        conversationId: cid,
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

        // [RT-007] recipient SOCKETS RESOLVED & [RT-008] message:new EMITTING (deduplicated)
        let broadcaster = io.to(`conv:${conversationId}`);
        recipientIds.forEach(rId => {
          broadcaster = broadcaster.to(`user:${rId}`).to(rId.toString());
        });
        // Multi-device sync for other devices of sender
        broadcaster = broadcaster.to(`user:${userId}`).to(userId.toString());
        broadcaster.emit('message:new', payload);

        // [RT-009] Save in-app notifications and emit real-time count
        recipientIds.forEach(async (rId) => {
          try {
            const notifType = conversation.type === 'group' ? 'group_message' : 'message';
            const notifTitle = conversation.type === 'group'
              ? `${canonicalMessage.sender?.displayName || 'User'} (${conversation.groupName || conversation.groupDetails?.name || 'Group'})`
              : (canonicalMessage.sender?.displayName || 'User');
            const notifBody = canonicalMessage.content || (
              canonicalMessage.type === 'video_note' ? 'Sent a video note 🎥' :
              canonicalMessage.type === 'voice' ? 'Sent a voice message 🎤' :
              `Sent a ${canonicalMessage.type || 'message'}`
            );

            const notif = await Notification.create({
              recipient: rId,
              sender: userId,
              type: notifType,
              title: notifTitle,
              body: notifBody,
              data: {
                conversationId: conversationId.toString(),
                messageId: canonicalMessage._id.toString(),
              },
            });

            const unreadCount = await Notification.countDocuments({ recipient: rId, isRead: false });
            io.to(`user:${rId}`).to(rId).emit('notification:count', { count: unreadCount });
            io.to(`user:${rId}`).to(rId).emit('notification:new', notif);
          } catch (notifErr) {
            console.warn('[NOTIF] Socket message in-app notification error:', notifErr.message);
          }
        });

        // [RT-010] Dispatch push notifications to background/closed devices of recipients
        recipientIds.forEach(rId => {
          dispatchPush(
            rId,
            conversation.type === 'group' ? 'group_message' : 'message',
            {
              senderName: canonicalMessage.sender?.displayName || 'User',
              senderAvatar: canonicalMessage.sender?.avatar?.url || '',
              content: canonicalMessage.content || '',
              type: canonicalMessage.type || 'text',
              conversationId: conversationId.toString(),
              messageId: canonicalMessage._id.toString(),
              senderId: userId.toString(),
            },
            {
              conversationId: conversationId.toString(),
              skipForegroundDevices: true,
            }
          ).catch(e => console.warn('[PUSH] Socket message push dispatch note:', e.message));
        });

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

        const convObjectId = new mongoose.Types.ObjectId(conversationId);
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Atomic reset unread count & lastReadAt in MongoDB
        await Conversation.updateOne(
          { _id: convObjectId, 'participants.user': userObjectId },
          {
            $set: {
              'participants.$.unreadCount': 0,
              'participants.$.lastReadAt': new Date(),
            }
          }
        );

        // Mark unread messages read
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

        // Mark in-app notifications for this conversation as read
        await Notification.updateMany(
          {
            recipient: userObjectId,
            'data.conversationId': conversationId,
            isRead: false,
          },
          {
            $set: { isRead: true, readAt: new Date() }
          }
        );

        const unreadNotifCount = await Notification.countDocuments({
          recipient: userObjectId,
          isRead: false,
        });
        io.to(`user:${userId}`).to(userId.toString()).emit('notification:count', { count: unreadNotifCount });

        const conversation = await Conversation.findById(convObjectId).select('participants.user');
        if (!conversation) return;

        // Notify other participants via chained de-duplicated broadcaster
        const payload = {
          conversationId,
          readBy: userId,
          readAt: new Date(),
        };

        let readBroadcaster = io.to(`conv:${conversationId}`);
        conversation.participants.forEach(p => {
          const pUserId = (p.user?._id || p.user || p)?.toString();
          if (pUserId) {
            readBroadcaster = readBroadcaster.to(`user:${pUserId}`).to(pUserId.toString());
          }
        });
        readBroadcaster.emit('message:read', payload);
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // ====== CALLS & SIGNALING ======
    // Helper to reliably deliver signaling to target user across rooms without duplicate events
    const emitToUser = (targetId, event, data) => {
      const tid = targetId?.toString();
      if (!tid) return;
      io.to(`user:${tid}`).to(tid).emit(event, data);
    };

    socket.on('call:initiate', async ({ conversationId, receiverId, to, type = 'voice', isGroup = false }) => {
      try {
        const targetReceiver = (receiverId || to)?.toString();
        console.log(`[CALL] initiate: from ${userId} to ${targetReceiver}, conv: ${conversationId}, type: ${type}`);

        if (!targetReceiver && !isGroup) {
          return socket.emit('call:error', { error: 'Receiver ID is required' });
        }

        // Auto-resolve or validate conversation
        let convId = conversationId;
        if (convId && !mongoose.Types.ObjectId.isValid(convId)) {
          convId = null;
        }

        if (!convId && targetReceiver && mongoose.Types.ObjectId.isValid(targetReceiver)) {
          const userObjId = new mongoose.Types.ObjectId(userId);
          const targetObjId = new mongoose.Types.ObjectId(targetReceiver);

          let conv = await Conversation.findOne({
            type: 'private',
            'participants.user': { $all: [userObjId, targetObjId] },
          });
          if (!conv) {
            conv = await Conversation.create({
              type: 'private',
              participants: [
                { user: userObjId, role: 'member' },
                { user: targetObjId, role: 'member' },
              ],
            });
          }
          convId = conv._id;
        }

        if (!convId) {
          console.warn(`[CALL] Missing conversation for caller ${userId} and receiver ${targetReceiver}`);
          return socket.emit('call:error', { error: 'Could not resolve conversation for this call' });
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

        console.log(`[CALL] Call created: ${call._id} | caller: ${userId} | receiver: ${targetReceiver} | conv: ${convId}`);

        if (isGroup) {
          broadcastToConversation(io, convId, userId, 'call:incoming', {
            call: populatedCall,
            callId: call._id.toString(),
            from: populatedCall.caller,
            type,
            conversationId: convId,
          });
        } else if (targetReceiver) {
          emitToUser(targetReceiver, 'call:incoming', {
            call: populatedCall,
            callId: call._id.toString(),
            from: populatedCall.caller,
            type,
            conversationId: convId,
          });

          // Create in-app notification for incoming call
          try {
            const notif = await Notification.create({
              recipient: targetReceiver,
              sender: userId,
              type: 'call_incoming',
              title: populatedCall.caller?.displayName || 'Incoming Call',
              body: `Incoming ${type} call`,
              data: {
                conversationId: convId,
                callId: call._id,
              },
            });
            const unreadCount = await Notification.countDocuments({ recipient: targetReceiver, isRead: false });
            emitToUser(targetReceiver, 'notification:count', { count: unreadCount });
            emitToUser(targetReceiver, 'notification:new', notif);
          } catch (notifErr) {
            console.warn('[CALL] Failed to record incoming call notification:', notifErr.message);
          }

          // Dispatch incoming call push to target receiver devices
          dispatchPush(
            targetReceiver,
            'call',
            {
              callerName: populatedCall.caller?.displayName || 'User',
              callerAvatar: populatedCall.caller?.avatar?.url || '',
              callerId: (populatedCall.caller?._id || userId).toString(),
              callType: type,
              callId: call._id.toString(),
              conversationId: convId?.toString(),
            },
            {
              conversationId: convId?.toString(),
              skipForegroundDevices: false, // Send to all devices so phone rings even if tab is in bg
            }
          ).catch(e => console.warn('[PUSH] Call push dispatch note:', e.message));
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
        console.error('[CALL] Call initiate error:', error);
        socket.emit('call:error', { error: error.message || 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', async ({ callId }) => {
      try {
        console.log(`[CALL] accept: callId ${callId} accepted by user ${userId}`);
        let call = null;
        if (callId && mongoose.Types.ObjectId.isValid(callId)) {
          call = await Call.findById(callId);
        }
        if (!call) {
          call = await Call.findOne({ receiver: userId, status: 'ringing' }).sort({ createdAt: -1 });
        }
        if (!call) return;

        call.status = 'ongoing';
        call.startedAt = new Date();
        await call.save();

        const populatedCall = await Call.findById(call._id)
          .populate('caller', 'username displayName avatar')
          .populate('receiver', 'username displayName avatar');

        const callerId = (call.caller?._id || call.caller)?.toString();
        if (callerId) {
          emitToUser(callerId, 'call:accepted', { call: populatedCall, callId: call._id.toString(), userId });
        }
      } catch (error) {
        console.error('Call accept error:', error);
      }
    });

    socket.on('call:reject', async ({ callId, reason = 'declined' }) => {
      try {
        let call = null;
        if (callId && mongoose.Types.ObjectId.isValid(callId)) {
          call = await Call.findById(callId);
        }
        if (!call) {
          call = await Call.findOne({ receiver: userId, status: 'ringing' }).sort({ createdAt: -1 });
        }
        if (!call) return;

        call.status = 'rejected';
        call.endedAt = new Date();
        call.endReason = reason;
        await call.save();

        activeCalls.delete(call._id.toString());
        if (callId) activeCalls.delete(callId);

        const callerId = (call.caller?._id || call.caller)?.toString();
        const receiverId = (call.receiver?._id || call.receiver)?.toString();
        const convId = call.conversation;

        if (callerId) {
          emitToUser(callerId, 'call:rejected', { callId: call._id.toString(), reason, userId });
        }

        // WhatsApp-style call record message in conversation
        if (convId) {
          try {
            const isMissed = reason === 'missed' || reason === 'timeout';
            const callMsg = await Message.create({
              conversation: convId,
              sender: call.caller,
              type: 'call',
              content: isMissed ? `Missed ${call.type || 'voice'} call` : `Declined ${call.type || 'voice'} call`,
              callData: {
                callType: call.type || 'voice',
                duration: 0,
                status: isMissed ? 'missed' : 'rejected',
              },
            });

            const populatedMsg = await Message.findById(callMsg._id)
              .populate('sender', 'username displayName avatar');

            await Conversation.findByIdAndUpdate(convId, {
              lastMessage: callMsg._id,
              lastMessageAt: new Date(),
            });

            const msgPayload = {
              message: populatedMsg,
              conversationId: convId.toString(),
            };

            io.to(`conv:${convId}`).emit('message:new', msgPayload);
            if (callerId) emitToUser(callerId, 'message:new', msgPayload);
            if (receiverId) emitToUser(receiverId, 'message:new', msgPayload);
          } catch (msgErr) {
            console.warn('[CALL] Failed to create call record message on reject:', msgErr.message);
          }
        }

        // Create missed call notification for receiver
        if (receiverId) {
          try {
            const isMissed = reason === 'missed' || reason === 'timeout';
            const callerUser = await User.findById(call.caller).select('displayName username avatar');
            const missedNotif = await Notification.create({
              recipient: receiverId,
              sender: call.caller,
              type: 'call_missed',
              title: isMissed ? 'Missed Call' : 'Call Declined',
              body: `${isMissed ? 'Missed' : 'Declined'} ${call.type || 'voice'} call from ${callerUser?.displayName || 'User'}`,
              data: {
                conversationId: convId,
                callId: call._id,
              },
            });
            const unreadCount = await Notification.countDocuments({ recipient: receiverId, isRead: false });
            emitToUser(receiverId, 'notification:count', { count: unreadCount });
            emitToUser(receiverId, 'notification:new', missedNotif);
          } catch (ne) {
            console.warn('[CALL] Failed to record missed call notif:', ne.message);
          }
        }
      } catch (error) {
        console.error('Call reject error:', error);
      }
    });

    socket.on('call:end', async ({ callId, duration = 0 }) => {
      try {
        let call = null;
        if (callId && mongoose.Types.ObjectId.isValid(callId)) {
          call = await Call.findById(callId);
        }
        if (!call) {
          call = await Call.findOne({
            $or: [{ caller: userId }, { receiver: userId }],
            status: { $in: ['ringing', 'ongoing'] },
          }).sort({ createdAt: -1 });
        }
        if (!call) {
          call = await Call.findOne({
            $or: [{ caller: userId }, { receiver: userId }],
            createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
          }).sort({ createdAt: -1 });
        }
        if (!call) return;

        call.status = 'ended';
        call.endedAt = new Date();

        // Use client-reported duration, or compute from timestamps as failsafe
        let finalDuration = Number(duration) || 0;
        if ((!finalDuration || finalDuration <= 0) && call.startedAt) {
          finalDuration = Math.round((call.endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000);
          if (finalDuration < 0) finalDuration = 0;
        }
        call.duration = finalDuration;
        call.endReason = 'completed';
        await call.save();

        activeCalls.delete(call._id.toString());
        if (callId) activeCalls.delete(callId);

        const callerId = (call.caller?._id || call.caller)?.toString();
        const receiverId = (call.receiver?._id || call.receiver)?.toString();
        const otherUserId = callerId === userId ? receiverId : callerId;
        const convId = call.conversation;

        if (otherUserId) {
          emitToUser(otherUserId, 'call:ended', { callId: call._id.toString(), duration: finalDuration });
        }

        // WhatsApp-style call record message in conversation
        if (convId) {
          try {
            const m = Math.floor(finalDuration / 60);
            const s = finalDuration % 60;
            const durText = m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
            const isAnswered = finalDuration > 0;

            const callMsg = await Message.create({
              conversation: convId,
              sender: call.caller,
              type: 'call',
              content: isAnswered
                ? `${call.type === 'video' ? 'Video' : 'Voice'} call, ${durText}`
                : `Missed ${call.type || 'voice'} call`,
              callData: {
                callType: call.type || 'voice',
                duration: finalDuration,
                status: isAnswered ? 'answered' : 'missed',
              },
            });

            const populatedMsg = await Message.findById(callMsg._id)
              .populate('sender', 'username displayName avatar');

            await Conversation.findByIdAndUpdate(convId, {
              lastMessage: callMsg._id,
              lastMessageAt: new Date(),
            });

            const msgPayload = {
              message: populatedMsg,
              conversationId: convId.toString(),
            };

            io.to(`conv:${convId}`).emit('message:new', msgPayload);
            if (callerId) emitToUser(callerId, 'message:new', msgPayload);
            if (receiverId) emitToUser(receiverId, 'message:new', msgPayload);

            // If duration is 0, also create missed call notification for receiver
            if (!isAnswered && receiverId) {
              try {
                const callerUser = await User.findById(call.caller).select('displayName username avatar');
                const missedNotif = await Notification.create({
                  recipient: receiverId,
                  sender: call.caller,
                  type: 'call_missed',
                  title: 'Missed Call',
                  body: `Missed ${call.type || 'voice'} call from ${callerUser?.displayName || 'User'}`,
                  data: {
                    conversationId: convId,
                    callId: call._id,
                  },
                });
                const unreadCount = await Notification.countDocuments({ recipient: receiverId, isRead: false });
                emitToUser(receiverId, 'notification:count', { count: unreadCount });
                emitToUser(receiverId, 'notification:new', missedNotif);
              } catch (ne) {
                console.warn('[CALL] Failed to record missed call notif on end:', ne.message);
              }
            }
          } catch (msgErr) {
            console.warn('[CALL] Failed to create call record message on end:', msgErr.message);
          }
        }
      } catch (error) {
        console.error('Call end error:', error);
      }
    });

    // WebRTC signaling
    socket.on('call:offer', ({ to, offer, callId }) => {
      emitToUser(to, 'call:offer', { from: userId, offer, callId });
    });

    socket.on('call:answer', ({ to, answer, callId }) => {
      emitToUser(to, 'call:answer', { from: userId, answer, callId });
    });

    socket.on('call:connected', ({ to, callId }) => {
      emitToUser(to, 'call:connected', { from: userId, callId });
    });

    socket.on('call:ice-candidate', ({ to, candidate, callId }) => {
      emitToUser(to, 'call:ice-candidate', { from: userId, candidate, callId });
    });

    socket.on('call:ice-restart', ({ to, callId }) => {
      emitToUser(to, 'call:ice-restart', { from: userId, callId });
    });

    socket.on('call:renegotiate', ({ to, offer, callId }) => {
      emitToUser(to, 'call:renegotiate', { from: userId, offer, callId });
    });

    socket.on('call:screen-share', ({ to, enabled, callId }) => {
      emitToUser(to, 'call:screen-share', { from: userId, enabled, callId });
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

        // Broadcast offline status to all conversation participants & friends
        broadcastPresence('user:offline', {
          userId,
          lastSeen: new Date(),
        });
      } else {
        await User.findByIdAndUpdate(userId, {
          $pull: { socketIds: socket.id },
        });
      }
    });
  });
};

// In-memory cache for active conversation participants to prevent hammering DB on typing/recording
const convParticipantsCache = new Map();

// Helper: broadcast to all participants in a conversation except sender
export async function broadcastToConversation(io, conversationId, senderId, event, data) {
  try {
    if (!conversationId) return;
    const cid = conversationId.toString();
    const now = Date.now();
    let cached = convParticipantsCache.get(cid);

    if (!cached || cached.expiresAt < now) {
      const conversation = await Conversation.findById(cid).select('participants.user');
      if (!conversation) return;
      const pIds = (conversation.participants || []).map(p => (p.user?._id || p.user || p)?.toString()).filter(Boolean);
      cached = { participants: pIds, expiresAt: now + 60000 };
      convParticipantsCache.set(cid, cached);
      if (convParticipantsCache.size > 100) {
        const firstKey = convParticipantsCache.keys().next().value;
        convParticipantsCache.delete(firstKey);
      }
    }

    cached.participants.forEach(pUserId => {
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
