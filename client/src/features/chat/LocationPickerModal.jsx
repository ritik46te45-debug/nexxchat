import { useState, useEffect } from 'react';
import { MapPin, Navigation, X, Send, Loader2, Search, Compass, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LocationPickerModal({ onSendLocation, onClose }) {
  // Default to a central valid coordinate (e.g. New Delhi: 28.6139, 77.2090) if GPS is waiting or blocked
  const [coords, setCoords] = useState({ latitude: 28.6139, longitude: 77.2090 });
  const [locationName, setLocationName] = useState('Selected Location');
  const [address, setAddress] = useState('New Delhi, India');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick preset locations for 1-tap instant sharing
  const presetPlaces = [
    { name: 'New Delhi, India', lat: 28.6139, lon: 77.2090, addr: 'Connaught Place, New Delhi' },
    { name: 'Mumbai, India', lat: 19.0760, lon: 72.8777, addr: 'Marine Drive, Mumbai' },
    { name: 'Bangalore, India', lat: 12.9716, lon: 77.5946, addr: 'MG Road, Bangalore' },
    { name: 'London, UK', lat: 51.5074, lon: -0.1278, addr: 'Trafalgar Square, London' },
    { name: 'New York, USA', lat: 40.7128, lon: -74.0060, addr: 'Times Square, New York' },
  ];

  // Auto-detect GPS location on mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast('GPS not available in browser. You can search any location below.', { icon: '📍' });
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        await reverseGeocode(latitude, longitude);
        setIsLoading(false);
        toast.success('Live GPS location detected');
      },
      (err) => {
        console.warn('Geolocation notice:', err.message);
        setIsLoading(false);
        toast('Location access optional. You can search or select any location.', { icon: 'ℹ️' });
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
        setLocationName(data.name || data.address?.road || data.address?.suburb || data.address?.city || 'My Location');
        setAddress(data.display_name);
      } else {
        setLocationName('Live Location');
        setAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch (e) {
      setLocationName('Pinned Location');
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
        toast.success(`Found: ${item.name || searchQuery}`);
      } else {
        toast('Location not found, please try another search', { icon: '🔍' });
      }
    } catch (e) {
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="w-full max-w-md bg-dark-card border border-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-red/20 text-accent-red flex items-center justify-center border border-accent-red/30">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">Share Location</h2>
              <p className="text-[11px] text-surface-400">Send your live GPS or search any place</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-dark-input hover:bg-dark-hover text-surface-400 hover:text-white flex items-center justify-center transition-all border border-dark-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar & GPS button */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search city, restaurant, landmark..."
                className="w-full pl-9 pr-3 py-2 bg-dark-input text-white text-xs rounded-xl border border-dark-border focus:border-primary-500 focus:outline-none placeholder:text-surface-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3.5 py-2 rounded-xl gradient-primary text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-sm"
            >
              Search
            </button>
          </div>

          <button
            onClick={detectLocation}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-300 border border-primary-500/30 text-xs font-semibold transition-all"
          >
            <Navigation className="w-3.5 h-3.5 text-primary-400" />
            Detect Live GPS Location
          </button>
        </div>

        {/* Static Map View Preview */}
        <div className="relative h-44 bg-dark-bg border-y border-dark-border flex items-center justify-center overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              <p className="text-xs text-surface-400">Locating coordinates...</p>
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
                className="w-full h-full filter invert hue-rotate-180 brightness-90 contrast-125 pointer-events-none"
              />
            </div>
          ) : (
            <p className="text-xs text-surface-500">No coordinates selected</p>
          )}
        </div>

        {/* Quick Presets */}
        <div className="px-3.5 pt-2.5">
          <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Compass className="w-3 h-3" /> Quick Locations
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

        {/* Selected Info & Send Button */}
        <div className="p-3.5 bg-dark-card space-y-3">
          {coords && (
            <div className="p-2.5 rounded-xl bg-dark-input border border-dark-border">
              <p className="text-xs font-bold text-white truncate flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-accent-red flex-shrink-0" />
                {locationName}
              </p>
              <p className="text-[10px] text-surface-400 line-clamp-2 mt-0.5">{address}</p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!coords || isLoading}
            className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:opacity-95 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" /> Send Location
          </button>
        </div>
      </div>
    </div>
  );
}
