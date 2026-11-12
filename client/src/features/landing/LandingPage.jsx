import { Link } from 'react-router-dom';
import {
  MessageCircle, Video, ShieldCheck, Users, FileText,
  Smartphone, Monitor, Globe, ArrowRight, Download,
  Mic, Sparkles, Lock, ChevronDown
} from 'lucide-react';

const APK_URL = 'https://github.com/ritik46te45-debug/nexxchat/releases/download/v-latest/NexChat.apk';
const EXE_URL = 'https://github.com/ritik46te45-debug/nexxchat/releases/download/v-latest/NexChat-Setup.exe';
const REPO_URL = 'https://github.com/ritik46te45-debug/nexxchat';

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Real-Time Messaging',
    description: 'Low-latency Socket.IO chat with instant delivery ticks, read receipts, message reactions, quoted replies, editing, and typing indicators.',
  },
  {
    icon: Video,
    title: 'HD Voice & Video Calls',
    description: 'Peer-to-peer WebRTC audio and video calling with camera flip, speaker switching, screen sharing, and complete call history.',
  },
  {
    icon: Mic,
    title: 'Voice Notes & Rich Media',
    description: 'Record voice notes with live waveform playback, share photos, videos, and inspect PDFs directly with the built-in document viewer.',
  },
  {
    icon: Users,
    title: 'Groups & 24-Hour Stories',
    description: 'Create group spaces with custom avatars and admin controls, connect via friend requests, and post disappearing photo/video stories.',
  },
  {
    icon: ShieldCheck,
    title: '2FA & PIN App Lock',
    description: 'Protect your account with Google OAuth, JWT session rotation, TOTP Two-Factor Authentication, active device management, and PIN lock.',
  },
  {
    icon: FileText,
    title: 'Cross-Platform Sync',
    description: 'Stay connected seamlessly across Web, native Android APK, and Windows Desktop with background keepalive and system notifications.',
  },
];

const FAQS = [
  {
    q: 'What is NexChat (NexxChat)?',
    a: 'NexChat (also searched as NexxChat) is a fast, free, real-time messaging and HD WebRTC voice/video calling platform available on Web, Android, and Windows Desktop.',
  },
  {
    q: 'Is NexChat free to use and download?',
    a: 'Yes. NexChat is completely free on the Web at nexxchat-zeta.vercel.app, as an Android APK, and as a Windows Desktop (.exe) installer.',
  },
  {
    q: 'Which devices and platforms does NexChat support?',
    a: 'You can use NexChat directly in any modern desktop or mobile browser, install the Android APK built with Capacitor, or run the Windows Electron app with system tray support.',
  },
  {
    q: 'How does NexChat protect my account and privacy?',
    a: 'NexChat includes Google OAuth login, rotating JWT refresh tokens, TOTP Two-Factor Authentication (2FA), active session revocation, and an in-app passcode PIN lock.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-dark-bg text-white flex flex-col relative overflow-x-hidden">
      <div className="fixed inset-0 gradient-glow pointer-events-none" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-dark-border/80 bg-dark-bg/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md shadow-primary-500/25">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">NexChat</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm text-surface-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#downloads" className="hover:text-white transition-colors">Downloads</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-surface-200 hover:text-white bg-dark-card border border-dark-border hover:bg-dark-hover transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-opacity shadow-md shadow-primary-500/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/25 text-primary-300 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Web • Android APK • Windows Desktop</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Real-Time Messaging &amp; HD Video Calls Across Every Device
          </h1>

          <p className="mt-5 text-base sm:text-lg text-surface-300 max-w-2xl mx-auto leading-relaxed">
            <strong>NexChat</strong> (NexxChat) connects you with instant messaging, peer-to-peer WebRTC voice &amp; video calls,
            voice notes, group chats, and two-factor security — free on Web, Android, and Windows.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to="/register"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-white gradient-primary hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary-500/25"
            >
              Start Messaging Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-surface-200 bg-dark-card border border-dark-border hover:bg-dark-hover hover:text-white transition-all"
            >
              Sign In to Web App
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-surface-400">
            <a
              href={APK_URL}
              download="NexChat.apk"
              className="inline-flex items-center gap-1.5 hover:text-primary-400 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Android APK
            </a>
            <span aria-hidden="true">•</span>
            <a
              href={EXE_URL}
              download="NexChat-Setup.exe"
              className="inline-flex items-center gap-1.5 hover:text-primary-400 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Windows (.exe)
            </a>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-accent-green" />
              2FA &amp; PIN Protected
            </span>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 border-t border-dark-border/60">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Everything You Need in One Messenger</h2>
            <p className="text-sm sm:text-base text-surface-400 mt-2 max-w-xl mx-auto">
              Built with React, Socket.IO, and WebRTC for fast, reliable communication on mobile and desktop.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <article key={title} className="glass-card p-6 hover:border-primary-500/40 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-primary-500/15 border border-primary-500/25 text-primary-400 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-surface-400 leading-relaxed">{description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Multi-Platform Downloads */}
        <section id="downloads" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 border-t border-dark-border/60">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Download NexChat on Any Device</h2>
            <p className="text-sm sm:text-base text-surface-400 mt-2">
              Use NexChat instantly in your browser or install the native Android &amp; Windows apps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass-card p-6 flex flex-col justify-between">
              <div>
                <Globe className="w-8 h-8 text-primary-400 mb-4" />
                <h3 className="text-lg font-bold text-white">NexChat Web App</h3>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                  Launch straight in Chrome, Edge, Firefox, or Safari with zero installation and PWA support.
                </p>
              </div>
              <Link
                to="/login"
                className="mt-6 w-full py-2.5 rounded-xl bg-dark-input border border-dark-border hover:bg-dark-hover text-sm font-semibold text-white text-center transition-colors"
              >
                Open Web App
              </Link>
            </div>

            <div className="glass-card p-6 flex flex-col justify-between">
              <div>
                <Smartphone className="w-8 h-8 text-accent-green mb-4" />
                <h3 className="text-lg font-bold text-white">Android App (APK)</h3>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                  Native Capacitor 8 Android app with push notifications, gallery saving, and background keepalive.
                </p>
              </div>
              <a
                href={APK_URL}
                download="NexChat.apk"
                className="mt-6 w-full py-2.5 rounded-xl gradient-primary hover:opacity-90 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Download NexChat.apk
              </a>
            </div>

            <div className="glass-card p-6 flex flex-col justify-between">
              <div>
                <Monitor className="w-8 h-8 text-blue-400 mb-4" />
                <h3 className="text-lg font-bold text-white">Windows Desktop (.exe)</h3>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                  Electron desktop client with Windows Action Center toast notifications and system tray minimize.
                </p>
              </div>
              <a
                href={EXE_URL}
                download="NexChat-Setup.exe"
                className="mt-6 w-full py-2.5 rounded-xl bg-dark-input border border-dark-border hover:bg-dark-hover text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Setup.exe
              </a>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 border-t border-dark-border/60">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
            <p className="text-sm text-surface-400 mt-2">Quick answers about NexChat features, security, and downloads.</p>
          </div>

          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="glass-card group p-5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-sm sm:text-base text-white">
                  <span>{q}</span>
                  <ChevronDown className="w-4 h-4 text-surface-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <p className="mt-3 text-sm text-surface-400 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-border/80 bg-dark-card/50 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-surface-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">NexChat</span>
            <span>— Real-Time Messaging &amp; HD Calls</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-white transition-colors">Create Account</Link>
            <a href={APK_URL} download="NexChat.apk" className="hover:text-white transition-colors">Android APK</a>
            <a href={EXE_URL} download="NexChat-Setup.exe" className="hover:text-white transition-colors">Windows EXE</a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

