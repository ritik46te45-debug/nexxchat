import Call from '../models/Call.js';

// Get call history
export const getCallHistory = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;

    const calls = await Call.find({
      $or: [{ caller: req.userId }, { receiver: req.userId }]
    })
      .populate('caller', 'username displayName avatar isOnline')
      .populate('receiver', 'username displayName avatar isOnline')
      .populate('conversation', 'type groupName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Call.countDocuments({
      $or: [{ caller: req.userId }, { receiver: req.userId }]
    });

    res.json({ calls, total });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
};

// Clear call history
export const clearCallHistory = async (req, res) => {
  try {
    // Delete calls where user is caller or receiver
    await Call.deleteMany({
      $or: [{ caller: req.userId }, { receiver: req.userId }]
    });

    res.json({ message: 'Call history cleared' });
  } catch (error) {
    console.error('Clear call history error:', error);
    res.status(500).json({ error: 'Failed to clear call history' });
  }
};
