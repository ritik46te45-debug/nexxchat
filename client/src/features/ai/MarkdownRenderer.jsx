import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Code copied');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-dark-border bg-[#0b0f17] shadow-inner">
      <div className="flex items-center justify-between px-3 py-1.5 bg-dark-card/90 border-b border-dark-border text-[11px] text-surface-400">
        <span className="font-mono uppercase tracking-wider">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono text-surface-100 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Render inline markdown (**bold**, *italic*, `code`, and safe http(s) links).
 */
function renderInline(text) {
  if (!text) return null;
  const tokens = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let lastIndex = 0;
  let match;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      tokens.push(
        <code key={keyIdx++} className="px-1.5 py-0.5 mx-0.5 rounded bg-dark-bg/80 border border-dark-border/60 text-primary-300 font-mono text-[12px]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**')) {
      tokens.push(<strong key={keyIdx++} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      tokens.push(<em key={keyIdx++} className="italic text-surface-200">{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        tokens.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 underline hover:text-primary-300"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(token);
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function TextSegment({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let listBuffer = [];
  let listType = null;

  const flushList = (keyPrefix) => {
    if (!listBuffer.length) return;
    if (listType === 'ol') {
      elements.push(
        <ol key={`${keyPrefix}-ol`} className="list-decimal list-inside space-y-1 my-1.5 pl-1 text-surface-200">
          {listBuffer.map((item, i) => <li key={i} className="leading-relaxed">{renderInline(item)}</li>)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`${keyPrefix}-ul`} className="list-disc list-inside space-y-1 my-1.5 pl-1 text-surface-200">
          {listBuffer.map((item, i) => <li key={i} className="leading-relaxed">{renderInline(item)}</li>)}
        </ul>
      );
    }
    listBuffer = [];
    listType = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      if (listType && listType !== 'ul') flushList(idx);
      listType = 'ul';
      listBuffer.push(trimmed.replace(/^[-*•]\s+/, ''));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType && listType !== 'ol') flushList(idx);
      listType = 'ol';
      listBuffer.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }

    flushList(idx);

    if (!trimmed) {
      elements.push(<div key={`sp-${idx}`} className="h-2" />);
    } else if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={`h3-${idx}`} className="text-sm font-bold text-white mt-2.5 mb-1">{renderInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={`h2-${idx}`} className="text-base font-bold text-white mt-3 mb-1">{renderInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={`h1-${idx}`} className="text-lg font-bold text-white mt-3 mb-1.5">{renderInline(trimmed.slice(2))}</h2>);
    } else if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={`bq-${idx}`} className="border-l-2 border-primary-500 pl-3 my-1.5 text-surface-300 italic">
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
    } else {
      elements.push(<p key={`p-${idx}`} className="leading-relaxed text-surface-100 break-words">{renderInline(line)}</p>);
    }
  });

  flushList('end');
  return <>{elements}</>;
}

export default function MarkdownRenderer({ content = '' }) {
  if (!content) return null;

  // Split around fenced code blocks (```lang ... ```)
  const segments = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let match;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: 'text', value: content.slice(lastIdx, match.index) });
    }
    segments.push({ type: 'code', language: match[1], value: match[2].replace(/\n$/, '') });
    lastIdx = fenceRegex.lastIndex;
  }
  if (lastIdx < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIdx) });
  }

  return (
    <div className="text-sm space-y-1">
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} language={seg.language} code={seg.value} />
        ) : (
          <TextSegment key={i} text={seg.value} />
        )
      )}
    </div>
  );
}
