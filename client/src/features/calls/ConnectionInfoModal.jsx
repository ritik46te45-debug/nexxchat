import { X, Activity, Wifi, Shield, Cpu, Gauge, Zap } from 'lucide-react';

export default function ConnectionInfoModal({ stats, onClose }) {
  if (!stats) return null;

  const getQualityBadge = (rating) => {
    switch (rating) {
      case 'excellent':
        return { label: 'Excellent', color: 'bg-accent-green/20 text-accent-green border-accent-green/30' };
      case 'good':
        return { label: 'Good', color: 'bg-primary-500/20 text-primary-400 border-primary-500/30' };
      case 'fair':
        return { label: 'Fair', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
      case 'poor':
      default:
        return { label: 'Poor (Audio Priority)', color: 'bg-accent-red/20 text-accent-red border-accent-red/30' };
    }
  };

  const badge = getQualityBadge(stats.rating);

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center border border-primary-500/30">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Call Connection Stats</h3>
              <p className="text-[10px] text-surface-400">Live WebRTC RTCPeerConnection metrics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto hide-scrollbar text-xs">
          {/* Quality Summary */}
          <div className="p-3 rounded-2xl bg-dark-input border border-dark-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-surface-400" />
              <span className="text-surface-300 font-medium">Link Quality</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {/* Network Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-dark-input/70 border border-dark-border/60">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Round Trip (RTT)</p>
              <p className="text-base font-mono font-bold text-white mt-0.5">{stats.rtt ? `${stats.rtt} ms` : '—'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-dark-input/70 border border-dark-border/60">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Packet Loss</p>
              <p className={`text-base font-mono font-bold mt-0.5 ${stats.packetLossPct > 3 ? 'text-accent-red' : 'text-accent-green'}`}>
                {stats.packetLossPct !== undefined ? `${stats.packetLossPct}%` : '0%'}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-dark-input/70 border border-dark-border/60">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Audio Jitter</p>
              <p className="text-base font-mono font-bold text-white mt-0.5">{stats.jitter ? `${stats.jitter} ms` : '—'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-dark-input/70 border border-dark-border/60">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Frames / Sec</p>
              <p className="text-base font-mono font-bold text-white mt-0.5">{stats.fps ? `${stats.fps} fps` : '—'}</p>
            </div>
          </div>

          {/* Bitrates & Media Specs */}
          <div className="p-3.5 rounded-2xl bg-dark-input/70 border border-dark-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Inbound Bitrate:</span>
              <span className="font-mono font-bold text-white">{stats.bitrateIn} kbps</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Outbound Bitrate:</span>
              <span className="font-mono font-bold text-white">{stats.bitrateOut} kbps</span>
            </div>
            {stats.videoWidth > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-surface-400">Video Resolution:</span>
                <span className="font-mono font-bold text-white">{stats.videoWidth} x {stats.videoHeight}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Audio Codec:</span>
              <span className="font-mono font-bold text-primary-400">{stats.audioCodec || 'Opus (48kHz FEC)'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Video Codec:</span>
              <span className="font-mono font-bold text-white">{stats.videoCodec || 'VP8 / H.264'}</span>
            </div>
          </div>

          {/* Transport & Route Info */}
          <div className="p-3.5 rounded-2xl bg-dark-input/70 border border-dark-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Candidate Route:</span>
              <span className="font-semibold text-white flex items-center gap-1">
                <Shield className="w-3 h-3 text-accent-green" />
                {stats.candidateType || 'Direct (P2P)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Transport Protocol:</span>
              <span className="font-mono text-white">{stats.transportProtocol || 'UDP'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-surface-400">Adaptive Mode:</span>
              <span className="font-semibold text-primary-400 uppercase text-[10px]">
                {stats.mode === 'saver' ? 'Data Saver' : stats.mode === 'high' ? 'High Quality' : 'Auto (Adaptive)'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
