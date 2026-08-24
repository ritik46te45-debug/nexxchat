import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'audio', 'voice', 'document', 'file'], required: true },
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  fileName: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: '' },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  duration: { type: Number, default: null }, // for audio/video in seconds
  thumbnail: { type: String, default: '' },
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'text', 'image', 'video', 'audio', 'voice',
      'document', 'file', 'gif', 'sticker',
      'location', 'contact', 'poll', 'link',
      'system', 'call', 'forwarded',
    ],
    default: 'text',
  },
  content: {
    type: String,
    default: '',
    maxlength: 10000,
  },
  attachments: [attachmentSchema],
  // Reply
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  // Forward
  isForwarded: { type: Boolean, default: false },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  // Reactions
  reactions: [reactionSchema],
  // Mentions
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Edit
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  editHistory: [{
    content: String,
    editedAt: { type: Date, default: Date.now },
  }],
  // Delivery status
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  },
  deliveredTo: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: { type: Date, default: Date.now },
  }],
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now },
  }],
  // Delete
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  isDeletedForEveryone: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  // Starred
  starredBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Poll data (if type is 'poll')
  poll: {
    question: { type: String, default: '' },
    options: [{
      text: String,
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    }],
    isMultipleChoice: { type: Boolean, default: false },
    isAnonymous: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
  },
  // Location data (if type is 'location')
  location: {
    latitude: Number,
    longitude: Number,
    name: String,
    address: String,
  },
  // Contact data (if type is 'contact')
  contact: {
    name: String,
    phone: String,
    email: String,
  },
  // Link preview data
  linkPreview: {
    url: String,
    title: String,
    description: String,
    image: String,
    domain: String,
  },
  // Call data (if type is 'call')
  callData: {
    callType: { type: String, enum: ['voice', 'video'], default: 'voice' },
    duration: { type: Number, default: 0 },
    status: { type: String, enum: ['missed', 'answered', 'rejected', 'cancelled'], default: 'missed' },
  },
  // Disappearing
  expiresAt: { type: Date, default: null },
  // View Once (Self-destructing media)
  isViewOnce: { type: Boolean, default: false },
  viewedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now },
  }],
  // Client-side ID for deduplication
  clientId: { type: String, default: null },
}, {
  timestamps: true,
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ conversation: 1, 'deletedFor': 1, createdAt: -1 });
messageSchema.index({ clientId: 1 }, { sparse: true });
messageSchema.index({ content: 'text' });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for disappearing messages
messageSchema.index({ 'starredBy': 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
