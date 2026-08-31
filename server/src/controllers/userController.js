import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';

const hasValidCloudinaryConfig = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && secret && name !== 'your-cloud-name' && !name.includes('your-'));
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
  try {
    const allowedFields = ['displayName', 'about', 'phone', 'theme', 'language'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ user: user.toSafeObject() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
};

// UPDATE AVATAR (DP)
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const user = await User.findById(req.userId);

    // Delete old avatar from Cloudinary if exists
    if (user.avatar.publicId && hasValidCloudinaryConfig()) {
      await cloudinary.uploader.destroy(user.avatar.publicId).catch(console.error);
    }

    let avatarUrl = '';
    let publicId = '';

    if (hasValidCloudinaryConfig()) {
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'nexchat/avatars',
              transformation: [
                { width: 500, height: 500, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' },
              ],
              resource_type: 'image',
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        avatarUrl = result.secure_url;
        publicId = result.public_id;
      } catch (cloudErr) {
        // Fallback to local
        const uploadDir = path.join(process.cwd(), 'public/uploads/avatars');
        await fs.promises.mkdir(uploadDir, { recursive: true });
        const filename = `${Date.now()}_avatar.jpg`;
        await fs.promises.writeFile(path.join(uploadDir, filename), req.file.buffer);
        avatarUrl = `/uploads/avatars/${filename}`;
      }
    } else {
      const uploadDir = path.join(process.cwd(), 'public/uploads/avatars');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filename = `${Date.now()}_avatar.jpg`;
      await fs.promises.writeFile(path.join(uploadDir, filename), req.file.buffer);
      avatarUrl = `/uploads/avatars/${filename}`;
    }

    user.avatar = {
      url: avatarUrl,
      publicId,
    };
    await user.save();

    res.json({
      message: 'Avatar updated',
      avatar: user.avatar,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Avatar update failed' });
  }
};

// REMOVE AVATAR
export const removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (user.avatar.publicId) {
      await cloudinary.uploader.destroy(user.avatar.publicId).catch(console.error);
    }

    user.avatar = { url: '', publicId: '' };
    await user.save();

    res.json({ message: 'Avatar removed', user: user.toSafeObject() });
  } catch (error) {
    console.error('Remove avatar error:', error);
    res.status(500).json({ error: 'Avatar removal failed' });
  }
};

// UPDATE PRIVACY SETTINGS
export const updatePrivacy = async (req, res) => {
  try {
    const allowedFields = [
      'profilePhoto', 'lastSeen', 'online', 'about',
      'readReceipts', 'typingIndicator', 'statusVisibility',
    ];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[`privacy.${field}`] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({ privacy: user.privacy, user: user.toSafeObject() });
  } catch (error) {
    console.error('Update privacy error:', error);
    res.status(500).json({ error: 'Privacy update failed' });
  }
};

// UPDATE NOTIFICATION SETTINGS
export const updateNotificationSettings = async (req, res) => {
  try {
    const updates = {};
    const allowedFields = [
      'allNotifications',
      'messages',
      'calls',
      'groups',
      'friendRequests',
      'mentions',
      'statusUpdates',
      'sound',
      'vibration',
      'desktopNotifications',
      'showPreview',
      'showSender',
      'doNotDisturb',
      'dndSchedule',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[`notificationSettings.${field}`] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json({
      notificationSettings: user.notificationSettings,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Notification settings update failed' });
  }
};

// SEARCH USERS (Strict Exact Match for Username or Unique User Code)
export const searchUsers = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let cleanQuery = q.trim();
    if (cleanQuery.startsWith('@')) {
      cleanQuery = cleanQuery.slice(1).trim();
    }

    const orConditions = [];

    // 1. username#1234 format (Exact username + exact unique code)
    if (cleanQuery.includes('#')) {
      const [uPart, tagPart] = cleanQuery.split('#');
      const trimmedUser = uPart?.trim();
      const trimmedTag = tagPart?.trim().replace(/[^0-9]/g, '');
      if (trimmedUser && trimmedTag) {
        const escapedU = trimmedUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        orConditions.push({
          username: new RegExp(`^${escapedU}$`, 'i'),
          userCode: trimmedTag,
        });
      }
    }

    // 2. Exact 4-digit unique code search (#1234 or 1234)
    const codeDigits = cleanQuery.replace(/[^0-9]/g, '');
    if ((cleanQuery.startsWith('#') && codeDigits.length >= 4) || (codeDigits.length === 4 && cleanQuery.length === 4)) {
      orConditions.push({ userCode: codeDigits });
    }

    // 3. Exact full username match (^username$) - strictly prevents partial 3-4 letter discovery
    const escapedUsername = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    orConditions.push({
      username: new RegExp(`^${escapedUsername}$`, 'i'),
    });

    // 4. Exact full email match (^email$)
    if (cleanQuery.includes('@') && cleanQuery.includes('.')) {
      orConditions.push({
        email: new RegExp(`^${escapedUsername}$`, 'i'),
      });
    }

    if (orConditions.length === 0) {
      return res.json({ users: [] });
    }

    const users = await User.find({
      isBanned: false,
      $or: orConditions,
    })
      .select('username displayName userCode avatar isOnline lastSeen about')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Map isSelf indicator
    const formattedUsers = users.map(u => ({
      ...u,
      isSelf: u._id.toString() === req.userId.toString(),
    }));

    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// GET USER PROFILE
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('username displayName userCode avatar isOnline lastSeen about phone privacy');

    if (!user || user.isBanned) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = user.toObject();

    // Apply privacy settings (Defaults to 'everyone' if undefined)
    const isSelf = req.userId.toString() === userId.toString();
    const isFriend = req.user?.friends?.some(f => (f._id || f).toString() === userId.toString());

    const canSee = (setting) => {
      if (isSelf) return true;
      if (!setting || setting === 'everyone') return true;
      if (setting === 'friends' && isFriend) return true;
      return false;
    };

    if (!canSee(profile.privacy?.lastSeen)) {
      delete profile.lastSeen;
    }
    if (!canSee(profile.privacy?.online)) {
      delete profile.isOnline;
    }
    if (!canSee(profile.privacy?.about)) {
      profile.about = '';
    }
    if (!canSee(profile.privacy?.profilePhoto)) {
      profile.avatar = { url: '', publicId: '' };
    }

    delete profile.privacy;
    delete profile.__v;

    res.json({ user: profile });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// BLOCK USER
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId.toString()) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add to blocked list
    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { blockedUsers: userId },
      $pull: { friends: userId },
    });

    // Remove from target's friends list
    await User.findByIdAndUpdate(userId, {
      $pull: { friends: req.userId },
    });

    res.json({ message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Block failed' });
  }
};

// UNBLOCK USER
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await User.findByIdAndUpdate(req.userId, {
      $pull: { blockedUsers: userId },
    });

    res.json({ message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Unblock failed' });
  }
};

// GET BLOCKED USERS
export const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('blockedUsers', 'username displayName avatar');
    res.json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
};
