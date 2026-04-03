// E2E Encryption using Web Crypto API (AES-256-GCM)
// Key is derived deterministically from roomId — all clients in same room get same key
const CryptoManager = {
  roomKey: null,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),

  // Derive encryption key from room ID (deterministic — same roomId = same key)
  async deriveKeyFromRoom(roomId) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(roomId),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    this.roomKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.encoder.encode('tg-conference-e2e-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Encrypt message
  async encrypt(text) {
    if (!this.roomKey) return text;
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.roomKey,
        this.encoder.encode(text)
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      return 'E2E:' + btoa(String.fromCharCode(...combined));
    } catch {
      return text;
    }
  },

  // Decrypt message
  async decrypt(data) {
    if (!this.roomKey || !data.startsWith('E2E:')) return data;
    try {
      const combined = Uint8Array.from(atob(data.slice(4)), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.roomKey,
        encrypted
      );
      return this.decoder.decode(decrypted);
    } catch {
      return '[зашифрованное сообщение]';
    }
  },

  // Reset when leaving room
  reset() {
    this.roomKey = null;
  }
};
