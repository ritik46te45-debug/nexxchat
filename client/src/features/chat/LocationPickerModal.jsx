import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, X, Send, Loader2, Search, Compass, Zap, Radio } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LocationPickerModal({ onSendLocation, onClose }) {
  const [coords, setCoords] = useState({ latitude: 28.6139, longitude: 77.2090 });
  const [locationName, setLocationName] = useState('My Current Location');
  const [address, setAddress] = useState('GPS Location Pin');
  const [accuracy, setAccuracy] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [liveDuration, setLiveDuration] = useState(60); // minutes: 15, 60, 480
  const [searchQuery, setSearchQuery] = useState('');

  // Preset quick places
  const presetPlaces = [
    { name: 'New Delhi', lat: 28.6139, lon: 77.2090, addr: 'Connaught Place, New Delhi' },
    { name: 'Mumbai', lat: 19.0760, lon: 72.8777, addr: 'Marine Drive, Mumbai' },
    { name: 'Bangalore', lat: 12.9716, lon: 77.5946, addr: 'MG Road, Bangalore' },
    { name: 'Kolkata', lat: 22.5726, lon: 88.3639, addr: 'Park Street, Kolkata' },
    { name: 'London', lat: 51.5074, lon: -0.1278, addr: 'Trafalgar Square, London' },
    { name: 'New York', lat: 40.7128, lon: -74.0060, addr: 'Times Square, New York' },
  ];

  // Auto-detect GPS location on mount
  useEffect(() => {
    detectLocation(false);
  }, []);

  const detectLocation = (andSendImmediately = false, isLive = false) => {
    if (!navigator.geolocation) {
      if (andSendImmediately) {
        handleSend(isLive);
      } else {
        toast('GPS not supported in browser, you can search any place', { icon: '📍' });
      }
      return;
    }

    if (andSendImmediately) setIsSendingLive(true);
    else setIsLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setCoords({ latitude, longitude });
        setAccuracy(Math.round(acc || 15));
        const resolvedName = await reverseGeocode(latitude, longitude);

        setIsLoading(false);
        setIsSendingLive(false);

        if (andSendImmediately) {
          onSendLocation({
            latitude,
            longitude,
            name: resolvedName || (isLive ? 'Live GPS Location' : 'Current Location'),
            address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            isLive,
            liveDurationMinutes: isLive ? liveDuration : 0,
            accuracy: Math.round(acc || 15),
          });
          toast.success(isLive ? `Live location shared for ${liveDuration >= 60 ? liveDuration / 60 + 'h' : liveDuration + 'm'}!` : 'Current location sent!');
          onClose();
        }
      },
      (err) => {
        console.warn('Geolocation notice:', err.message);
        setIsLoading(false);
        setIsSendingLive(false);

        if (andSendImmediately) {
          handleSend(isLive);
        } else {
          toast('Location permission denied or unavailable, using fallback pin', { icon: '📍' });
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const reverseGeocode = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
      );
      const data = await res.json();
      if (data && data.display_name) {
        const placeName = data.name || data.address?.road || data.address?.suburb || data.address?.city || 'My Location';
        setLocationName(placeName);
        setAddress(data.display_name);
        return placeName;
      }
    } catch {
      setLocationName('Live Location');
      setAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
    return 'Live GPS Location';
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        setCoords({ latitude: lat, longitude: lon });
        setLocationName(item.name || searchQuery);
        setAddress(item.display_name);
        setAccuracy(25);
        toast.success(`Found: ${item.name || searchQuery}`);
      } else {
        toast('Location not found, please try another search', { icon: '🔍' });
      }
    } catch {
      toast.error('Search failed, please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPreset = (place) => {
    setCoords({ latitude: place.lat, longitude: place.lon });
    setLocationName(place.name);
    setAddress(place.addr);
    setAccuracy(30);
  };

  const handleSend = (isLive = false) => {
    if (!coords) {
      toast.error('Please pick or detect a location');
      return;
    }

    onSendLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: locationName || (isLive ? 'Live GPS Location' : 'Current Location'),
      address: address || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
      isLive,
      liveDurationMinutes: isLive ? liveDuration : 0,
      accuracy: accuracy || 20,
    });
    toast.success(isLive ? 'Live location shared!' : 'Location sent!');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="w-full max-w-md max-h-[92vh] bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-dark-border flex items-center justify-between flex-shrink-0 bg-dark-card/95">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-accent-green/20 text-accent-green flex items-center justify-center border border-accent-green/30">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">Share Location</h2>
              <p className="text-[10px] sm:text-[11px] text-surface-400">WhatsApp-style live GPS sharing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-3 sm:p-4 space-y-3.5 text-xs">
          {/* Visual Interactive Radar / GPS Card (Never black screen!) */}
          <div className="relative h-44 sm:h-48 rounded-2xl bg-gradient-to-b from-[#0a192f] to-[#030d1a] border border-dark-border overflow-hidden flex flex-col items-center justify-center p-4 text-center shadow-inner">
            {/* Ambient Background Radar Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

            {/* Glowing Radar Pulse Wave */}
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-primary-500/20 animate-ping absolute" />
              <div className="w-16 h-16 rounded-full bg-accent-green/25 animate-pulse absolute" />
              <div className="w-10 h-10 rounded-full gradient-primary text-white flex items-center justify-center shadow-lg shadow-primary-500/50 z-10">
                <MapPin className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Live Location Metadata */}
            <div className="relative z-10 mt-3 text-center">
              <h4 className="text-sm font-bold text-white truncate max-w-[280px]">
                {locationName}
              </h4>
              <p className="text-[11px] text-surface-400 truncate max-w-[280px] mt-0.5">
                {address}
              </p>
              <div className="flex items-center justify-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-green px-2 py-0.5 rounded-full bg-accent-green/10 border border-accent-green/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                  {accuracy ? `Accurate to ~${accuracy}m` : 'GPS Connected'}
                </span>
                <span className="text-[10px] text-surface-500 font-mono">
                  {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* PRIMARY: Share Live Location (WhatsApp Style) */}
          <div className="p-3 rounded-2xl bg-dark-input/60 border border-dark-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-accent-green animate-pulse" />
                <span className="font-bold text-white text-xs">Share Live Location</span>
              </div>
              <div className="flex items-center gap-1">
                {[15, 60, 480].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setLiveDuration(mins)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      liveDuration === mins
                        ? 'bg-accent-green text-black shadow-sm'
                        : 'bg-dark-card text-surface-400 hover:text-white border border-dark-border'
                    }`}
                  >
                    {mins === 15 ? '15m' : mins === 60 ? '1 hr' : '8 hrs'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => detectLocation(true, true)}
              disabled={isSendingLive}
              className="w-full py-2.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
            >
              {isSendingLive ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
              )}
              <span>Share Live Location ({liveDuration >= 60 ? liveDuration / 60 + ' hr' : liveDuration + ' mins'})</span>
            </button>
          </div>

          {/* SECONDARY: Send Current Location */}
          <button
            onClick={() => detectLocation(true, false)}
            className="w-full py-2.5 px-3 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-surface-200 hover:text-white font-semibold text-xs flex items-center justify-between transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-primary-400" />
              <span>Send Your Current Location</span>
            </div>
            <span className="text-[10px] text-surface-500">Static Pin</span>
          </button>

          {/* Search Place / Landmark */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search city, address, or landmark..."
                  className="w-full pl-8 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 rounded-xl bg-dark-input hover:bg-dark-hover text-white border border-dark-border text-xs font-semibold transition-all cursor-pointer"
              >
                Search
              </button>
            </div>

            {/* Quick Cities */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {presetPlaces.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                    coords.latitude === p.lat && coords.longitude === p.lon
                      ? 'border-primary-500 bg-primary-500/20 text-white font-bold'
                      : 'border-dark-border bg-dark-input text-surface-300 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-3 sm:p-4 border-t border-dark-border bg-dark-card flex-shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={() => detectLocation(false)}
            disabled={isLoading}
            className="py-2.5 px-3 rounded-xl bg-dark-input hover:bg-dark-hover border border-dark-border text-surface-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5 text-primary-400" />}
            <span>Re-center GPS</span>
          </button>

          <button
            onClick={() => handleSend(false)}
            className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" /> Send Selected Pin
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
