import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
    unique: true,
  },
  deviceName: { type: String, default: 'Unknown Device' },
  browser: { type: String, default: 'Unknown' },
  os: { type: String, default: 'Unknown' },
  ip: { type: String, default: '' },
  lastActive: { type: Date, default: Date.now },
  isRevoked: { type: Boolean, default: false },
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
});

// TTL index to auto-remove expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

const Session = mongoose.model('Session', sessionSchema);
export default Session;
