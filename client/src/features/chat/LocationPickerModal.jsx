import { useState, useEffect } from 'react';
import { MapPin, Navigation, X, Send, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LocationPickerModal({ onSendLocation, onClose }) {
  const [coords, setCoords] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-detect GPS location on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        await reverseGeocode(latitude, longitude);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        toast.error('Could not get GPS location. Please allow location permissions.');
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const reverseGeocode = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
      );
      const data = await res.json();
      if (data) {
        setLocationName(data.name || data.address?.road || data.address?.suburb || 'Current Location');
        setAddress(data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch (e) {
      setLocationName('Selected Location');
      setAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
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
      } else {
        toast('Location not found', { icon: '🔍' });
      }
    } catch (e) {
      toast.error('Search failed');
    } finally {
      setIsLoading(false);
    }
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-red/20 text-accent-red flex items-center justify-center border border-accent-red/30">
              <MapPin className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white">Share Location</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & GPS Detect */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search place or address..."
              className="flex-1 bg-dark-input text-white text-xs px-3.5 py-2.5 rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-2.5 rounded-xl bg-dark-hover hover:bg-primary-500/20 text-surface-300 hover:text-primary-400 border border-dark-border text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={detectLocation}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/20 text-xs font-semibold transition-all"
          >
            <Navigation className="w-3.5 h-3.5" />
            Use Current GPS Location
          </button>
        </div>

        {/* Static Map View Preview (OpenStreetMap Tile) */}
        <div className="relative h-44 bg-dark-bg border-y border-dark-border flex items-center justify-center overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              <p className="text-xs text-surface-400">Finding location...</p>
            </div>
          ) : coords ? (
            <div className="w-full h-full relative">
              <iframe
                title="Location Preview"
                width="100%"
                height="100%"
                frameBorder="0"
                scrolling="no"
                marginHeight="0"
                marginWidth="0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.longitude - 0.008}%2C${coords.latitude - 0.008}%2C${coords.longitude + 0.008}%2C${coords.latitude + 0.008}&layer=mapnik&marker=${coords.latitude}%2C${coords.longitude}`}
                className="w-full h-full filter invert hue-rotate-180 brightness-90 contrast-125"
              />
            </div>
          ) : (
            <p className="text-xs text-surface-500">No coordinates selected</p>
          )}
        </div>

        {/* Selected Info & Send */}
        <div className="p-4 bg-dark-card space-y-3">
          {coords && (
            <div className="p-3 rounded-xl bg-dark-input border border-dark-border">
              <p className="text-xs font-bold text-white truncate">{locationName}</p>
              <p className="text-[11px] text-surface-400 line-clamp-2 mt-0.5">{address}</p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!coords || isLoading}
            className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 active:scale-95 disabled:opacity-40 transition-all"
          >
            <Send className="w-4 h-4" /> Send Location
          </button>
        </div>
      </div>
    </div>
  );
}
