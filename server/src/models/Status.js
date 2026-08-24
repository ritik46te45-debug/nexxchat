import mongoose from 'mongoose';

const statusSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video'],
    required: true,
  },
  content: {
    type: String, // text content or caption
    default: '',
    maxlength: 700,
  },
  media: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    duration: { type: Number, default: null },
  },
  backgroundColor: {
    type: String,
    default: '#1a1a2e',
  },
  fontStyle: {
    type: String,
    default: 'default',
  },
  emoji: {
    type: String,
    default: '',
  },
  // Privacy
  visibility: {
    type: String,
    enum: ['everyone', 'friends', 'custom'],
    default: 'friends',
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  excludedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Viewers
  viewers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now },
  }],
  // Reactions
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    createdAt: { type: Date, default: Date.now },
  }],
  // Replies
  replies: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now },
  }],
  // Auto-expire after 24 hours
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
}, {
  timestamps: true,
});

// TTL index — automatically deletes expired statuses
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
statusSchema.index({ user: 1, createdAt: -1 });

const Status = mongoose.model('Status', statusSchema);
export default Status;
