import { validationResult, body, param, query } from 'express-validator';

// Handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Auth validators
export const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('displayName')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Display name is required (max 50 chars)'),
  handleValidationErrors,
];

export const validateLogin = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

// Message validators
export const validateMessage = [
  body('content')
    .optional()
    .isLength({ max: 10000 }).withMessage('Message too long (max 10000 chars)'),
  body('type')
    .optional()
    .isIn(['text', 'image', 'video', 'audio', 'voice', 'document', 'file', 'gif', 'sticker', 'location', 'contact', 'poll', 'link', 'forwarded'])
    .withMessage('Invalid message type'),
  handleValidationErrors,
];

// Mongo ID validator
export const validateMongoId = (paramName = 'id') => [
  param(paramName).isMongoId().withMessage('Invalid ID format'),
  handleValidationErrors,
];

// Pagination validator
export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  handleValidationErrors,
];
