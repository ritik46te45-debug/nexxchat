import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import Notification from '../models/Notification.js';

// SEND FRIEND REQUEST
export const sendFriendRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    if (userId === req.userId.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.isBanned) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if blocked
    const isTargetBlocked = targetUser.blockedUsers?.some(id => (id?._id || id)?.toString() === req.userId.toString());
    const isUserBlocked = req.user.blockedUsers?.some(id => (id?._id || id)?.toString() === userId.toString());
    if (isTargetBlocked || isUserBlocked) {
      return res.status(403).json({ error: 'Cannot send friend request' });
    }

    // Check if already friends
    const isAlreadyFriend = req.user.friends?.some(id => (id?._id || id)?.toString() === userId.toString());
    if (isAlreadyFriend) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Check for existing incoming request
    const existingIncoming = await FriendRequest.findOne({ from: userId, to: req.userId, status: 'pending' });
    if (existingIncoming) {
      return res.status(400).json({ error: 'This user has already sent you a friend request' });
    }

    // Check for existing outgoing request
    const existingOutgoing = await FriendRequest.findOne({ from: req.userId, to: userId, status: 'pending' });
    if (existingOutgoing) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Upsert or reactivate: if a previous rejected/cancelled request exists between them, re-activate it
    let friendRequest = await FriendRequest.findOne({ from: req.userId, to: userId });
    if (friendRequest) {
      friendRequest.status = 'pending';
      friendRequest.message = message || '';
      await friendRequest.save();
    } else {
      friendRequest = await FriendRequest.create({
        from: req.userId,
        to: userId,
        message: message || '',
      });
    }

    await friendRequest.populate('from', 'username displayName avatar isOnline');
    await friendRequest.populate('to', 'username displayName avatar isOnline');

    // Create notification
    const notif = await Notification.create({
      recipient: userId,
      sender: req.userId,
      type: 'friend_request',
      title: 'New Friend Request',
      body: `${req.user.displayName} sent you a friend request`,
      data: { friendRequestId: friendRequest._id },
    });

    // Emit socket event directly to recipient room
    const io = req.app.get('io');
    if (io) {
      const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });
      io.to(userId.toString()).to(`user:${userId.toString()}`).emit('notification:count', { count: unreadCount });
      io.to(userId.toString()).to(`user:${userId.toString()}`).emit('notification:new', notif);
      io.to(userId.toString()).to(`user:${userId.toString()}`).emit('friend:request', {
        request: friendRequest,
        from: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName,
          avatar: req.user.avatar,
        },
      });
    }

    res.status(201).json({ message: 'Friend request sent', request: friendRequest });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
};

// ACCEPT FRIEND REQUEST
export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findOne({
      _id: requestId,
      to: req.userId,
      status: 'pending',
    });

    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add each other as friends
    await User.findByIdAndUpdate(req.userId, { $addToSet: { friends: friendRequest.from } });
    await User.findByIdAndUpdate(friendRequest.from, { $addToSet: { friends: req.userId } });

    // Create notification
    const notif = await Notification.create({
      recipient: friendRequest.from,
      sender: req.userId,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      body: `${req.user.displayName} accepted your friend request`,
    });

    // Emit socket event directly to sender room
    const io = req.app.get('io');
    if (io) {
      const fromIdStr = friendRequest.from.toString();
      const unreadCount = await Notification.countDocuments({ recipient: friendRequest.from, isRead: false });
      io.to(fromIdStr).to(`user:${fromIdStr}`).emit('notification:count', { count: unreadCount });
      io.to(fromIdStr).to(`user:${fromIdStr}`).emit('notification:new', notif);
      io.to(fromIdStr).to(`user:${fromIdStr}`).emit('friend:accepted', {
        request: friendRequest,
        user: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName,
          avatar: req.user.avatar,
          isOnline: req.user.isOnline,
        },
      });
    }

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
};

// REJECT FRIEND REQUEST
export const rejectFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findOneAndUpdate(
      { _id: requestId, to: req.userId, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );

    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
};

// CANCEL FRIEND REQUEST
export const cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findOneAndUpdate(
      { _id: requestId, from: req.userId, status: 'pending' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!friendRequest) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    res.json({ message: 'Friend request cancelled' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
};

// GET PENDING REQUESTS (received)
export const getPendingRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.userId, status: 'pending' })
      .populate('from', 'username displayName avatar isOnline')
      .sort({ createdAt: -1 });

    // Filter out requests from users that were deleted from database
    const validRequests = requests.filter(
      (r) => r && r.from && r.from._id && (r.from.displayName || r.from.username)
    );

    // Clean up orphaned requests
    const orphaned = requests.filter((r) => !r.from || !r.from._id).map((r) => r._id);
    if (orphaned.length > 0) {
      FriendRequest.deleteMany({ _id: { $in: orphaned } }).catch(console.error);
    }

    res.json({ requests: validRequests });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Failed to get requests' });
  }
};

// GET SENT REQUESTS
export const getSentRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({ from: req.userId, status: 'pending' })
      .populate('to', 'username displayName avatar isOnline')
      .sort({ createdAt: -1 });

    // Filter out requests to users that were deleted from database
    const validRequests = requests.filter(
      (r) => r && r.to && r.to._id && (r.to.displayName || r.to.username)
    );

    // Clean up orphaned requests
    const orphaned = requests.filter((r) => !r.to || !r.to._id).map((r) => r._id);
    if (orphaned.length > 0) {
      FriendRequest.deleteMany({ _id: { $in: orphaned } }).catch(console.error);
    }

    res.json({ requests: validRequests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Failed to get requests' });
  }
};

// GET FRIENDS LIST
export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'username displayName avatar isOnline lastSeen about userCode privacy friends');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter out friends that were deleted from the database
    const validFriends = (user.friends || []).filter(
      (f) => f && f._id && (f.displayName || f.username)
    );

    // If any friends were deleted from MongoDB, clean up User.friends array
    if (validFriends.length !== (user.friends || []).length) {
      const validFriendIds = validFriends.map((f) => f._id);
      User.findByIdAndUpdate(req.userId, { friends: validFriendIds }).catch(console.error);
    }

    // Sort friends: online first, then alphabetical A-Z by name
    validFriends.sort((a, b) => {
      const aOnline = a.isOnline ? 1 : 0;
      const bOnline = b.isOnline ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;

      const aName = (a.displayName || a.username || '').toLowerCase();
      const bName = (b.displayName || b.username || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    res.json({ friends: validFriends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
};

// UNFRIEND
export const unfriend = async (req, res) => {
  try {
    const { userId } = req.params;

    await User.findByIdAndUpdate(req.userId, { $pull: { friends: userId } });
    await User.findByIdAndUpdate(userId, { $pull: { friends: req.userId } });

    res.json({ message: 'Unfriended successfully' });
  } catch (error) {
    console.error('Unfriend error:', error);
    res.status(500).json({ error: 'Failed to unfriend' });
  }
};
