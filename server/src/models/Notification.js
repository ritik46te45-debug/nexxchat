import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  type: {
    type: String,
    enum: [
      'message', 'friend_request', 'friend_accepted',
      'group_invite', 'group_message', 'mention',
      'reaction', 'call_missed', 'call_incoming',
      'status_reaction', 'status_reply',
      'system', 'admin',
    ],
    required: true,
  },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  data: {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    friendRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'FriendRequest', default: null },
    statusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Status', default: null },
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', default: null },
  },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, {
  timestamps: true,
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
