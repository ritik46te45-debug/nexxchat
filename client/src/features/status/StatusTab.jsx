import { useState, useEffect } from 'react';
import { Plus, Eye, Clock, Image as ImageIcon, Video, Type, Sparkles } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import CreateStatusModal from './CreateStatusModal';
import StatusViewerModal from './StatusViewerModal';

export default function StatusTab() {
  const [feeds, setFeeds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeStoryFeed, setActiveStoryFeed] = useState(null); // feed being viewed
  const { user } = useAuthStore();

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/status/feed');
      setFeeds(data.feeds || []);
    } catch (err) {
      console.error('Load status error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const myFeed = feeds.find((f) => f.isSelf);
  const recentFeeds = feeds.filter((f) => !f.isSelf);

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-dark-border">
        <div>
          <h1 className="text-xl font-bold text-white">Status</h1>
          <p className="text-xs text-surface-500">Stories disappear after 24 hours</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 rounded-xl gradient-primary text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-primary-500/20 hover:opacity-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Story
        </button>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-5">
        {/* My Status Card */}
        <div>
          <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2.5">My Status</p>
          <div
            onClick={() => {
              if (myFeed && myFeed.statuses.length > 0) {
                setActiveStoryFeed(myFeed);
              } else {
                setShowCreateModal(true);
              }
            }}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-dark-card border border-dark-border hover:bg-dark-hover transition-all cursor-pointer group"
          >
            <div className="relative flex-shrink-0">
              <div
                className={`w-12 h-12 rounded-full overflow-hidden p-0.5 ${
                  myFeed && myFeed.statuses.length > 0
                    ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-card'
                    : ''
                }`}
              >
                {user?.avatar?.url ? (
                  <img src={user.avatar.url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full gradient-primary flex items-center justify-center font-bold text-white">
                    {user?.displayName?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateModal(true);
                }}
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full gradient-primary border-2 border-dark-card flex items-center justify-center text-white shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">My Stories</p>
              <p className="text-xs text-surface-400">
                {myFeed && myFeed.statuses.length > 0
                  ? `${myFeed.statuses.length} active ${myFeed.statuses.length === 1 ? 'story' : 'stories'}`
                  : 'Tap to add status update'}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Updates from Friends */}
        <div>
          <p className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2.5">Recent Updates</p>
          {recentFeeds.length === 0 ? (
            <div className="text-center py-10 px-4 bg-dark-card/40 rounded-2xl border border-dark-border/40">
              <Sparkles className="w-8 h-8 text-primary-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-semibold text-surface-300">No status updates yet</p>
              <p className="text-xs text-surface-500 mt-1">Status updates from your friends will show up here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentFeeds.map((feed) => {
                const latestStatus = feed.statuses[0];
                return (
                  <div
                    key={feed.user._id}
                    onClick={() => setActiveStoryFeed(feed)}
                    className="flex items-center gap-3.5 p-3 rounded-2xl bg-dark-card border border-dark-border hover:bg-dark-hover transition-all cursor-pointer"
                  >
                    <div className="w-13 h-13 rounded-full p-0.5 ring-2 ring-primary-400 ring-offset-2 ring-offset-dark-card flex-shrink-0">
                      {feed.user?.avatar?.url ? (
                        <img src={feed.user.avatar.url} alt="" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center font-bold text-white text-sm">
                          {feed.user?.displayName?.charAt(0) || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{feed.user?.displayName}</p>
                      <p className="text-xs text-surface-400">
                        {new Date(latestStatus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Status Modal */}
      {showCreateModal && (
        <CreateStatusModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadStatuses();
          }}
        />
      )}

      {/* Status Viewer Story Modal */}
      {activeStoryFeed && (
        <StatusViewerModal
          feed={activeStoryFeed}
          onClose={() => setActiveStoryFeed(null)}
          onStatusDeleted={() => {
            loadStatuses();
            setActiveStoryFeed(null);
          }}
        />
      )}
    </div>
  );
}
