import mongoose from 'mongoose';
import { authenticateSocket } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Call from '../models/Call.js';

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map();
// Track active calls in memory: Map<callId, { caller, receiver, type, conversationId }>
const activeCalls = new Map();

export const setupSocket = (io) => {
  // Auth middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`🔗 Socket connected: ${userId} (${socket.id})`);

    // Register socket
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Update user online status and socketIds
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
      $addToSet: { socketIds: socket.id },
    });

    // Join personal user rooms for direct event emissions
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
    } catch (e) {
      console.warn('Socket auto room join note:', e.message);
    }

    // Join/Leave active conversation rooms
    socket.on('conversation:join', async ({ conversationId }) => {
      if (conversationId) {
        socket.join(conversationId.toString());
        socket.join(`conv:${conversationId.toString()}`);
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
        const friendSockets = onlineUsers.get(friendId.toString());
        if (friendSockets) {
          friendSockets.forEach(sid => {
            io.to(sid).emit('user:online', { userId, lastSeen: new Date() });
          });
        }
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
          io.to(senderIdStr).to(`user:${senderIdStr}`).emit('message:delivered', {
            messageId,
            conversationId,
            deliveredBy: userId,
          });

          if (conversationId) {
            io.to(conversationId.toString()).to(`conv:${conversationId.toString()}`).emit('message:delivered', {
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

        // Mark messages as read in DB
        await Message.updateMany(
          {
            conversation: conversationId,
            sender: { $ne: userId },
            status: { $ne: 'read' },
          },
          {
            $set: { status: 'read' },
            $addToSet: { readBy: { user: userId, readAt: new Date() } },
          }
        );

        // Broadcast to conversation & sender rooms
        io.to(conversationId.toString()).to(`conv:${conversationId.toString()}`).emit('message:read', {
          conversationId,
          readBy: userId,
          readAt: new Date(),
        });
      } catch (err) {
        console.error('Socket message:read error:', err);
      }
    });

    // ====== CALLS (WebRTC Signaling) ======
    socket.on('call:initiate', async ({ to, type, conversationId }) => {
      try {
        const targetId = to?.toString();
        const receiver = await User.findById(targetId);
        if (!receiver || receiver.blockedUsers?.includes(userId)) {
          socket.emit('call:error', { error: 'Cannot call this user' });
          return;
        }

        // Check if receiver is already busy in another call
        let isReceiverBusy = false;
        for (const [id, c] of activeCalls.entries()) {
          if ((c.caller === targetId || c.receiver === targetId) && (c.status === 'ongoing' || c.status === 'ringing')) {
            isReceiverBusy = true;
            break;
          }
        }

        if (isReceiverBusy) {
          socket.emit('call:busy', { to: targetId, message: 'User is on another call' });
          return;
        }

        let callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        try {
          const call = await Call.create({
            conversation: (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) ? conversationId : undefined,
            caller: userId,
            receiver: targetId,
            type: type || 'voice',
            status: 'ringing',
          });
          if (call?._id) callId = call._id.toString();
        } catch (dbErr) {
          console.warn('Call DB save note:', dbErr.message);
        }

        // Store active call in memory for instantaneous routing
        activeCalls.set(callId, {
          caller: userId.toString(),
          receiver: targetId.toString(),
          type: type || 'voice',
          conversationId,
          status: 'ringing',
          ringingTimeout: null,
        });

        // Find receiver sockets
        const receiverSocketSet = onlineUsers.get(targetId);
        const receiverSockets = receiverSocketSet ? Array.from(receiverSocketSet) : (receiver.socketIds || []);

        receiverSockets.forEach(sid => {
          io.to(sid).emit('call:incoming', {
            callId,
            from: {
              _id: userId,
              displayName: socket.user?.displayName || 'User',
              avatar: socket.user?.avatar,
            },
            type: type || 'voice',
            conversationId,
          });
        });

        socket.emit('call:ringing', { callId });

        // Auto-timeout after 45 seconds for UNANSWERED ringing calls only
        const ringingTimeout = setTimeout(async () => {
          const active = activeCalls.get(callId);
          if (active && active.status === 'ringing') {
            activeCalls.delete(callId);

            if (mongoose.Types.ObjectId.isValid(callId)) {
              try {
                const freshCall = await Call.findById(callId);
                if (freshCall && freshCall.status === 'ringing') {
                  freshCall.status = 'missed';
                  await freshCall.save();
                }
              } catch (e) {}
            }

            const callerSockets = onlineUsers.get(userId.toString());
            if (callerSockets) {
              callerSockets.forEach(sid => io.to(sid).emit('call:timeout', { callId }));
            }
            receiverSockets.forEach(sid => io.to(sid).emit('call:timeout', { callId }));
          }
        }, 45000);

        const currentActive = activeCalls.get(callId);
        if (currentActive) {
          currentActive.ringingTimeout = ringingTimeout;
        }
      } catch (error) {
        console.error('Call initiate error:', error);
        socket.emit('call:error', { error: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', async ({ callId }) => {
      try {
        const active = activeCalls.get(callId);
        let callerId = active?.caller;

        // Cancel the ringing timeout immediately once answered!
        if (active) {
          if (active.ringingTimeout) {
            clearTimeout(active.ringingTimeout);
            active.ringingTimeout = null;
          }
          active.status = 'ongoing';
          active.startedAt = new Date();
        }

        if (mongoose.Types.ObjectId.isValid(callId)) {
          try {
            const call = await Call.findById(callId);
            if (call) {
              call.status = 'ongoing';
              call.startedAt = new Date();
              await call.save();
              callerId = callerId || call.caller?.toString();
            }
          } catch (e) {}
        }

        if (callerId) {
          const callerSockets = onlineUsers.get(callerId);
          if (callerSockets) {
            callerSockets.forEach(sid => {
              io.to(sid).emit('call:accepted', { callId });
            });
          }
        }
      } catch (error) {
        console.error('Call accept error:', error);
      }
    });

    socket.on('call:reject', async ({ callId }) => {
      try {
        const active = activeCalls.get(callId);
        let callerId = active?.caller;
        activeCalls.delete(callId);

        if (mongoose.Types.ObjectId.isValid(callId)) {
          try {
            const call = await Call.findById(callId);
            if (call) {
              call.status = 'rejected';
              await call.save();
              callerId = callerId || call.caller?.toString();
            }
          } catch (e) {}
        }

        if (callerId) {
          const callerSockets = onlineUsers.get(callerId);
          if (callerSockets) {
            callerSockets.forEach(sid => {
              io.to(sid).emit('call:rejected', { callId });
            });
          }
        }
      } catch (error) {
        console.error('Call reject error:', error);
      }
    });

    socket.on('call:end', async ({ callId }) => {
      try {
        const active = activeCalls.get(callId);
        let otherId = active ? (active.caller === userId.toString() ? active.receiver : active.caller) : null;
        activeCalls.delete(callId);

        let duration = 0;
        if (mongoose.Types.ObjectId.isValid(callId)) {
          try {
            const call = await Call.findById(callId);
            if (call) {
              call.status = 'ended';
              call.endedAt = new Date();
              if (call.startedAt) {
                call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
                duration = call.duration;
              }
              await call.save();
              otherId = otherId || (call.caller.toString() === userId.toString() ? call.receiver.toString() : call.caller.toString());

              await Message.create({
                conversation: call.conversation,
                sender: userId,
                type: 'call',
                callData: {
                  callType: call.type,
                  duration: call.duration,
                  status: call.duration > 0 ? 'answered' : 'missed',
                },
              });
            }
          } catch (e) {}
        }

        if (otherId) {
          const otherSockets = onlineUsers.get(otherId);
          if (otherSockets) {
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
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:offer', { from: userId, offer, callId });
        });
      }
    });

    socket.on('call:answer', ({ to, answer, callId }) => {
      const targetId = to?.toString();
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:answer', { from: userId, answer, callId });
        });
      }
    });

    socket.on('call:ice-candidate', ({ to, candidate, callId }) => {
      const targetId = to?.toString();
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:ice-candidate', { from: userId, candidate, callId });
        });
      }
    });

    socket.on('call:ice-restart', ({ to, callId }) => {
      const targetId = to?.toString();
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:ice-restart', { from: userId, callId });
        });
      }
    });

    socket.on('call:renegotiate', ({ to, offer, callId }) => {
      const targetId = to?.toString();
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:renegotiate', { from: userId, offer, callId });
        });
      }
    });

    socket.on('call:screen-share', ({ to, enabled, callId }) => {
      const targetId = to?.toString();
      const targetSockets = onlineUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(sid => {
          io.to(sid).emit('call:screen-share', { from: userId, enabled, callId });
        });
      }
    });

    // ====== DISCONNECT ======
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${userId} (${socket.id})`);

      // Remove this specific socket
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          // Update user to offline
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
            $pull: { socketIds: socket.id },
          });

          // Broadcast offline status
          const offlineUser = await User.findById(userId);
          if (offlineUser?.friends) {
            offlineUser.friends.forEach(friendId => {
              const friendSockets = onlineUsers.get(friendId.toString());
              if (friendSockets) {
                friendSockets.forEach(sid => {
                  io.to(sid).emit('user:offline', {
                    userId,
                    lastSeen: new Date(),
                  });
                });
              }
            });
          }
        } else {
          await User.findByIdAndUpdate(userId, {
            $pull: { socketIds: socket.id },
          });
        }
      }
    });
  });
};

// Helper: broadcast to all participants in a conversation except sender
async function broadcastToConversation(io, conversationId, senderId, event, data) {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    conversation.participants.forEach(p => {
      const pUserId = p.user.toString();
      if (pUserId !== senderId) {
        const sockets = onlineUsers.get(pUserId);
        if (sockets) {
          sockets.forEach(sid => {
            io.to(sid).emit(event, data);
          });
        }
      }
    });
  } catch (error) {
    console.error(`Broadcast error (${event}):`, error);
  }
}

export { onlineUsers };
