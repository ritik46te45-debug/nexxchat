import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// CREATE OR GET PRIVATE CONVERSATION
export const getOrCreateConversation = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId.toString()) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }

    // Check if blocked
    const currentUser = await User.findById(req.userId);
    if (currentUser.blockedUsers.includes(userId)) {
      return res.status(403).json({ error: 'User is blocked' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetUser.blockedUsers.includes(req.userId)) {
      return res.status(403).json({ error: 'Cannot start conversation' });
    }

    // Find existing conversation
    let conversation = await Conversation.findPrivateConversation(req.userId, userId);

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'private',
        participants: [
          { user: req.userId, role: 'member' },
          { user: userId, role: 'member' },
        ],
        createdBy: req.userId,
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants.user', 'username displayName avatar isOnline lastSeen about userCode privacy friends')
        .populate('lastMessage');
    }

    res.json({ conversation });
  } catch (error) {
    console.error('Get/create conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
};

// GET ALL CONVERSATIONS
export const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const conversations = await Conversation.find({
      'participants.user': req.userId,
      'participants.isDeleted': { $ne: true },
    })
      .populate('participants.user', 'username displayName avatar isOnline lastSeen about userCode privacy friends')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username displayName' },
      })
      .sort({ lastMessageAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Filter out conversations where participant deleted
    const filtered = conversations.map(conv => {
      const participant = conv.getParticipant(req.userId);
      return {
        ...conv.toObject(),
        _participant: participant,
      };
    }).filter(conv => !conv._participant?.isDeleted);

    res.json({ conversations: filtered });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};

// GET SINGLE CONVERSATION
export const getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    })
      .populate('participants.user', 'username displayName avatar isOnline lastSeen about')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username displayName' },
      })
      .populate({
        path: 'pinnedMessages.message',
        populate: { path: 'sender', select: 'username displayName' },
      });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
};

// UPDATE CONVERSATION (mute, pin, archive)
export const updateConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { isMuted, isPinned, isArchived, draft, mutedUntil } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const participantIndex = conversation.participants.findIndex(
      p => p.user.toString() === req.userId.toString()
    );

    if (isMuted !== undefined) conversation.participants[participantIndex].isMuted = isMuted;
    if (mutedUntil !== undefined) conversation.participants[participantIndex].mutedUntil = mutedUntil;
    if (isPinned !== undefined) conversation.participants[participantIndex].isPinned = isPinned;
    if (isArchived !== undefined) conversation.participants[participantIndex].isArchived = isArchived;
    if (draft !== undefined) conversation.participants[participantIndex].draft = draft;

    await conversation.save();

    res.json({ message: 'Conversation updated', conversation });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

// CLEAR CONVERSATION
export const clearConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Add userId to deletedFor for all messages
    await Message.updateMany(
      { conversation: conversationId },
      { $addToSet: { deletedFor: req.userId } }
    );

    res.json({ message: 'Conversation cleared' });
  } catch (error) {
    console.error('Clear conversation error:', error);
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
};

// DELETE CONVERSATION (soft delete for user)
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const participantIndex = conversation.participants.findIndex(
      p => p.user.toString() === req.userId.toString()
    );

    conversation.participants[participantIndex].isDeleted = true;
    conversation.participants[participantIndex].deletedAt = new Date();
    await conversation.save();

    res.json({ message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};


// CREATE GROUP CONVERSATION
export const createGroup = async (req, res) => {
  try {
    const { groupName, groupDescription, memberIds, groupAvatar, groupSettings } = req.body;

    if (!groupName || groupName.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const participants = [
      { user: req.userId, role: 'owner' },
      ...(memberIds || [])
        .filter(id => id.toString() !== req.userId.toString())
        .map(id => ({ user: id, role: 'member' }))
    ];

    const group = await Conversation.create({
      type: 'group',
      groupName: groupName.trim(),
      groupDescription: groupDescription || '',
      groupAvatar: groupAvatar || { url: '', publicId: '' },
      groupSettings: groupSettings || {},
      participants,
      createdBy: req.userId,
    });

    const populatedGroup = await Conversation.findById(group._id)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen')
      .populate('createdBy', 'username displayName avatar');

    // Create system message
    const systemMsg = await Message.create({
      conversation: group._id,
      sender: req.userId,
      type: 'system',
      content: `${req.user.displayName} created group "${groupName}"`,
    });

    populatedGroup.lastMessage = systemMsg._id;
    await populatedGroup.save();

    // Broadcast to all participants via socket
    const io = req.app.get('io');
    participants.forEach(p => {
      io.to(p.user.toString()).emit('conversation:new', {
        conversation: populatedGroup
      });
    });

    res.status(201).json({ group: populatedGroup });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

// UPDATE GROUP INFO
export const updateGroupInfo = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { groupName, groupDescription, groupAvatar, groupSettings } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: 'group',
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    const participant = conversation.getParticipant(req.userId);
    if (conversation.groupSettings?.onlyAdminsCanEditInfo && !['admin', 'owner'].includes(participant?.role)) {
      return res.status(403).json({ error: 'Only admins can edit group info' });
    }

    if (groupName) conversation.groupName = groupName.trim();
    if (groupDescription !== undefined) conversation.groupDescription = groupDescription;
    if (groupAvatar) conversation.groupAvatar = groupAvatar;
    if (groupSettings) conversation.groupSettings = { ...conversation.groupSettings, ...groupSettings };

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen');

    const io = req.app.get('io');
    conversation.participants.forEach(p => {
      io.to(p.user.toString()).emit('group:updated', { conversation: populated });
    });

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Update group info error:', error);
    res.status(500).json({ error: 'Failed to update group info' });
  }
};

// ADD GROUP MEMBERS
export const addGroupMembers = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { memberIds } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: 'group',
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const participant = conversation.getParticipant(req.userId);
    if (conversation.groupSettings?.onlyAdminsCanAddMembers && !['admin', 'owner'].includes(participant?.role)) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    const currentMemberIds = conversation.participants.map(p => p.user.toString());
    const newMembers = (memberIds || [])
      .filter(id => !currentMemberIds.includes(id.toString()))
      .map(id => ({ user: id, role: 'member' }));

    if (newMembers.length === 0) {
      return res.status(400).json({ error: 'No new members to add' });
    }

    conversation.participants.push(...newMembers);
    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen');

    const io = req.app.get('io');
    populated.participants.forEach(p => {
      io.to(p.user._id.toString()).emit('group:members_added', {
        conversation: populated,
        addedBy: req.user.displayName,
      });
    });

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Add group members error:', error);
    res.status(500).json({ error: 'Failed to add group members' });
  }
};

// REMOVE GROUP MEMBER / LEAVE GROUP
export const removeGroupMember = async (req, res) => {
  try {
    const { conversationId, memberId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: 'group',
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isSelf = memberId.toString() === req.userId.toString();
    const currentParticipant = conversation.getParticipant(req.userId);

    // If removing someone else, must be admin or owner
    if (!isSelf && !['admin', 'owner'].includes(currentParticipant?.role)) {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    conversation.participants = conversation.participants.filter(
      p => p.user.toString() !== memberId.toString()
    );

    // If owner leaves and other members remain, assign new owner
    if (currentParticipant?.role === 'owner' && isSelf && conversation.participants.length > 0) {
      const nextAdmin = conversation.participants.find(p => p.role === 'admin') || conversation.participants[0];
      nextAdmin.role = 'owner';
    }

    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen');

    const io = req.app.get('io');
    if (populated) {
      populated.participants.forEach(p => {
        io.to(p.user._id.toString()).emit('group:member_removed', {
          conversation: populated,
          removedMemberId: memberId,
        });
      });
    }

    io.to(memberId.toString()).emit('group:left', { conversationId });

    res.json({ message: 'Member removed successfully', conversation: populated });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// CHANGE MEMBER ROLE
export const changeMemberRole = async (req, res) => {
  try {
    const { conversationId, memberId } = req.params;
    const { role } = req.body; // 'admin' or 'member'

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: 'group',
      'participants.user': req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const currentParticipant = conversation.getParticipant(req.userId);
    if (currentParticipant?.role !== 'owner') {
      return res.status(403).json({ error: 'Only group owner can change member roles' });
    }

    const targetIndex = conversation.participants.findIndex(
      p => p.user.toString() === memberId.toString()
    );

    if (targetIndex === -1) {
      return res.status(404).json({ error: 'Member not in group' });
    }

    conversation.participants[targetIndex].role = role;
    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen');

    const io = req.app.get('io');
    populated.participants.forEach(p => {
      io.to(p.user._id.toString()).emit('group:role_changed', { conversation: populated });
    });

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ error: 'Failed to change member role' });
  }
};

// UPDATE DISAPPEARING MESSAGES TIMER
export const updateDisappearingTimer = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { duration } = req.body; // 0 (off), 86400 (24h), 604800 (7d), 2592000 (30d), 7776000 (90d)

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isMember = conversation.participants.some(
      p => p.user.toString() === req.userId.toString() && !p.isDeleted
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const durNum = parseInt(duration) || 0;
    conversation.disappearingMessages = {
      enabled: durNum > 0,
      duration: durNum,
    };
    await conversation.save();

    const populated = await Conversation.findById(conversationId)
      .populate('participants.user', 'username displayName avatar isOnline lastSeen about userCode privacy friends')
      .populate('lastMessage');

    const io = req.app.get('io');
    if (io) {
      populated.participants.forEach(p => {
        const uId = (p.user?._id || p.user)?.toString();
        if (uId) {
          io.to(uId).emit('conversation:disappearingTimer', {
            conversationId,
            disappearingMessages: conversation.disappearingMessages,
            conversation: populated,
          });
        }
      });
    }

    res.json({
      message: 'Disappearing timer updated',
      disappearingMessages: conversation.disappearingMessages,
      conversation: populated,
    });
  } catch (error) {
    console.error('Update disappearing timer error:', error);
    res.status(500).json({ error: 'Failed to update disappearing timer' });
  }
};

