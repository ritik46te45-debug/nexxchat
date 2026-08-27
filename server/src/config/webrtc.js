/**
 * WebRTC ICE / STUN / TURN Configuration
 * Supports environment variable overrides for custom TURN providers (Coturn, Twilio, Metered, Xirsys)
 * with robust multi-port UDP/TCP/TLS fallback.
 */

export const getIceServers = () => {
  const iceServers = [];

  // 1. Primary STUN servers (Google & Cloudflare public STUN)
  const envStun = process.env.STUN_SERVER;
  if (envStun) {
    envStun.split(',').forEach((url) => {
      if (url.trim()) iceServers.push({ urls: url.trim() });
    });
  } else {
    iceServers.push(
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    );
  }

  // 2. Production TURN servers from Environment Variables
  const turnServer = process.env.TURN_SERVER || process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnPassword = process.env.TURN_PASSWORD;

  if (turnServer && turnUsername && turnPassword) {
    const urls = turnServer.split(',').map((u) => u.trim());
    iceServers.push({
      urls,
      username: turnUsername,
      credential: turnPassword,
    });
  } else {
    // 3. Fallback reliable TURN over UDP, TCP, and TLS (Port 80 & 443 for firewall/NAT traversal)
    iceServers.push(
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      }
    );
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
  };
};
