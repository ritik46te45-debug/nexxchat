import crypto from 'crypto';

const getAckSecret = () => process.env.JWT_SECRET || 'nexchat-ack-secret';

export const signDeliveryAck = (messageId, recipientId) => {
  if (!messageId || !recipientId) return '';
  return crypto
    .createHmac('sha256', getAckSecret())
    .update(`${messageId.toString()}:${recipientId.toString()}`)
    .digest('hex');
};

export const verifyDeliveryAck = (messageId, recipientId, token) => {
  if (!messageId || !recipientId || typeof token !== 'string' || !token) return false;
  const expected = signDeliveryAck(messageId, recipientId);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
};
