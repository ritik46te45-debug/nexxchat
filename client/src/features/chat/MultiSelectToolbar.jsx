import { X, Forward, Star, Trash2, Copy, CheckSquare } from 'lucide-react';

export default function MultiSelectToolbar({
  selectedCount,
  onForwardSelected,
  onStarSelected,
  onCopySelected,
  onDeleteSelected,
  onClearSelection,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute inset-x-3 bottom-20 sm:bottom-24 z-30 flex justify-center animate-slide-up select-none pointer-events-none">
      <div className="flex items-center gap-2 sm:gap-4 px-4 py-2.5 rounded-2xl bg-dark-card/95 border border-primary-500/50 backdrop-blur-xl shadow-2xl pointer-events-auto">
        {/* Count */}
        <div className="flex items-center gap-2 pr-2 border-r border-dark-border">
          <CheckSquare className="w-4 h-4 text-primary-400" />
          <span className="text-xs font-bold text-white">
            {selectedCount} <span className="hidden sm:inline">selected</span>
          </span>
        </div>

        {/* Action Buttons */}
        <button
          onClick={onForwardSelected}
          className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Forward Selected"
        >
          <Forward className="w-4 h-4 text-primary-400" />
          <span className="hidden md:inline">Forward</span>
        </button>

        <button
          onClick={onStarSelected}
          className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Star Selected"
        >
          <Star className="w-4 h-4 text-yellow-400" />
          <span className="hidden md:inline">Star</span>
        </button>

        <button
          onClick={onCopySelected}
          className="p-2 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Copy Text"
        >
          <Copy className="w-4 h-4 text-surface-400" />
          <span className="hidden md:inline">Copy</span>
        </button>

        <button
          onClick={onDeleteSelected}
          className="p-2 rounded-xl bg-dark-input hover:bg-accent-red/20 text-surface-300 hover:text-accent-red transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Delete Selected"
        >
          <Trash2 className="w-4 h-4 text-accent-red" />
          <span className="hidden md:inline">Delete</span>
        </button>

        {/* Cancel */}
        <button
          onClick={onClearSelection}
          className="p-2 rounded-xl hover:bg-dark-hover text-surface-400 hover:text-white transition-all ml-1"
          title="Cancel selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
