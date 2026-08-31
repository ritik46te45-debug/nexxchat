import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const privacyOptionSchema = new mongoose.Schema({
  profilePhoto: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'everyone' },
  lastSeen: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'everyone' },
  online: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'everyone' },
  about: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'everyone' },
  readReceipts: { type: Boolean, default: true },
  typingIndicator: { type: Boolean, default: true },
  statusVisibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'everyone' },
}, { _id: false });

const twoFactorSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  secret: { type: String, default: null },
  backupCodes: [{ code: String, used: { type: Boolean, default: false } }],
}, { _id: false });

const notificationSettingsSchema = new mongoose.Schema({
  // Master kill switch
  allNotifications: { type: Boolean, default: true },

  // Per-category toggles
  messages: { type: Boolean, default: true },
  calls: { type: Boolean, default: true },
  groups: { type: Boolean, default: true },
  friendRequests: { type: Boolean, default: true },
  mentions: { type: Boolean, default: true },
  statusUpdates: { type: Boolean, default: true },

  // Delivery modifiers
  sound: { type: Boolean, default: true },
  vibration: { type: Boolean, default: true },
  desktopNotifications: { type: Boolean, default: true },

  // Content privacy
  showPreview: { type: Boolean, default: true },
  showSender: { type: Boolean, default: true },

  // Do Not Disturb
  doNotDisturb: { type: Boolean, default: false },
  dndSchedule: {
    enabled: { type: Boolean, default: false },
    startTime: { type: String, default: '22:00' },
    endTime: { type: String, default: '07:00' },
    timezone: { type: String, default: 'UTC' },
  },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    lowercase: true,
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    minlength: 8,
    select: false,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  avatar: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  about: {
    type: String,
    default: 'Hey there! I\'m using NexChat',
    maxlength: 500,
  },
  phone: {
    type: String,
    default: '',
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  googleId: {
    type: String,
    default: null,
  },
  userCode: {
    type: String,
    length: 4,
    default: () => String(Math.floor(1000 + Math.random() * 9000)),
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user',
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  privacy: {
    type: privacyOptionSchema,
    default: () => ({}),
  },
  twoFactor: {
    type: twoFactorSchema,
    default: () => ({}),
  },
  notificationSettings: {
    type: notificationSettingsSchema,
    default: () => ({}),
  },
  theme: {
    type: String,
    enum: ['dark', 'light', 'system'],
    default: 'dark',
  },
  language: {
    type: String,
    default: 'en',
  },
  socketIds: [{
    type: String,
  }],
  fcmTokens: [{
    type: String,
  }],
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  }],
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
    default: null,
  },
  isBanned: {
    type: Boolean,
    default: false,
  },
  banReason: String,
  bannedAt: Date,
  bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Index for search
userSchema.index({ username: 'text', displayName: 'text', userCode: 'text' });
userSchema.index({ userCode: 1 });
userSchema.index({ googleId: 1 });

// Ensure 4-digit userCode and hash password before save
userSchema.pre('save', async function (next) {
  if (!this.userCode) {
    this.userCode = String(Math.floor(1000 + Math.random() * 9000));
  }
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

  if (this.lockUntil && this.lockUntil < Date.now()) {
    await this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
    return;
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME };
  }
  await this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
  await this.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
};

// Sanitize output
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.twoFactor?.secret;
  delete obj.twoFactor?.backupCodes;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
