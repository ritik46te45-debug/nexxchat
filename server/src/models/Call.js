import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['voice', 'video'],
    required: true,
  },
  status: {
    type: String,
    enum: ['ringing', 'ongoing', 'ended', 'missed', 'rejected', 'cancelled', 'failed'],
    default: 'ringing',
  },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  duration: { type: Number, default: 0 }, // seconds
  hasScreenShare: { type: Boolean, default: false },
  quality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor', 'unknown'],
    default: 'unknown',
  },
}, {
  timestamps: true,
});

callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ conversation: 1 });

const Call = mongoose.model('Call', callSchema);
export default Call;
