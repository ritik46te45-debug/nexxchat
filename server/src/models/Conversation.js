import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['private', 'group'],
    default: 'private',
  },
  participants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['member', 'admin', 'owner'], default: 'member' },
    lastReadAt: { type: Date, default: null },
    isMuted: { type: Boolean, default: false },
    mutedUntil: { type: Date, default: null },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    unreadCount: { type: Number, default: 0 },
    draft: { type: String, default: '' },
  }],
  // Group-specific fields
  groupName: { type: String, trim: true, maxlength: 100 },
  groupAvatar: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  groupDescription: { type: String, default: '', maxlength: 500 },
  groupSettings: {
    onlyAdminsCanSend: { type: Boolean, default: false },
    onlyAdminsCanEditInfo: { type: Boolean, default: true },
    onlyAdminsCanAddMembers: { type: Boolean, default: false },
    onlyAdminsCanPin: { type: Boolean, default: true },
    maxMembers: { type: Number, default: 256 },
  },
  // Last message for preview
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  // Disappearing messages
  disappearingMessages: {
    enabled: { type: Boolean, default: false },
    duration: { type: Number, default: 0 }, // in seconds: 86400 (24h), 604800 (7d), 2592000 (30d)
  },
  // Pinned messages
  pinnedMessages: [{
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pinnedAt: { type: Date, default: Date.now },
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes
conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ type: 1 });
conversationSchema.index({ 'participants.user': 1, 'participants.isDeleted': 1 });

// Find a private conversation between two users
conversationSchema.statics.findPrivateConversation = async function (userId1, userId2) {
  return this.findOne({
    type: 'private',
    'participants.user': { $all: [userId1, userId2] },
  }).populate('lastMessage').populate('participants.user', 'username displayName avatar isOnline lastSeen');
};

// Get participant data for a specific user
conversationSchema.methods.getParticipant = function (userId) {
  return this.participants.find(p => p.user.toString() === userId.toString() || p.user._id?.toString() === userId.toString());
};

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
