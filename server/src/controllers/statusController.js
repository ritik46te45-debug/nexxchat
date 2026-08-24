import Status from '../models/Status.js';
import User from '../models/User.js';

// Create new status (text, image, video)
export const createStatus = async (req, res) => {
  try {
    const { type, content, media, backgroundColor, fontStyle, emoji, visibility, allowedUsers, excludedUsers } = req.body;

    if (!type || !['text', 'image', 'video'].includes(type)) {
      return res.status(400).json({ error: 'Valid status type is required (text, image, video)' });
    }

    if (type === 'text' && !content) {
      return res.status(400).json({ error: 'Text content is required for text status' });
    }

    if ((type === 'image' || type === 'video') && (!media || !media.url)) {
      return res.status(400).json({ error: 'Media URL is required for media status' });
    }

    const newStatus = await Status.create({
      user: req.userId,
      type,
      content: content || '',
      media: media || {},
      backgroundColor: backgroundColor || '#1a1a2e',
      fontStyle: fontStyle || 'default',
      emoji: emoji || '',
      visibility: visibility || 'friends',
      allowedUsers: allowedUsers || [],
      excludedUsers: excludedUsers || [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    const populatedStatus = await Status.findById(newStatus._id)
      .populate('user', 'username displayName avatar isOnline');

    // Notify online friends via socket
    const io = req.app.get('io');
    const user = await User.findById(req.userId);
    if (user?.friends) {
      user.friends.forEach(friendId => {
        io.to(friendId.toString()).emit('status:new', {
          status: populatedStatus,
          user: {
            _id: user._id,
            displayName: user.displayName,
            avatar: user.avatar,
          }
        });
      });
    }

    res.status(201).json({ status: populatedStatus });
  } catch (error) {
    console.error('Create status error:', error);
    res.status(500).json({ error: 'Failed to create status' });
  }
};

// Get statuses from user and friends
export const getFeedStatuses = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const friendIds = user?.friends || [];
    const validUserIds = [req.userId, ...friendIds];

    const now = new Date();

    const statuses = await Status.find({
      user: { $in: validUserIds },
      expiresAt: { $gt: now },
      $or: [
        { user: req.userId },
        { visibility: 'everyone' },
        { visibility: 'friends', excludedUsers: { $ne: req.userId } },
        { visibility: 'custom', allowedUsers: req.userId }
      ]
    })
      .populate('user', 'username displayName avatar isOnline lastSeen')
      .populate('viewers.user', 'username displayName avatar')
      .sort({ createdAt: -1 });

    // Group statuses by user
    const grouped = {};
    statuses.forEach(st => {
      const uId = st.user._id.toString();
      if (!grouped[uId]) {
        grouped[uId] = {
          user: st.user,
          isSelf: uId === req.userId.toString(),
          statuses: [],
        };
      }
      grouped[uId].statuses.push(st);
    });

    res.json({ feeds: Object.values(grouped) });
  } catch (error) {
    console.error('Get statuses error:', error);
    res.status(500).json({ error: 'Failed to fetch status updates' });
  }
};

// View a status (record viewer)
export const viewStatus = async (req, res) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({ error: 'Status not found or expired' });
    }

    const currentUserId = req.userId.toString();
    const statusOwnerId = status.user.toString();

    // Don't record self view
    if (statusOwnerId !== currentUserId) {
      const alreadyViewed = status.viewers.some(v => {
        const viewerId = (v.user?._id || v.user || v)?.toString();
        return viewerId === currentUserId;
      });

      if (!alreadyViewed) {
        status.viewers.push({
          user: req.userId,
          viewedAt: new Date()
        });
        await status.save();

        // Notify status owner
        const io = req.app.get('io');
        const owner = await User.findById(status.user);
        (owner?.socketIds || []).forEach(sid => {
          io.to(sid).emit('status:viewed', {
            statusId: status._id,
            viewer: {
              _id: req.user._id,
              displayName: req.user.displayName,
              avatar: req.user.avatar,
              viewedAt: new Date()
            }
          });
        });
      }
    }

    res.json({ message: 'Status viewed', status });
  } catch (error) {
    console.error('View status error:', error);
    res.status(500).json({ error: 'Failed to record status view' });
  }
};

// React to a status
export const reactToStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({ error: 'Status not found' });
    }

    status.reactions.push({
      user: req.userId,
      emoji,
      createdAt: new Date()
    });
    await status.save();

    const io = req.app.get('io');
    io.to(status.user.toString()).emit('status:reaction', {
      statusId: status._id,
      user: {
        _id: req.user._id,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      },
      emoji
    });

    res.json({ message: 'Reaction added', reactions: status.reactions });
  } catch (error) {
    console.error('React status error:', error);
    res.status(500).json({ error: 'Failed to react to status' });
  }
};

// Delete status
export const deleteStatus = async (req, res) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findOneAndDelete({ _id: statusId, user: req.userId });
    if (!status) {
      return res.status(404).json({ error: 'Status not found or unauthorized' });
    }

    res.json({ message: 'Status deleted successfully' });
  } catch (error) {
    console.error('Delete status error:', error);
    res.status(500).json({ error: 'Failed to delete status' });
  }
};
