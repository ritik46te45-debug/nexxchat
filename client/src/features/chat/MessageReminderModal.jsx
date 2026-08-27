import { useState } from 'react';
import { X, Clock, Bell, Calendar, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const PRESETS = [
  { label: 'In 30 minutes', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 3 hours', minutes: 180 },
  { label: 'Tomorrow morning (9:00 AM)', minutes: 1440 },
];

export default function MessageReminderModal({ message, onClose }) {
  const [selectedMinutes, setSelectedMinutes] = useState(30);

  const handleSetReminder = () => {
    const notifyTime = new Date(Date.now() + selectedMinutes * 60 * 1000);

    // Schedule reminder in local storage / notification queue
    const reminders = JSON.parse(localStorage.getItem('nexchat_reminders') || '[]');
    reminders.push({
      id: `rem_${Date.now()}`,
      messageId: message?._id,
      content: message?.content || 'Message reminder',
      time: notifyTime.toISOString(),
    });
    localStorage.setItem('nexchat_reminders', JSON.stringify(reminders));

    // Request notification permission if not yet granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    toast.success(`Reminder set for ${notifyTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in">
      <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center border border-primary-500/30">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Remind Me</h3>
              <p className="text-[11px] text-surface-400">Get notified about this message</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets List */}
        <div className="p-4 space-y-2 text-xs">
          {PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              onClick={() => setSelectedMinutes(preset.minutes)}
              className={`w-full p-3 rounded-2xl flex items-center justify-between border transition-all cursor-pointer ${
                selectedMinutes === preset.minutes
                  ? 'bg-primary-500/15 border-primary-500/50 text-white font-bold'
                  : 'bg-dark-input hover:bg-dark-hover border-dark-border text-surface-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-primary-400" />
                <span>{preset.label}</span>
              </div>
              {selectedMinutes === preset.minutes && <Check className="w-4 h-4 text-primary-400" />}
            </button>
          ))}
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-dark-border bg-dark-card flex-shrink-0">
          <button
            onClick={handleSetReminder}
            className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
          >
            <Bell className="w-4 h-4" /> Set Reminder
          </button>
        </div>
      </div>
    </div>
  );
}
