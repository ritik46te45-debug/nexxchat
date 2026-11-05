import { MessageCircle } from 'lucide-react';

export default function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-dark-bg relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 gradient-glow opacity-50" />

      <div className="relative z-10 flex flex-col items-center text-center px-8">
        <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center mb-6 shadow-2xl shadow-primary-500/20 animate-bounce-soft">
          <MessageCircle className="w-12 h-12 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-3">Welcome to NexChat</h2>
        <p className="text-surface-400 max-w-sm text-sm leading-relaxed">
          Select a conversation from the sidebar or start a new chat to begin messaging.
          Your messages are secure and delivered in real-time.
        </p>

        <div className="flex gap-6 mt-8">
          {[
            { icon: '🔒', label: 'Secure' },
            { icon: '⚡', label: 'Real-time' },
            { icon: '📎', label: 'File sharing' },
            { icon: '📹', label: 'Video calls' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span className="text-2xl">{icon}</span>
              <span className="text-xs text-surface-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
