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
    if (targetUser.blockedUsers.includes(req.userId) || req.user.blockedUsers.includes(userId)) {
      return res.status(403).json({ error: 'Cannot send friend request' });
    }

    // Check if already friends
    if (req.user.friends.includes(userId)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    // Check for existing request
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { from: req.userId, to: userId, status: 'pending' },
        { from: userId, to: req.userId, status: 'pending' },
      ],
    });

    if (existingRequest) {
      if (existingRequest.from.toString() === userId) {
        return res.status(400).json({ error: 'This user has already sent you a friend request' });
      }
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    const friendRequest = await FriendRequest.create({
      from: req.userId,
      to: userId,
      message: message || '',
    });

    // Create notification
    await Notification.create({
      recipient: userId,
      sender: req.userId,
      type: 'friend_request',
      title: 'New Friend Request',
      body: `${req.user.displayName} sent you a friend request`,
      data: { friendRequestId: friendRequest._id },
    });

    // Emit socket event
    const io = req.app.get('io');
    const targetSocketIds = targetUser.socketIds || [];
    targetSocketIds.forEach(socketId => {
      io.to(socketId).emit('friend:request', {
        request: friendRequest,
        from: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName,
          avatar: req.user.avatar,
        },
      });
    });

    res.status(201).json({ message: 'Friend request sent', request: friendRequest });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }
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
    await Notification.create({
      recipient: friendRequest.from,
      sender: req.userId,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      body: `${req.user.displayName} accepted your friend request`,
    });

    // Emit socket event
    const io = req.app.get('io');
    const fromUser = await User.findById(friendRequest.from);
    const fromSocketIds = fromUser?.socketIds || [];
    fromSocketIds.forEach(socketId => {
      io.to(socketId).emit('friend:accepted', {
        request: friendRequest,
        user: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName,
          avatar: req.user.avatar,
          isOnline: req.user.isOnline,
        },
      });
    });

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

    res.json({ requests });
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

    res.json({ requests });
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

    res.json({ friends: user.friends });
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
