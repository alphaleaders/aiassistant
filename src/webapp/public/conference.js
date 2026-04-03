// WebRTC Conference Manager — Final Version
class ConferenceManager {
  _toast(msg, type) { try { if (typeof showToast === 'function') showToast(msg, type); else console.warn('[CONF]', msg); } catch(e){} }

  constructor() {
    this.peers = new Map(); // socketId -> { pc, streams, userId, firstName, username, role, audio, video, handRaised, makingOffer, isPolite }
    this.localStream = null;
    this.screenStream = null;
    this.audioEnabled = false;
    this.videoEnabled = false;
    this.screenSharing = false;
    this.handRaised = false;
    this.roomId = null;
    this._stoppingScreen = false;
    this.isMutedByAdmin = false; // Admin mute state

    this.iceConfig = {
      iceServers: [
        { urls: 'stun:81.91.177.204:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Public TURN servers for better NAT/VPN traversal
        {
          urls: 'turn:81.91.177.204:3478',
          username: 'planday',
          credential: 'PlanDay2026Turn!'
        },
        {
          urls: 'turn:81.91.177.204:3478?transport=tcp',
          username: 'planday',
          credential: 'PlanDay2026Turn!'
        },
        {
          urls: 'turn:81.91.177.204:3478?transport=udp',
          username: 'planday',
          credential: 'PlanDay2026Turn!'
        }
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    };
  }

  // ==================== LOCAL MEDIA ====================

  async initMedia(audio = true, video = false) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false,
        video: video ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 }
        } : false
      });

      this.audioEnabled = audio && this.localStream.getAudioTracks().length > 0;
      this.videoEnabled = video && this.localStream.getVideoTracks().length > 0;

      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = this.localStream;

      this.updateLocalVideoUI();
      return true;
    } catch (err) {
      console.error('Media error:', err);
      if (err.name === 'NotAllowedError') {
        this._toast('Доступ к микрофону запрещён', 'error');
      } else if (err.name === 'NotFoundError') {
        this._toast('Микрофон/камера не найдены', 'error');
      } else {
        this._toast('Не удалось получить доступ к медиа', 'error');
      }
      // Fallback: try audio only
      if (video) return this.initMedia(audio, false);
      // Create empty stream so peer connections can work
      this.localStream = new MediaStream();
      this.audioEnabled = false;
      this.videoEnabled = false;
      return false;
    }
  }

  async toggleAudio() {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    let audioTrack = this.localStream.getAudioTracks()[0];

    // If no audio track exists, request microphone access
    if (!audioTrack) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        audioTrack = audioStream.getAudioTracks()[0];
        this.localStream.addTrack(audioTrack);

        // Add track to all existing peer connections
        this.peers.forEach(({ pc }) => {
          const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio' || s.track === null);
          if (audioSender) audioSender.replaceTrack(audioTrack);
          else pc.addTrack(audioTrack, this.localStream);
        });

        this.audioEnabled = true;
        this.broadcastMediaState();
        this.updateLocalVideoUI();
        return true;
      } catch (err) {
        console.error('Microphone error:', err);
        if (err.name === 'NotAllowedError') {
          this._toast('Доступ к микрофону запрещён', 'error');
        } else {
          this._toast('Не удалось включить микрофон', 'error');
        }
        return false;
      }
    }

    // Check if muted by admin
    if (this.isMutedByAdmin && !audioTrack.enabled) {
      this._toast('Админ заблокировал ваш микрофон', 'warning');
      return false;
    }

    // Toggle existing track
    audioTrack.enabled = !audioTrack.enabled;
    this.audioEnabled = audioTrack.enabled;
    this.broadcastMediaState();
    this.updateLocalVideoUI();
    return this.audioEnabled;
  }

  async toggleVideo() {
    if (!this.localStream) return false;

    if (this.videoEnabled) {
      // Turn OFF camera
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(t => {
        t.stop();
        this.localStream.removeTrack(t);
      });
      this.videoEnabled = false;

      // Replace video sender with null track in all peers (no renegotiation needed)
      this.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video' || (!s.track && s._wasVideo));
        if (sender) {
          sender.replaceTrack(null);
          sender._wasVideo = true;
        }
      });
    } else {
      // Turn ON camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.videoEnabled = true;

        // Replace null/existing video sender with new track
        this.peers.forEach(({ pc }) => {
          const sender = pc.getSenders().find(s =>
            (s.track && s.track.kind === 'video') || s._wasVideo
          );
          if (sender) {
            sender.replaceTrack(videoTrack);
            sender._wasVideo = false;
          } else {
            // No video sender exists — add track (will trigger negotiationneeded)
            pc.addTrack(videoTrack, this.localStream);
          }
        });
      } catch (err) {
        console.error('Camera error:', err);
        this._toast('Не удалось включить камеру', 'error');
        return false;
      }
    }

    const localVideo = document.getElementById('local-video');
    if (localVideo) localVideo.srcObject = this.localStream;

    this.broadcastMediaState();
    this.updateLocalVideoUI();
    return this.videoEnabled;
  }

  // ==================== SCREEN SHARING ====================

  async startScreenShare() {
    // Guard: stop existing screen share first
    if (this.screenStream) await this.stopScreenShare();

    try {
      // Check if screen sharing is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        this._toast('Демонстрация экрана не поддерживается на этом устройстве', 'error');
        return false;
      }

      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor' // Prefer full screen/window sharing
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      this.screenSharing = true;
      this._stoppingScreen = false;
      const screenTrack = this.screenStream.getVideoTracks()[0];

      // When user stops sharing via browser UI
      screenTrack.onended = () => this.stopScreenShare();

      // Add screen track to all peers and renegotiate
      this.peers.forEach(({ pc }, socketId) => {
        pc.addTrack(screenTrack, this.screenStream);
        // Renegotiation happens automatically via onnegotiationneeded
      });

      // Notify others
      if (window.socket && this.roomId) {
        window.socket.emit('screen_share_started', { roomId: this.roomId });
      }

      this.broadcastMediaState();
      this._toast('Демонстрация экрана начата', 'info');
      return true;
    } catch (err) {
      console.error('Screen share error:', err);
      if (err.name === 'NotAllowedError') {
        this._toast('Доступ к демонстрации экрана отклонён', 'warning');
      } else if (err.name === 'NotSupportedError') {
        this._toast('Демонстрация экрана не поддерживается на этом устройстве', 'error');
      } else if (err.name === 'NotFoundError') {
        this._toast('Не найдено подходящего источника для демонстрации', 'error');
      } else {
        this._toast('Ошибка демонстрации экрана: ' + err.message, 'error');
      }
      return false;
    }
  }

  stopScreenShare() {
    // Guard against double-call (from onended + manual stop)
    if (this._stoppingScreen || !this.screenSharing) return;
    this._stoppingScreen = true;

    if (this.screenStream) {
      const tracks = this.screenStream.getTracks();

      // Remove screen senders from all peers
      this.peers.forEach(({ pc }) => {
        pc.getSenders().forEach(sender => {
          if (sender.track && tracks.includes(sender.track)) {
            pc.removeTrack(sender);
          }
        });
      });

      // Stop all tracks
      tracks.forEach(t => t.stop());
      this.screenStream = null;
    }

    this.screenSharing = false;

    if (window.socket && this.roomId) {
      window.socket.emit('screen_share_stopped', { roomId: this.roomId });
    }

    this.broadcastMediaState();
    this._toast('Демонстрация экрана остановлена', 'info');
    this._stoppingScreen = false;
  }

  async toggleScreenShare() {
    if (this.screenSharing) {
      this.stopScreenShare();
      return false;
    }
    return this.startScreenShare();
  }

  // ==================== HAND RAISE & REACTIONS ====================

  toggleHand() {
    this.handRaised = !this.handRaised;
    if (window.socket && this.roomId) {
      window.socket.emit('hand_raise', { roomId: this.roomId, raised: this.handRaised });
    }
    return this.handRaised;
  }

  sendReaction(emoji) {
    if (window.socket && this.roomId) {
      window.socket.emit('reaction', { roomId: this.roomId, emoji });
    }
  }

  // ==================== PEER CONNECTION MANAGEMENT ====================

  createPeerConnection(socketId, peerInfo, isPolite) {
    // Close existing connection if any
    const existing = this.peers.get(socketId);
    if (existing) {
      existing.pc.close();
    }

    const pc = new RTCPeerConnection(this.iceConfig);

    const peerData = {
      pc,
      streams: [],
      userId: peerInfo.userId,
      firstName: peerInfo.firstName,
      username: peerInfo.username,
      role: peerInfo.role,
      audio: true,
      video: false,
      handRaised: false,
      makingOffer: false,
      isPolite: isPolite,
      pendingCandidates: []
    };

    this.peers.set(socketId, peerData);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Add screen share tracks
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        pc.addTrack(track, this.screenStream);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && window.socket) {
        window.socket.emit('webrtc_ice_candidate', {
          targetSocketId: socketId,
          candidate: event.candidate
        });
      }
    };

    // Handle negotiation needed (perfect negotiation pattern)
    pc.onnegotiationneeded = async () => {
      try {
        peerData.makingOffer = true;
        await pc.setLocalDescription();
        if (window.socket) {
          window.socket.emit('webrtc_offer', {
            targetSocketId: socketId,
            offer: pc.localDescription
          });
        }
      } catch (err) {
        console.error('Negotiation error:', err);
      } finally {
        peerData.makingOffer = false;
      }
    };

    // Remote tracks
    pc.ontrack = (event) => {
      const peer = this.peers.get(socketId);
      if (!peer) return;

      const stream = event.streams[0];
      if (!stream) return;

      const track = event.track;

      // Detect screen share
      const isScreenShare = track.kind === 'video' && (
        track.label.toLowerCase().includes('screen') ||
        track.label.toLowerCase().includes('window') ||
        track.label.toLowerCase().includes('monitor') ||
        track.label.toLowerCase().includes('display') ||
        track.contentHint === 'detail' ||
        (peer.streams.length > 0 && peer.streams[0] && stream.id !== peer.streams[0].id)
      );

      if (isScreenShare) {
        this.displayScreenShare(stream, peerInfo.firstName);
        return;
      }

      peer.streams = event.streams;
      this.displayRemoteStream(socketId, stream, peerInfo);
    };

    // Connection state monitoring with retry logic
    peerData.reconnectAttempts = 0;
    peerData.reconnectTimer = null;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state for ${socketId}: ${state}`);

      if (state === 'connected') {
        // Connection established/restored
        peerData.reconnectAttempts = 0;
        if (peerData.reconnectTimer) {
          clearTimeout(peerData.reconnectTimer);
          peerData.reconnectTimer = null;
        }
        this._toast(`Соединение с ${peerInfo.firstName} установлено`, 'success');
      } else if (state === 'failed') {
        console.warn(`Connection failed for peer ${socketId}, attempting recovery`);
        this.attemptReconnect(socketId, peerData);
      } else if (state === 'disconnected') {
        console.warn(`Connection disconnected for peer ${socketId}`);
        this._toast(`Переподключение к ${peerInfo.firstName}...`, 'warning');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`ICE state for ${socketId}: ${iceState}`);

      if (iceState === 'connected' || iceState === 'completed') {
        peerData.reconnectAttempts = 0;
        if (peerData.reconnectTimer) {
          clearTimeout(peerData.reconnectTimer);
          peerData.reconnectTimer = null;
        }
      } else if (iceState === 'disconnected') {
        // Wait before attempting ICE restart (might reconnect automatically)
        if (peerData.reconnectTimer) clearTimeout(peerData.reconnectTimer);
        peerData.reconnectTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log(`ICE still disconnected for ${socketId}, restarting ICE`);
            this.attemptReconnect(socketId, peerData);
          }
        }, 2000);
      } else if (iceState === 'failed') {
        console.warn(`ICE failed for peer ${socketId}, immediate restart`);
        this.attemptReconnect(socketId, peerData);
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state for ${socketId}: ${pc.iceGatheringState}`);
    };

    return pc;
  }

  // Perfect negotiation: handle incoming offer
  async handleOffer(senderSocketId, offer, peerInfo) {
    let peer = this.peers.get(senderSocketId);
    let pc;

    if (!peer) {
      // Unknown peer sent us an offer — create PC as polite peer
      pc = this.createPeerConnection(senderSocketId, peerInfo, true);
      peer = this.peers.get(senderSocketId);
    } else {
      pc = peer.pc;
    }

    // Perfect negotiation: handle glare
    const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';

    if (offerCollision) {
      if (!peer.isPolite) {
        // We are impolite — ignore incoming offer (our offer takes priority)
        return;
      }
      // We are polite — rollback our offer and accept theirs
      await Promise.all([
        pc.setLocalDescription({ type: 'rollback' }),
        pc.setRemoteDescription(new RTCSessionDescription(offer))
      ]);
    } else {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
    }

    // Drain any ICE candidates that arrived before remoteDescription was set
    await this._drainPendingCandidates(senderSocketId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (window.socket) {
      window.socket.emit('webrtc_answer', {
        targetSocketId: senderSocketId,
        answer: pc.localDescription
      });
    }
  }

  async handleAnswer(senderSocketId, answer) {
    const peer = this.peers.get(senderSocketId);
    if (!peer) return;

    try {
      if (peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        // Drain any ICE candidates that arrived before remoteDescription was set
        await this._drainPendingCandidates(senderSocketId);
      }
    } catch (err) {
      console.error('Handle answer error:', err);
    }
  }

  async handleIceCandidate(senderSocketId, candidate) {
    const peer = this.peers.get(senderSocketId);
    if (!peer) return;

    // Queue candidate if remote description not yet set
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Ignore ICE candidate errors when connection is not ready
      if (peer.pc.signalingState !== 'closed') {
        console.warn('ICE candidate error (non-fatal):', err.message);
      }
    }
  }

  async _drainPendingCandidates(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        if (peer.pc.signalingState !== 'closed') {
          console.warn('Queued ICE candidate error (non-fatal):', err.message);
        }
      }
    }
  }

  // Reconnection with exponential backoff
  async attemptReconnect(socketId, peerData) {
    const MAX_ATTEMPTS = 10;
    const BASE_DELAY = 1000; // 1 second

    if (peerData.reconnectAttempts >= MAX_ATTEMPTS) {
      console.error(`Max reconnection attempts reached for ${socketId}`);
      this._toast('Не удалось восстановить соединение', 'error');
      return;
    }

    peerData.reconnectAttempts++;
    const delay = BASE_DELAY * Math.pow(1.5, peerData.reconnectAttempts - 1);

    console.log(`Reconnection attempt ${peerData.reconnectAttempts}/${MAX_ATTEMPTS} for ${socketId} in ${delay}ms`);

    if (peerData.reconnectTimer) clearTimeout(peerData.reconnectTimer);

    peerData.reconnectTimer = setTimeout(async () => {
      try {
        const pc = peerData.pc;

        // Check if still needed
        if (pc.connectionState === 'closed') {
          console.log(`Connection already closed for ${socketId}, aborting reconnect`);
          return;
        }

        if (pc.connectionState === 'connected') {
          console.log(`Connection already restored for ${socketId}`);
          peerData.reconnectAttempts = 0;
          return;
        }

        console.log(`Executing ICE restart for ${socketId}`);

        // Restart ICE
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);

        if (window.socket) {
          window.socket.emit('webrtc_offer', {
            targetSocketId: socketId,
            offer: pc.localDescription
          });
        }
      } catch (err) {
        console.error(`ICE restart error for ${socketId}:`, err);
        // Schedule next attempt
        if (peerData.reconnectAttempts < MAX_ATTEMPTS) {
          this.attemptReconnect(socketId, peerData);
        }
      }
    }, delay);
  }

  // Existing peer sends us a notification that a new peer joined
  // This side (existing) is IMPOLITE — sends offer first
  async onPeerJoined(socketId, peerInfo) {
    console.log('[CONF] onPeerJoined - creating IMPOLITE peer for:', socketId);
    console.log('  - Current peers count:', this.peers.size);
    console.log('  - Local stream exists:', !!this.localStream);
    console.log('  - Local stream tracks:', this.localStream ? this.localStream.getTracks().length : 0);
    this.createPeerConnection(socketId, peerInfo, false); // impolite = sends offer
    // onnegotiationneeded fires automatically when tracks are added in createPeerConnection
    this.updateVideoGrid();
    this.updateParticipantsCount();
  }

  // When WE join a room and receive list of existing participants
  // We are POLITE — we wait for offers from existing participants
  createPeerForExisting(socketId, peerInfo) {
    console.log('[CONF] createPeerForExisting - creating POLITE peer for:', socketId);
    console.log('  - Current peers count:', this.peers.size);
    console.log('  - Local stream exists:', !!this.localStream);
    console.log('  - Local stream tracks:', this.localStream ? this.localStream.getTracks().length : 0);
    this.createPeerConnection(socketId, peerInfo, true); // polite = waits for offer
    this.updateVideoGrid();
    this.updateParticipantsCount();
  }

  onPeerLeft(socketId) {
    console.log('[CONF] onPeerLeft - removing peer:', socketId);
    const peer = this.peers.get(socketId);
    if (peer) {
      console.log('  - Peer found, closing connection');
      // Clear reconnection timer
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
        peer.reconnectTimer = null;
      }

      peer.pc.close();
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.oniceconnectionstatechange = null;
      peer.pc.onnegotiationneeded = null;
      this.peers.delete(socketId);

      const container = document.getElementById(`video-${socketId}`);
      if (container) container.remove();

      this.updateVideoGrid();
      this.updateParticipantsCount();
    } else {
      console.log('  - Peer NOT found in peers Map');
    }
  }

  // Очистить все peer connections (при переподключении к комнате)
  clearAllPeers() {
    console.log('Clearing all peer connections');

    // Закрыть все существующие peer connections
    this.peers.forEach((peer, socketId) => {
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
      }
      peer.pc.close();

      // Удалить video контейнер
      const container = document.getElementById(`video-${socketId}`);
      if (container) container.remove();
    });

    // Очистить Map
    this.peers.clear();

    // Обновить UI
    this.updateVideoGrid();
    this.updateParticipantsCount();
  }

  // ==================== DISPLAY ====================

  displayRemoteStream(socketId, stream, peerInfo) {
    let container = document.getElementById(`video-${socketId}`);

    if (!container) {
      container = document.createElement('div');
      container.id = `video-${socketId}`;
      container.className = 'video-container';
      container.dataset.initials = (peerInfo.firstName || '?')[0].toUpperCase();

      // Add profile photo if available
      if (peerInfo.photoUrl) {
        const avatar = document.createElement('div');
        avatar.className = 'video-avatar';
        avatar.style.backgroundImage = `url(${peerInfo.photoUrl})`;
        container.appendChild(avatar);
      }

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.id = `video-el-${socketId}`;

      // Mute button (visible only for admin/helper)
      const canManage = window.myRole === 'admin' || window.myRole === 'helper';
      if (canManage && peerInfo.role !== 'admin') {
        const muteBtn = document.createElement('button');
        muteBtn.className = 'video-mute-btn';
        muteBtn.id = `mute-btn-${socketId}`;
        muteBtn.innerHTML = '🔇';
        muteBtn.title = 'Заглушить микрофон';
        muteBtn.onclick = () => { try { AdminManager.toggleMuteUser(peerInfo.userId); } catch(e) { console.error('AdminManager error:', e); } };
        container.appendChild(muteBtn);
      }

      const label = document.createElement('div');
      label.className = 'video-label';

      const roleIcon = peerInfo.role === 'admin' ? '👑 ' : peerInfo.role === 'helper' ? '🛡 ' : '';
      label.innerHTML = `
        <span class="video-name">${this.escapeHtml(roleIcon + (peerInfo.firstName || 'User'))}</span>
        <span class="video-indicators" id="indicators-${socketId}">
          <span class="mic-indicator" id="mic-${socketId}">
            🎤
            <span class="audio-level">
              <span class="audio-level-bar" id="audio-level-${socketId}"></span>
            </span>
          </span>
        </span>
      `;

      container.appendChild(video);
      container.appendChild(label);
      document.getElementById('video-grid').appendChild(container);

      // Setup audio level monitoring
      this.setupAudioLevelMonitor(socketId, stream);
    }

    const video = container.querySelector('video');
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      // Ensure autoplay works on mobile
      video.play().catch(() => {});
    }

    this.updateVideoGrid();
  }

  // Audio level monitoring for visual feedback
  setupAudioLevelMonitor(socketId, stream) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const levelBar = document.getElementById(`audio-level-${socketId}`);
      const micIndicator = document.getElementById(`mic-${socketId}`);

      const updateLevel = () => {
        if (!document.getElementById(`video-${socketId}`)) {
          // Cleanup when video removed
          source.disconnect();
          analyser.disconnect();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.min(100, (average / 128) * 100);

        if (levelBar) {
          levelBar.style.width = level + '%';
        }

        // Add speaking animation
        if (micIndicator && level > 10) {
          micIndicator.classList.add('speaking');
          setTimeout(() => micIndicator.classList.remove('speaking'), 300);
        }

        requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Audio level monitoring not supported:', err);
    }
  }

  displayScreenShare(stream, firstName) {
    const view = document.getElementById('screen-share-view');
    const video = document.getElementById('screen-share-video');
    const label = document.getElementById('screen-share-name');

    video.srcObject = stream;
    label.textContent = `Экран: ${firstName}`;
    view.classList.remove('hidden');

    // Auto-hide when track ends
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        view.classList.add('hidden');
        video.srcObject = null;
      };
    }
  }

  updateVideoGrid() {
    const grid = document.getElementById('video-grid');
    const count = grid.children.length;
    grid.setAttribute('data-count', Math.min(count, 9));
  }

  updateLocalVideoUI() {
    const container = document.getElementById('local-video-container');
    if (!container) return;

    if (!this.videoEnabled) {
      container.classList.add('no-video');
      container.dataset.initials = (window.currentUser?.first_name || 'Я')[0];
    } else {
      container.classList.remove('no-video');
    }

    const indicators = container.querySelector('.video-indicators');
    if (indicators) {
      indicators.innerHTML = '';
      if (!this.audioEnabled) {
        indicators.innerHTML += '<span class="indicator-muted">🔇</span>';
      }
      if (this.handRaised) {
        indicators.innerHTML += '<span class="indicator-hand">✋</span>';
      }
    }
  }

  updatePeerMediaState(socketId, state) {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.audio = state.audio;
      peer.video = state.video;
    }

    // Update mic indicator
    const micIndicator = document.getElementById(`mic-${socketId}`);
    if (micIndicator) {
      if (state.audio) {
        micIndicator.classList.remove('muted');
        micIndicator.innerHTML = `🎤 <span class="audio-level"><span class="audio-level-bar" id="audio-level-${socketId}"></span></span>`;
      } else {
        micIndicator.classList.add('muted');
        micIndicator.innerHTML = '🔇';
      }
    }

    // Update mute button if exists
    const muteBtn = document.getElementById(`mute-btn-${socketId}`);
    if (muteBtn) {
      muteBtn.classList.toggle('muted', !state.audio);
    }

    const container = document.getElementById(`video-${socketId}`);
    if (container) {
      container.classList.toggle('no-video', !state.video);
    }
  }

  updateHandRaise(socketId, raised) {
    const peer = this.peers.get(socketId);
    if (peer) peer.handRaised = raised;

    const indicators = document.getElementById(`indicators-${socketId}`);
    if (!indicators) return;

    const existing = indicators.querySelector('.indicator-hand');
    if (raised && !existing) {
      const span = document.createElement('span');
      span.className = 'indicator-hand';
      span.textContent = '✋';
      indicators.appendChild(span);
    } else if (!raised && existing) {
      existing.remove();
    }
  }

  updateParticipantsCount() {
    const count = this.peers.size + 1;
    const el = document.getElementById('conf-participants-count');
    if (!el) return;

    let word;
    const lastTwo = count % 100;
    const lastOne = count % 10;
    if (lastTwo >= 11 && lastTwo <= 19) word = 'участников';
    else if (lastOne === 1) word = 'участник';
    else if (lastOne >= 2 && lastOne <= 4) word = 'участника';
    else word = 'участников';

    el.textContent = `${count} ${word}`;
  }

  broadcastMediaState() {
    if (window.socket && this.roomId) {
      window.socket.emit('media_state', {
        roomId: this.roomId,
        audio: this.audioEnabled,
        video: this.videoEnabled,
        screenShare: this.screenSharing
      });
    }
  }

  showReaction(emoji, firstName) {
    const overlay = document.getElementById('reactions-overlay');
    if (!overlay) return;
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    el.style.bottom = '10%';
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // ==================== LEAVE / CLEANUP ====================

  leave() {
    // Stop local media
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Stop screen share
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // Close all peer connections and clear timers
    this.peers.forEach((peer) => {
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
        peer.reconnectTimer = null;
      }
      try { peer.pc.close(); } catch (e) {}
    });
    this.peers.clear();

    // Notify server
    if (window.socket && this.roomId) {
      window.socket.emit('leave_room', { roomId: this.roomId });
    }

    // Reset state
    this.audioEnabled = false;
    this.videoEnabled = false;
    this.screenSharing = false;
    this.handRaised = false;
    this._stoppingScreen = false;
    this.roomId = null;

    // Clean up video grid (keep local-video-container)
    const grid = document.getElementById('video-grid');
    const local = document.getElementById('local-video-container');
    while (grid.children.length > 1) {
      const child = grid.lastChild;
      if (child === local) break;
      grid.removeChild(child);
    }
    const localVideo = document.getElementById('local-video');
    if (localVideo) localVideo.srcObject = null;

    document.getElementById('screen-share-view').classList.add('hidden');
    this.updateVideoGrid();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getParticipants() {
    const list = [];
    this.peers.forEach((peer, socketId) => {
      list.push({
        socketId,
        userId: peer.userId,
        firstName: peer.firstName,
        username: peer.username,
        role: peer.role,
        audio: peer.audio,
        video: peer.video,
        handRaised: peer.handRaised
      });
    });
    return list;
  }

  // ==================== DEVICE MANAGEMENT ====================

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        microphones: devices.filter(d => d.kind === 'audioinput'),
        cameras: devices.filter(d => d.kind === 'videoinput'),
        speakers: devices.filter(d => d.kind === 'audiooutput')
      };
    } catch (err) {
      console.error('Get devices error:', err);
      return { microphones: [], cameras: [], speakers: [] };
    }
  }

  getSelectedDevices() {
    return {
      microphone: localStorage.getItem('selectedMicrophone') || 'default',
      camera: localStorage.getItem('selectedCamera') || 'default',
      speaker: localStorage.getItem('selectedSpeaker') || 'default'
    };
  }

  setSelectedDevice(type, deviceId) {
    localStorage.setItem(`selected${type.charAt(0).toUpperCase() + type.slice(1)}`, deviceId);
  }

  async switchMicrophone(deviceId) {
    if (!this.localStream) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
        video: false
      });

      const newAudioTrack = newStream.getAudioTracks()[0];
      const oldAudioTrack = this.localStream.getAudioTracks()[0];

      if (oldAudioTrack) {
        this.localStream.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
      }

      this.localStream.addTrack(newAudioTrack);

      // Update all peer connections
      this.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) sender.replaceTrack(newAudioTrack);
      });

      this.setSelectedDevice('microphone', deviceId);
      this._toast('✅ Микрофон изменён');
    } catch (err) {
      console.error('Switch microphone error:', err);
      this._toast('❌ Ошибка смены микрофона');
    }
  }

  async switchCamera(deviceId) {
    if (!this.localStream || !this.videoEnabled) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = this.localStream.getVideoTracks()[0];

      if (oldVideoTrack) {
        this.localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }

      this.localStream.addTrack(newVideoTrack);

      // Update local video
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = this.localStream;

      // Update all peer connections
      this.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      this.setSelectedDevice('camera', deviceId);
      this._toast('✅ Камера изменена');
    } catch (err) {
      console.error('Switch camera error:', err);
      this._toast('❌ Ошибка смены камеры');
    }
  }

  async setSpeaker(deviceId) {
    const audioElements = document.querySelectorAll('video, audio');
    for (const el of audioElements) {
      if (typeof el.setSinkId === 'function') {
        try {
          await el.setSinkId(deviceId);
        } catch (err) {
          console.error('Set speaker error:', err);
        }
      }
    }
    this.setSelectedDevice('speaker', deviceId);
    this._toast('✅ Динамики изменены');
  }
}

// Global instance
const conference = new ConferenceManager();
