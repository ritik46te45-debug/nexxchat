import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, X, Send, Loader2, Search, Compass, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LocationPickerModal({ onSendLocation, onClose }) {
  const [coords, setCoords] = useState({ latitude: 28.6139, longitude: 77.2090 });
  const [locationName, setLocationName] = useState('My Current Location');
  const [address, setAddress] = useState('GPS Location Pin');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingLive, setIsSendingLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Preset quick places
  const presetPlaces = [
    { name: 'New Delhi, India', lat: 28.6139, lon: 77.2090, addr: 'Connaught Place, New Delhi' },
    { name: 'Mumbai, India', lat: 19.0760, lon: 72.8777, addr: 'Marine Drive, Mumbai' },
    { name: 'Bangalore, India', lat: 12.9716, lon: 77.5946, addr: 'MG Road, Bangalore' },
    { name: 'Kolkata, India', lat: 22.5726, lon: 88.3639, addr: 'Park Street, Kolkata' },
    { name: 'London, UK', lat: 51.5074, lon: -0.1278, addr: 'Trafalgar Square, London' },
    { name: 'New York, USA', lat: 40.7128, lon: -74.0060, addr: 'Times Square, New York' },
  ];

  // Auto-detect GPS location on mount
  useEffect(() => {
    detectLocation(false);
  }, []);

  const detectLocation = (andSendImmediately = false) => {
    if (!navigator.geolocation) {
      if (andSendImmediately) {
        handleSend();
      } else {
        toast('GPS not supported in browser, you can search any place', { icon: '📍' });
      }
      return;
    }

    if (andSendImmediately) setIsSendingLive(true);
    else setIsLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        const resolvedName = await reverseGeocode(latitude, longitude);

        setIsLoading(false);
        setIsSendingLive(false);

        if (andSendImmediately) {
          onSendLocation({
            latitude,
            longitude,
            name: resolvedName || 'Live GPS Location',
            address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          });
          toast.success('Live GPS location sent!');
          onClose();
        }
      },
      (err) => {
        console.warn('Geolocation notice:', err.message);
        setIsLoading(false);
        setIsSendingLive(false);

        if (andSendImmediately) {
          // Send current selected coords if live GPS was blocked
          handleSend();
        }
      },
      { enableHighAccuracy: true, timeout: 6000 }
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
  };

  const handleSend = () => {
    if (!coords) {
      toast.error('Please pick or detect a location');
      return;
    }

    onSendLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: locationName || 'Shared Location',
      address: address || `${coords.latitude}, ${coords.longitude}`,
    });
    toast.success('Location sent!');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="w-full max-w-md max-h-[92vh] bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-dark-border flex items-center justify-between flex-shrink-0 bg-dark-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-red/20 text-accent-red flex items-center justify-center border border-accent-red/30">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">Share Location</h2>
              <p className="text-[10px] sm:text-[11px] text-surface-400">1-Tap live GPS or search any place</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
          {/* PRIMARY 1-TAP SEND LIVE GPS BUTTON */}
          <button
            onClick={() => detectLocation(true)}
            disabled={isSendingLive}
            className="w-full py-3 px-4 rounded-2xl gradient-primary text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:opacity-95 active:scale-98 transition-all cursor-pointer border border-primary-400/40"
          >
            {isSendingLive ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Locating & Sending Live GPS...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                <span>⚡ Send My Live GPS Location (1-Tap)</span>
              </>
            )}
          </button>

          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search city, place, landmark..."
                className="w-full pl-9 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3.5 py-2 rounded-xl bg-dark-input hover:bg-dark-hover text-white border border-dark-border text-xs font-semibold flex items-center gap-1 transition-all flex-shrink-0"
            >
              Search
            </button>
          </div>

          {/* Map Preview with Center Send Button Overlay */}
          <div className="relative h-44 sm:h-48 rounded-2xl bg-dark-bg border border-dark-border overflow-hidden flex items-center justify-center group">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
                <p className="text-xs text-surface-400">Loading map...</p>
              </div>
            ) : coords ? (
              <>
                <iframe
                  title="Location Preview"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.longitude - 0.008}%2C${coords.latitude - 0.008}%2C${coords.longitude + 0.008}%2C${coords.latitude + 0.008}&layer=mapnik&marker=${coords.latitude}%2C${coords.longitude}`}
                  className="w-full h-full filter invert hue-rotate-180 brightness-90 contrast-125 pointer-events-none"
                />

                {/* Direct button INSIDE the map */}
                <div className="absolute inset-x-3 bottom-3 flex justify-center z-10 pointer-events-auto">
                  <button
                    onClick={handleSend}
                    className="py-2 px-4 rounded-xl bg-black/85 hover:bg-black text-white text-xs font-bold flex items-center gap-2 border border-primary-500/50 shadow-2xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-primary-400" />
                    <span>Send This Map Location</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-surface-500">No coordinates selected</p>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Compass className="w-3 h-3" /> Quick Cities
            </p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {presetPlaces.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className="px-2.5 py-1 rounded-lg bg-dark-input hover:bg-dark-hover border border-dark-border text-[11px] text-surface-300 hover:text-white whitespace-nowrap transition-all flex-shrink-0"
                >
                  {p.name.split(',')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Address Display */}
          {coords && (
            <div className="p-2.5 rounded-xl bg-dark-input border border-dark-border">
              <p className="text-xs font-bold text-white truncate flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
                {locationName}
              </p>
              <p className="text-[10px] text-surface-400 line-clamp-2 mt-0.5">{address}</p>
            </div>
          )}
        </div>

        {/* Fixed Bottom Send Button */}
        <div className="p-3 sm:p-4 border-t border-dark-border bg-dark-card flex-shrink-0">
          <button
            onClick={handleSend}
            disabled={!coords || isLoading || isSendingLive}
            className="w-full py-2.5 sm:py-3 rounded-xl gradient-primary text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary-500/30 hover:opacity-95 active:scale-98 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" /> Send Location
          </button>
        </div>
      </div>
    </div>
  );
}
