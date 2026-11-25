import mongoose from 'mongoose';

const aiMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  imageUrl: {
    type: String,
    default: '',
  },
  isImage: {
    type: Boolean,
    default: false,
  },
  promptUsed: {
    type: String,
    default: '',
  },
  modelUsed: {
    type: String,
    default: '',
  },
  summaryMeta: {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    conversationName: { type: String, default: '' },
    messageCount: { type: Number, default: 0 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const aiConversationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New AI Chat',
    trim: true,
    maxlength: 120,
  },
  model: {
    type: String,
    default: 'gemini-3.5-flash',
  },
  messages: [aiMessageSchema],
}, {
  timestamps: true,
});

aiConversationSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model('AIConversation', aiConversationSchema);
