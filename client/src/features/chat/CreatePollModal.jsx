import { useState } from 'react';
import { X, Plus, Trash2, BarChart2, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreatePollModal({ onCreatePoll, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [durationHours, setDurationHours] = useState(24);

  const handleAddOption = () => {
    if (options.length >= 10) {
      toast.error('Maximum 10 options allowed');
      return;
    }
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index) => {
    if (options.length <= 2) {
      toast.error('A poll must have at least 2 options');
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index, value) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = () => {
    if (!question.trim()) {
      toast.error('Please enter a poll question');
      return;
    }

    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast.error('Please enter at least 2 options');
      return;
    }

    onCreatePoll({
      question: question.trim(),
      options: validOptions.map((text) => ({ text, votes: [] })),
      isMultipleChoice,
      isAnonymous,
      expiresAt: durationHours > 0 ? new Date(Date.now() + durationHours * 3600 * 1000) : null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fade-in">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center border border-primary-500/30">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">Create a Poll</h3>
              <p className="text-[11px] text-surface-400">Ask questions and collect instant votes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4 text-xs">
          {/* Question Input */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              Poll Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What time should we meet tomorrow?"
              className="w-full px-3.5 py-2.5 bg-dark-input text-white rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
              autoFocus
            />
          </div>

          {/* Options List */}
          <div>
            <label className="text-[11px] font-bold text-surface-400 uppercase tracking-wider block mb-1.5">
              Options
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 text-center text-surface-500 font-mono text-[11px]">{idx + 1}.</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-dark-input text-white rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500 text-xs"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(idx)}
                      className="w-8 h-8 rounded-lg hover:bg-accent-red/20 text-surface-400 hover:text-accent-red flex items-center justify-center transition-all"
                      title="Remove option"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 10 && (
              <button
                onClick={handleAddOption}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-300 border border-primary-500/30 text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            )}
          </div>

          {/* Settings Toggles */}
          <div className="p-3.5 rounded-2xl bg-dark-input/60 border border-dark-border space-y-3">
            {/* Multiple Choice Toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white font-semibold">Allow Multiple Answers</p>
                <p className="text-[10px] text-surface-400">Voters can select more than one option</p>
              </div>
              <input
                type="checkbox"
                checked={isMultipleChoice}
                onChange={(e) => setIsMultipleChoice(e.target.checked)}
                className="w-4 h-4 accent-primary-500 rounded cursor-pointer"
              />
            </label>

            {/* Anonymous Toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white font-semibold">Anonymous Voting</p>
                <p className="text-[10px] text-surface-400">Hide voter identities from results</p>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 accent-primary-500 rounded cursor-pointer"
              />
            </label>

            {/* Poll Duration */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-white font-semibold">Poll Duration</p>
                <p className="text-[10px] text-surface-400">Automatically closes voting after</p>
              </div>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="bg-dark-card border border-dark-border text-white text-xs px-2.5 py-1 rounded-xl focus:outline-none"
              >
                <option value={1}>1 Hour</option>
                <option value={24}>24 Hours</option>
                <option value={72}>3 Days</option>
                <option value={168}>1 Week</option>
                <option value={0}>No Limit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-dark-border bg-dark-card flex-shrink-0">
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl gradient-primary text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
          >
            <BarChart2 className="w-4 h-4" /> Create & Share Poll
          </button>
        </div>
      </div>
    </div>
  );
}
