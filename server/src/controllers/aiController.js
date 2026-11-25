import AIConversation from '../models/AIConversation.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import cloudinary from '../config/cloudinary.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const TEXT_MODELS = [
  process.env.GEMINI_TEXT_MODEL,
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
].filter(Boolean);

const IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
].filter(Boolean);

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are NexChat AI, a helpful, intelligent, and concise assistant built into the NexChat messenger app. ' +
  'Format responses clearly with Markdown (headings, bullet lists, and fenced code blocks with language tags when showing code).';

const getApiKey = () => process.env.GEMINI_API_KEY || '';

const hasCloudinary = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    !String(process.env.CLOUDINARY_CLOUD_NAME).includes('your-')
  );

/**
 * Convert stored AI thread messages into Gemini `contents` format.
 * Caps history to the latest 16 turns to keep latency and token usage tight.
 */
const buildGeminiContents = (historyMessages, latestUserPrompt) => {
  const recent = (historyMessages || []).slice(-16);
  const contents = [];

  for (const msg of recent) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = msg.isImage
      ? `[Generated image for prompt: ${msg.promptUsed || msg.content || 'image'}]`
      : (msg.content || '').trim();
    if (!text) continue;

    // Gemini requires alternating user/model turns; merge consecutive same-role entries if needed
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += `\n\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (latestUserPrompt) {
    const prev = contents[contents.length - 1];
    if (prev && prev.role === 'user') {
      prev.parts[0].text += `\n\n${latestUserPrompt}`;
    } else {
      contents.push({ role: 'user', parts: [{ text: latestUserPrompt }] });
    }
  }

  return contents;
};

/**
 * Call Gemini non-streaming generateContent across fallback models on 404/429/503.
 */
const callGeminiWithFallback = async (models, payload, timeoutMs = 45000) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured on the server.');
    err.status = 503;
    throw err;
  }

  let lastError = null;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { model, data };
      }

      const msg = data?.error?.message || `Gemini returned status ${res.status}`;
      lastError = new Error(msg);
      lastError.status = res.status;
      lastError.code = data?.error?.status;

      // Retry next fallback model on transient overload, missing/retired model, or quota errors
      if ([404, 429, 500, 502, 503, 504].includes(res.status)) {
        continue;
      }
      throw lastError;
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error('AI request timed out. Please try again.');
        lastError.status = 504;
        continue;
      }
      lastError = err;
      if (err.status && ![404, 429, 500, 502, 503, 504].includes(err.status)) {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All AI models are currently unavailable.');
};

/**
 * Open an SSE stream from Gemini `:streamGenerateContent?alt=sse` with model fallback.
 */
const openGeminiStreamWithFallback = async (models, payload, timeoutMs = 45000) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured on the server.');
    err.status = 503;
    throw err;
  }

  let lastError = null;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (res.ok && res.body) {
        return { model, response: res };
      }

      const errBody = await res.json().catch(() => ({}));
      lastError = new Error(errBody?.error?.message || `Gemini stream error (${res.status})`);
      lastError.status = res.status;
      if ([404, 429, 500, 502, 503, 504].includes(res.status)) {
        continue;
      }
      throw lastError;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err.status && ![404, 429, 500, 502, 503, 504].includes(err.status)) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Unable to connect to Gemini streaming API.');
};

const extractTextFromCandidate = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
};

const buildThreadTitle = (prompt) => {
  const clean = (prompt || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New AI Chat';
  return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
};

const uploadGeneratedImageIfConfigured = async (base64Data, mimeType) => {
  const dataUri = `data:${mimeType};base64,${base64Data}`;
  if (!hasCloudinary()) return dataUri;
  try {
    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: 'nexchat/ai-generated',
      resource_type: 'image',
    });
    return uploaded.secure_url || dataUri;
  } catch (err) {
    console.warn('[AI] Cloudinary upload skipped, returning inline image:', err.message);
    return dataUri;
  }
};

// GET ALL AI THREADS FOR CURRENT USER
export const getThreads = async (req, res) => {
  try {
    const threads = await AIConversation.find({ user: req.userId })
      .select('_id title model createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json({ threads });
  } catch (error) {
    console.error('[AI] getThreads error:', error);
    res.status(500).json({ error: 'Failed to load AI conversations' });
  }
};

// GET SINGLE AI THREAD WITH MESSAGES
export const getThread = async (req, res) => {
  try {
    const thread = await AIConversation.findOne({
      _id: req.params.threadId,
      user: req.userId,
    }).lean();
    if (!thread) {
      return res.status(404).json({ error: 'AI conversation not found' });
    }
    res.json({ thread });
  } catch (error) {
    console.error('[AI] getThread error:', error);
    res.status(500).json({ error: 'Failed to load AI conversation' });
  }
};

// DELETE AI THREAD
export const deleteThread = async (req, res) => {
  try {
    const deleted = await AIConversation.findOneAndDelete({
      _id: req.params.threadId,
      user: req.userId,
    });
    if (!deleted) {
      return res.status(404).json({ error: 'AI conversation not found' });
    }
    res.json({ message: 'AI conversation deleted' });
  } catch (error) {
    console.error('[AI] deleteThread error:', error);
    res.status(500).json({ error: 'Failed to delete AI conversation' });
  }
};

// CHATGPT-STYLE STREAMING CHAT (SSE)
export const chatStream = async (req, res) => {
  try {
    const { threadId, message, regenerate } = req.body;
    const trimmed = (message || '').trim();

    if (!trimmed && !regenerate) {
      return res.status(400).json({ error: 'Message prompt is required' });
    }

    let thread = null;
    if (threadId) {
      thread = await AIConversation.findOne({ _id: threadId, user: req.userId });
      if (!thread) {
        return res.status(404).json({ error: 'AI conversation not found' });
      }
    } else {
      thread = await AIConversation.create({
        user: req.userId,
        title: buildThreadTitle(trimmed),
        messages: [],
      });
    }

    let promptToUse = trimmed;
    if (regenerate && thread.messages.length > 0) {
      // Drop the trailing assistant message so we regenerate from the last user prompt
      if (thread.messages[thread.messages.length - 1]?.role === 'assistant') {
        thread.messages.pop();
      }
      const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) {
        return res.status(400).json({ error: 'No user prompt found to regenerate' });
      }
      promptToUse = '';
    } else {
      thread.messages.push({ role: 'user', content: trimmed });
      if (thread.messages.length === 1 || thread.title === 'New AI Chat') {
        thread.title = buildThreadTitle(trimmed);
      }
    }

    const contents = buildGeminiContents(
      promptToUse ? thread.messages.slice(0, -1) : thread.messages,
      promptToUse
    );

    const payload = {
      systemInstruction: { parts: [{ text: DEFAULT_SYSTEM_INSTRUCTION }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    };

    const { model, response } = await openGeminiStreamWithFallback(TEXT_MODELS, payload);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    sendEvent({ meta: { threadId: thread._id.toString(), title: thread.title, model } });

    let fullText = '';
    let buffer = '';
    const decoder = new TextDecoder();

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const rawJson = line.slice(5).trim();
        if (!rawJson || rawJson === '[DONE]') continue;
        try {
          const parsed = JSON.parse(rawJson);
          const delta = extractTextFromCandidate(parsed);
          if (delta) {
            fullText += delta;
            sendEvent({ delta });
          }
        } catch {
          // Ignore partial SSE JSON fragments
        }
      }
    }

    if (!fullText) {
      fullText = 'I could not generate a response. Please try again.';
      sendEvent({ delta: fullText });
    }

    thread.model = model;
    thread.messages.push({
      role: 'assistant',
      content: fullText,
      modelUsed: model,
    });
    await thread.save();

    sendEvent({
      done: true,
      threadId: thread._id.toString(),
      title: thread.title,
      model,
      messageId: thread.messages[thread.messages.length - 1]._id.toString(),
    });
    res.end();
  } catch (error) {
    console.error('[AI] chatStream error:', error);
    if (!res.headersSent) {
      return res.status(error.status || 500).json({ error: error.message || 'AI request failed' });
    }
    res.write(`data: ${JSON.stringify({ error: error.message || 'Stream interrupted' })}\n\n`);
    res.end();
  }
};

// NON-STREAMING CHAT FALLBACK
export const chat = async (req, res) => {
  try {
    const { threadId, message } = req.body;
    const trimmed = (message || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Message prompt is required' });
    }

    let thread = threadId
      ? await AIConversation.findOne({ _id: threadId, user: req.userId })
      : null;

    if (threadId && !thread) {
      return res.status(404).json({ error: 'AI conversation not found' });
    }
    if (!thread) {
      thread = await AIConversation.create({
        user: req.userId,
        title: buildThreadTitle(trimmed),
        messages: [],
      });
    }

    thread.messages.push({ role: 'user', content: trimmed });
    if (thread.messages.length === 1 || thread.title === 'New AI Chat') {
      thread.title = buildThreadTitle(trimmed);
    }

    const contents = buildGeminiContents(thread.messages.slice(0, -1), trimmed);
    const { model, data } = await callGeminiWithFallback(TEXT_MODELS, {
      systemInstruction: { parts: [{ text: DEFAULT_SYSTEM_INSTRUCTION }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    });

    const reply = extractTextFromCandidate(data) || 'No response generated.';
    thread.model = model;
    thread.messages.push({ role: 'assistant', content: reply, modelUsed: model });
    await thread.save();

    res.json({
      threadId: thread._id,
      title: thread.title,
      model,
      reply,
      thread,
    });
  } catch (error) {
    console.error('[AI] chat error:', error);
    res.status(error.status || 500).json({ error: error.message || 'AI chat failed' });
  }
};

// IMAGE GENERATION ENDPOINT
export const generateImage = async (req, res) => {
  try {
    const { prompt, threadId } = req.body;
    const trimmed = (prompt || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Image prompt is required' });
    }

    let thread = null;
    if (threadId) {
      thread = await AIConversation.findOne({ _id: threadId, user: req.userId });
      if (!thread) return res.status(404).json({ error: 'AI conversation not found' });
    } else {
      thread = await AIConversation.create({
        user: req.userId,
        title: `Image: ${buildThreadTitle(trimmed)}`,
        messages: [],
      });
    }

    const { model, data } = await callGeminiWithFallback(
      IMAGE_MODELS,
      {
        contents: [{ parts: [{ text: trimmed }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      60000
    );

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    const textPart = parts.map((p) => p.text || '').join('').trim();

    if (!imagePart?.inlineData?.data) {
      return res.status(502).json({
        error: textPart || 'The model did not return an image. Please refine your prompt.',
      });
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const imageUrl = await uploadGeneratedImageIfConfigured(imagePart.inlineData.data, mimeType);

    thread.messages.push({ role: 'user', content: `Generate image: ${trimmed}` });
    thread.messages.push({
      role: 'assistant',
      content: textPart || `Generated image for: "${trimmed}"`,
      imageUrl,
      isImage: true,
      promptUsed: trimmed,
      modelUsed: model,
    });
    await thread.save();

    res.json({
      threadId: thread._id,
      title: thread.title,
      model,
      imageUrl,
      caption: textPart || `Generated image for "${trimmed}"`,
      message: thread.messages[thread.messages.length - 1],
    });
  } catch (error) {
    console.error('[AI] generateImage error:', error);
    if (error.status === 429) {
      return res.status(429).json({
        code: 'IMAGE_QUOTA_EXCEEDED',
        error:
          'Gemini Image Generation requires billing/paid quota on your Google AI Studio API key (free-tier image quota is 0). Chat and summarization remain available.',
      });
    }
    res.status(error.status || 500).json({ error: error.message || 'Image generation failed' });
  }
};

// SUMMARIZE USER CONVERSATION CHATS
export const summarizeConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 60, focus = 'full', saveToThread = false } = req.body || {};

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
    }).populate('participants.user', 'displayName username');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    if (conversation.isSecret) {
      return res.status(400).json({
        error: 'Secret End-to-End Encrypted chats cannot be sent to server-side AI summarization to preserve privacy.',
      });
    }

    const parsedLimit = Math.min(Math.max(10, parseInt(limit, 10) || 60), 120);
    const recentMessages = await Message.find({
      conversation: conversationId,
      deletedFor: { $ne: req.userId },
      isDeletedForEveryone: false,
      isEncrypted: { $ne: true },
    })
      .populate('sender', 'displayName username')
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .lean();

    if (!recentMessages.length) {
      return res.status(400).json({ error: 'No messages available to summarize in this conversation.' });
    }

    const chronological = [...recentMessages].reverse();
    const transcriptLines = chronological.map((m) => {
      const senderName = m.sender?.displayName || m.sender?.username || 'User';
      const timeStr = new Date(m.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      if (m.type === 'poll' && m.poll?.question) {
        return `[${timeStr}] ${senderName} created poll: "${m.poll.question}"`;
      }
      if (m.attachments?.length) {
        const mediaTypes = m.attachments.map((a) => a.type || 'file').join(', ');
        const caption = m.content ? ` — "${m.content}"` : '';
        return `[${timeStr}] ${senderName} shared [${mediaTypes}]${caption}`;
      }
      return `[${timeStr}] ${senderName}: ${m.content || `[${m.type}]`}`;
    });

    const otherParticipant = conversation.participants.find(
      (p) => (p.user?._id || p.user)?.toString() !== req.userId.toString()
    );
    const conversationName =
      conversation.type === 'group'
        ? conversation.groupName || 'Group Chat'
        : otherParticipant?.user?.displayName || otherParticipant?.user?.username || 'Direct Chat';

    const focusGuidance = {
      action_items: 'Focus especially on action items, tasks, deadlines, and open questions.',
      decisions: 'Focus especially on key agreements, decisions made, and unresolved topics.',
      brief: 'Keep it ultra-concise (3-5 bullet points max).',
      full: 'Provide a clear Overview, Key Topics Discussed, Decisions / Action Items (if any), and Open Questions.',
    }[focus] || 'Provide a clear Overview, Key Topics Discussed, and Action Items.';

    const summaryPrompt =
      `Summarize the following NexChat conversation ("${conversationName}", ${chronological.length} messages).\n` +
      `${focusGuidance}\n` +
      `Use clean Markdown headings and bullet points. Do not invent facts not present in the messages.\n\n` +
      `--- CHAT TRANSCRIPT ---\n${transcriptLines.join('\n')}`;

    const { model, data } = await callGeminiWithFallback(TEXT_MODELS, {
      systemInstruction: {
        parts: [{ text: 'You are NexChat AI Summarizer. Produce accurate, structured, easy-to-scan chat summaries.' }],
      },
      contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    const summary = extractTextFromCandidate(data) || 'Unable to generate summary.';

    let savedThreadId = null;
    if (saveToThread) {
      const thread = await AIConversation.create({
        user: req.userId,
        title: `Summary: ${conversationName}`,
        model,
        messages: [
          {
            role: 'user',
            content: `Summarize last ${chronological.length} messages from **${conversationName}**`,
          },
          {
            role: 'assistant',
            content: summary,
            modelUsed: model,
            summaryMeta: {
              conversationId: conversation._id,
              conversationName,
              messageCount: chronological.length,
            },
          },
        ],
      });
      savedThreadId = thread._id;
    }

    res.json({
      summary,
      conversationName,
      messageCount: chronological.length,
      model,
      threadId: savedThreadId,
    });
  } catch (error) {
    console.error('[AI] summarizeConversation error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to summarize conversation' });
  }
};

// COMPOSER MESSAGE REWRITE / ASSIST
export const assistMessage = async (req, res) => {
  try {
    const { text, action = 'polish' } = req.body;
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Draft text is required' });
    }

    const instructions = {
      polish: 'Fix grammar and spelling while keeping the exact meaning and natural chat tone. Return ONLY the rewritten message text.',
      professional: 'Rewrite this chat message in a polite, clear, professional tone. Return ONLY the rewritten message text.',
      casual: 'Rewrite this message in a friendly, casual chat tone. Return ONLY the rewritten message text.',
      shorter: 'Make this message concise and direct while keeping the meaning. Return ONLY the rewritten message text.',
      translate_en: 'Translate this message into natural English. Return ONLY the translated text.',
      translate_hi: 'Translate this message into natural Hindi (Hinglish/Devanagari as appropriate for chat). Return ONLY the translated text.',
    };

    const prompt = `${instructions[action] || instructions.polish}\n\nMessage:\n${trimmed}`;
    const { model, data } = await callGeminiWithFallback(TEXT_MODELS, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });

    const result = extractTextFromCandidate(data);
    if (!result) {
      return res.status(502).json({ error: 'No rewrite returned' });
    }

    res.json({ text: result, model });
  } catch (error) {
    console.error('[AI] assistMessage error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to rewrite message' });
  }
};
