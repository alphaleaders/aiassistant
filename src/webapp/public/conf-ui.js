Could not create directory '/c/Users/\312 79869951549/.ssh' (No such file or directory).
Failed to add the host to the list of known hosts (/c/Users/\312 79869951549/.ssh/known_hosts).
// Alpha Planner — Conference UI module
// Uses ConferenceManager from conference.js (which expects: video-grid, local-video)

(function () {
  let socket = null;
  let confManager = null;
  let currentRoomId = null;
  let myTgId = null;
  let myFirstName = 'User';

  // ============ Tab integration ============
  const tabConf = document.getElementById('tabConf');
  const confPanel = document.getElementById('confPanel');
  if (!tabConf || !confPanel) return;

  tabConf.addEventListener('click', () => {
    document.querySelector('.quick-add').style.display = 'none';
    document.getElementById('taskList').style.display = 'none';
    document.getElementById('statsBar').style.display = 'none';
    confPanel.style.display = 'flex';
    confPanel.style.flexDirection = 'column';
    confPanel.style.flex = '1';
    confPanel.style.overflow = 'hidden';
    if (!socket) initSocket();
    loadRooms();
  });

  document.querySelectorAll('.tab:not(#tabConf)').forEach(btn => {
    btn.addEventListener('click', () => {
      confPanel.style.display = 'none';
      document.querySelector('.quick-add').style.display = '';
      document.getElementById('taskList').style.display = '';
      document.getElementById('statsBar').style.display = '';
    });
  });

  let isAuthenticated = false;
  let pendingJoinRoomId = null;

  // ============ Socket Init ============
  function initSocket() {
    socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    window.socket = socket; // ConferenceManager uses window.socket for webrtc_answer/offer
    confManager = new ConferenceManager();

    socket.on('connect', () => {
      isAuthenticated = false;
      // Real Telegram WebApp — initData is non-empty only inside TG
      const tgInitData = window.Telegram?.WebApp?.initData;
      const tg = tgInitData ? window.Telegram.WebApp.initDataUnsafe?.user : null;
      if (tg && tg.id) {
        myTgId = tg.id;
        myFirstName = tg.first_name || 'User';
        socket.emit('auth', { telegramId: tg.id, username: tg.username, firstName: tg.first_name });
      } else {
        // Browser mode — always show name modal for guests
        showGuestNameModal();
      }
    });

    socket.on('auth_success', () => {
      isAuthenticated = true;
      if (pendingJoinRoomId) {
        const roomId = pendingJoinRoomId;
        pendingJoinRoomId = null;
        joinRoom(roomId);
      }
    });

    socket.on('auth_error', ({ message }) => showToast('Ошибка: ' + message, 'error'));

    socket.on('room_joined', async (data) => {
      currentRoomId = data.roomId;
      window.myRole = data.role;
      document.getElementById('confRoomTitle').textContent = data.roomName;

      await CryptoManager.deriveKeyFromRoom(data.roomId);
      showConfRoom();

      confManager.roomId = data.roomId;
      await confManager.initMedia(true, false);

      // Existing peers — we are polite (wait for their offers)
      for (const p of data.participants) {
        confManager.createPeerForExisting(p.socketId, {
          userId: p.userId,
          firstName: p.firstName,
          username: p.username,
          role: p.role,
          photoUrl: null,
        });
      }
    });

    socket.on('peer_joined', async ({ socketId, userId, firstName, username, role }) => {
      confManager.onPeerJoined(socketId, { userId, firstName, username, role, photoUrl: null });
      renderParticipant(socketId, firstName);
    });

    socket.on('peer_left', ({ socketId }) => {
      confManager.onPeerLeft(socketId);
      document.getElementById('part-' + socketId)?.remove();
    });

    socket.on('webrtc_offer', ({ senderSocketId, userId, firstName, username, role, offer }) => {
      confManager.handleOffer(senderSocketId, offer, { userId, firstName, username, role, photoUrl: null });
    });

    socket.on('webrtc_answer', ({ senderSocketId, answer }) => {
      confManager.handleAnswer(senderSocketId, answer);
    });

    socket.on('webrtc_ice_candidate', ({ senderSocketId, candidate }) => {
      confManager.handleIceCandidate(senderSocketId, candidate);
    });

    socket.on('peer_media_state', ({ socketId, audio }) => {
      const mic = document.getElementById('mic-' + socketId);
      if (mic) mic.style.opacity = audio ? '1' : '0.3';
    });

    socket.on('hand_raised', ({ firstName, raised }) => {
      showToast(raised ? `✋ ${firstName} поднял руку` : `${firstName} опустил руку`);
    });

    socket.on('reaction', ({ firstName, emoji }) => {
      showToast(`${firstName}: ${emoji}`);
    });

    socket.on('admin_mute', ({ muted }) => {
      confManager.isMutedByAdmin = muted;
      showToast(muted ? '🔇 Вас заглушил администратор' : '🔊 Микрофон разблокирован', 'warning');
    });

    socket.on('kicked', () => {
      showToast('Вы исключены из комнаты', 'error');
      leaveRoom();
    });

    socket.on('chat_message', async (msg) => {
      if (msg.type === 'system') {
        appendChat(msg.tg_first_name || 'Система', msg.content, true);
      } else {
        const text = await CryptoManager.decrypt(msg.content);
        appendChat(msg.tg_first_name || 'User', text, false);
      }
    });

    socket.on('error_msg', ({ message }) => showToast('❌ ' + message, 'error'));

    socket.on('screen_share_started', ({ firstName }) => showToast(`🖥 ${firstName} демонстрирует экран`));
  }

  // ============ Rooms API ============
  async function loadRooms() {
    const list = document.getElementById('confRoomsList');
    // If guest (no Telegram) and has conf param — don't load rooms, just wait for auto-join
    const hasConfParam = new URLSearchParams(window.location.search).get('conf');
    const hasTg = !!window.Telegram?.WebApp?.initData;
    if (!hasTg && hasConfParam) {
      list.innerHTML = '<div class="empty-state">⏳ Подключение к конференции...</div>';
      return;
    }
    if (!hasTg) {
      list.innerHTML = '<div class="empty-state">Введите ID комнаты ниже и нажмите «Войти»</div>';
      return;
    }
    list.innerHTML = '<div class="empty-state">Загрузка...</div>';
    try {
      const initData = window.Telegram?.WebApp?.initData;
      const resp = await fetch('/api/conf/rooms', {
        headers: initData ? { 'x-telegram-init-data': initData } : {}
      });
      const data = await resp.json();
      if (!data.rooms?.length) {
        list.innerHTML = '<div class="empty-state">Нет комнат. Создайте первую!</div>';
        return;
      }
      list.innerHTML = '';
      data.rooms.forEach(room => {
        const el = document.createElement('div');
        el.className = 'conf-room-card';
        el.innerHTML = `
          <div class="conf-room-info">
            <div class="conf-room-name">${esc(room.name)}</div>
            <div class="conf-room-meta">🔑 ${room.id} · 👥 ${room.member_count || 0}</div>
          </div>
          <button class="btn btn-primary btn-sm">Войти</button>`;
        el.querySelector('button').addEventListener('click', () => joinRoom(room.id));
        list.appendChild(el);
      });
    } catch {
      list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
  }

  function joinRoom(roomId) {
    if (!socket?.connected) {
      // Socket not ready yet — init and queue
      if (!socket) { tabConf.click(); }
      pendingJoinRoomId = roomId;
      showToast('Подключение...', 'info');
      return;
    }
    if (!isAuthenticated) {
      // Socket connected but auth not done yet — queue
      pendingJoinRoomId = roomId;
      showToast('Авторизация...', 'info');
      return;
    }
    socket.emit('join_room', { roomId });
  }

  function leaveRoom() {
    if (currentRoomId && socket) socket.emit('leave_room', { roomId: currentRoomId });
    confManager?.clearAllPeers?.();
    try { confManager?.localStream?.getTracks().forEach(t => t.stop()); } catch {}
    CryptoManager.reset();
    currentRoomId = null;
    window.myRole = null;

    document.getElementById('confRoom').style.display = 'none';
    document.getElementById('confLobby').style.display = '';
    // Reset video grid
    document.getElementById('video-grid').innerHTML = `
      <div id="local-video-container" class="video-container local">
        <video id="local-video" autoplay muted playsinline></video>
        <div class="video-label"><span id="localVideoName">Вы</span><span class="video-muted-icon" id="localMutedIcon">🔇</span></div>
      </div>`;
    document.getElementById('confChatMessages').innerHTML = '';
    document.getElementById('participantsList').innerHTML = '';
    loadRooms();
  }

  function showConfRoom() {
    document.getElementById('confLobby').style.display = 'none';
    document.getElementById('confRoom').style.display = 'flex';
  }

  // ============ Participants ============
  function renderParticipant(socketId, firstName) {
    const list = document.getElementById('participantsList');
    const el = document.createElement('div');
    el.className = 'participant-item';
    el.id = 'part-' + socketId;
    el.textContent = '👤 ' + firstName;
    list.appendChild(el);
  }

  // ============ Chat ============
  function appendChat(name, text, isSystem) {
    const el = document.getElementById('confChatMessages');
    const div = document.createElement('div');
    div.className = isSystem ? 'chat-msg system' : 'chat-msg';
    div.innerHTML = isSystem ? `<span class="chat-system">${esc(text)}</span>` : `<b>${esc(name)}</b>: ${esc(text)}`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  // ============ Button handlers ============

  document.getElementById('btnNewRoom').addEventListener('click', () => {
    document.getElementById('confCreateModal').style.display = 'flex';
    document.getElementById('confRoomName').focus();
  });

  document.getElementById('confCreateClose').addEventListener('click', () => {
    document.getElementById('confCreateModal').style.display = 'none';
  });

  document.getElementById('btnCreateConfirm').addEventListener('click', async () => {
    const name = document.getElementById('confRoomName').value.trim();
    if (!name) return;
    const initData = window.Telegram?.WebApp?.initData;
    try {
      const resp = await fetch('/api/conf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(initData ? { 'x-telegram-init-data': initData } : {}) },
        body: JSON.stringify({ name }),
      });
      const data = await resp.json();
      if (data.room) {
        document.getElementById('confCreateModal').style.display = 'none';
        document.getElementById('confRoomName').value = '';
        joinRoom(data.room.id);
      }
    } catch { showToast('Ошибка создания комнаты', 'error'); }
  });

  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    const id = document.getElementById('confJoinId').value.trim().toUpperCase();
    if (id) { document.getElementById('confJoinId').value = ''; joinRoom(id); }
  });

  document.getElementById('btnLeaveRoom').addEventListener('click', leaveRoom);
  document.getElementById('btnLeaveConf').addEventListener('click', leaveRoom);

  document.getElementById('btnToggleMic').addEventListener('click', async () => {
    if (!confManager) return;
    const enabled = await confManager.toggleAudio();
    document.getElementById('btnToggleMic').classList.toggle('muted', !enabled);
    document.getElementById('localMutedIcon').style.display = enabled ? 'none' : '';
  });

  document.getElementById('btnToggleVideo').addEventListener('click', async () => {
    if (!confManager) return;
    const enabled = await confManager.toggleVideo();
    document.getElementById('btnToggleVideo').classList.toggle('muted', !enabled);
  });

  document.getElementById('btnToggleScreen').addEventListener('click', async () => {
    if (!confManager) return;
    if (confManager.screenSharing) await confManager.stopScreenShare();
    else await confManager.startScreenShare();
  });

  document.getElementById('btnRaiseHand').addEventListener('click', () => {
    if (!confManager || !currentRoomId || !socket) return;
    confManager.handRaised = !confManager.handRaised;
    socket.emit('hand_raise', { roomId: currentRoomId, raised: confManager.handRaised });
    document.getElementById('btnRaiseHand').classList.toggle('active', confManager.handRaised);
  });

  document.getElementById('btnToggleParticipants').addEventListener('click', () => {
    const sb = document.getElementById('participantsSidebar');
    sb.style.display = sb.style.display === 'none' ? '' : 'none';
    document.getElementById('chatSidebar').style.display = 'none';
  });

  document.getElementById('btnToggleChat').addEventListener('click', () => {
    const sb = document.getElementById('chatSidebar');
    sb.style.display = sb.style.display === 'none' ? '' : 'none';
    document.getElementById('participantsSidebar').style.display = 'none';
  });

  document.getElementById('btnSendConfMsg').addEventListener('click', sendMsg);
  document.getElementById('confChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

  async function sendMsg() {
    if (!socket || !currentRoomId) return;
    const input = document.getElementById('confChatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const encrypted = await CryptoManager.encrypt(text);
    socket.emit('send_message', { roomId: currentRoomId, content: encrypted });
  }

  // ============ DEVICE SETTINGS ============
  let micTestStream = null;
  let micAnalyser = null;
  let micTestAnim = null;

  document.getElementById('btnDeviceSettings').addEventListener('click', async () => {
    const modal = document.getElementById('deviceSettingsModal');
    modal.style.display = 'flex';
    await populateDevices();
  });

  document.getElementById('deviceSettingsClose').addEventListener('click', () => {
    document.getElementById('deviceSettingsModal').style.display = 'none';
    stopMicTest();
  });

  async function populateDevices() {
    try {
      // Need permission first to get labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      const selMic = document.getElementById('selectMic');
      const selSpk = document.getElementById('selectSpeaker');
      const selCam = document.getElementById('selectCamera');

      selMic.innerHTML = '';
      selSpk.innerHTML = '';
      selCam.innerHTML = '';

      const savedMic = localStorage.getItem('conf_mic');
      const savedSpk = localStorage.getItem('conf_speaker');
      const savedCam = localStorage.getItem('conf_camera');

      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || (d.kind + ' ' + d.deviceId.slice(0, 8));
        if (d.kind === 'audioinput') { selMic.appendChild(opt); if (d.deviceId === savedMic) opt.selected = true; }
        if (d.kind === 'audiooutput') { selSpk.appendChild(opt); if (d.deviceId === savedSpk) opt.selected = true; }
        if (d.kind === 'videoinput') { selCam.appendChild(opt); if (d.deviceId === savedCam) opt.selected = true; }
      });

      if (!selSpk.options.length) {
        const opt = document.createElement('option');
        opt.textContent = 'По умолчанию (браузер не поддерживает выбор)';
        selSpk.appendChild(opt);
        selSpk.disabled = true;
      } else {
        selSpk.disabled = false;
      }
    } catch (e) {
      showToast('Не удалось получить список устройств', 'error');
    }
  }

  document.getElementById('btnTestMic').addEventListener('click', async () => {
    if (micTestStream) { stopMicTest(); return; }
    const micId = document.getElementById('selectMic').value;
    try {
      micTestStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true }
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(micTestStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      src.connect(micAnalyser);
      const data = new Uint8Array(micAnalyser.frequencyBinCount);
      const bar = document.getElementById('micLevel');
      document.getElementById('btnTestMic').textContent = '⏹ Стоп';

      function draw() {
        if (!micAnalyser) return;
        micAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        bar.style.width = Math.min(100, avg * 1.5) + '%';
        micTestAnim = requestAnimationFrame(draw);
      }
      draw();
    } catch { showToast('Ошибка доступа к микрофону', 'error'); }
  });

  function stopMicTest() {
    if (micTestStream) { micTestStream.getTracks().forEach(t => t.stop()); micTestStream = null; }
    if (micTestAnim) { cancelAnimationFrame(micTestAnim); micTestAnim = null; }
    micAnalyser = null;
    document.getElementById('micLevel').style.width = '0%';
    document.getElementById('btnTestMic').textContent = '🎤 Тест';
  }

  document.getElementById('btnApplyDevices').addEventListener('click', async () => {
    const micId = document.getElementById('selectMic').value;
    const spkId = document.getElementById('selectSpeaker').value;
    const camId = document.getElementById('selectCamera').value;

    localStorage.setItem('conf_mic', micId);
    localStorage.setItem('conf_speaker', spkId);
    localStorage.setItem('conf_camera', camId);

    // Apply speaker to all remote videos
    if (spkId) {
      document.querySelectorAll('#video-grid video').forEach(v => {
        if (v.setSinkId) v.setSinkId(spkId).catch(() => {});
      });
    }

    // Switch mic if in conference
    if (confManager && confManager.localStream) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = confManager.localStream.getAudioTracks()[0];
        if (oldTrack) {
          confManager.localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        confManager.localStream.addTrack(newTrack);
        // Replace in all peer connections
        confManager.peers.forEach(peer => {
          const sender = peer.pc?.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) sender.replaceTrack(newTrack);
        });
        confManager.audioEnabled = true;
      } catch { showToast('Не удалось сменить микрофон', 'error'); }
    }

    stopMicTest();
    document.getElementById('deviceSettingsModal').style.display = 'none';
    showToast('Устройства применены', 'success');
  });

  // ============ SHARE LINKS ============
  const BOT_USERNAME = 'PlanDayProbot';
  const WEBAPP_URL = window.location.origin;

  document.getElementById('btnInviteRoom').addEventListener('click', () => {
    if (!currentRoomId) return;
    const browserLink = WEBAPP_URL + '/?conf=' + currentRoomId;
    const tgLink = 'https://t.me/' + BOT_USERNAME + '?start=conf_' + currentRoomId;

    document.getElementById('shareBrowserLink').value = browserLink;
    document.getElementById('shareTgLink').value = tgLink;
    document.getElementById('shareLinksModal').style.display = 'flex';
  });

  document.getElementById('shareLinksClose').addEventListener('click', () => {
    document.getElementById('shareLinksModal').style.display = 'none';
  });

  document.getElementById('btnCopyBrowserLink').addEventListener('click', () => {
    const link = document.getElementById('shareBrowserLink').value;
    navigator.clipboard.writeText(link).then(() => showToast('Ссылка скопирована!', 'success'));
  });

  document.getElementById('btnCopyTgLink').addEventListener('click', () => {
    const link = document.getElementById('shareTgLink').value;
    navigator.clipboard.writeText(link).then(() => showToast('Ссылка скопирована!', 'success'));
  });

  document.getElementById('btnShareTelegram').addEventListener('click', () => {
    const link = document.getElementById('shareBrowserLink').value;
    const text = '📹 Присоединяйся к видеоконференции!\n' + link;
    window.open('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('📹 Присоединяйся к видеоконференции!'), '_blank');
  });

  document.getElementById('btnShareWhatsApp').addEventListener('click', () => {
    const link = document.getElementById('shareBrowserLink').value;
    window.open('https://wa.me/?text=' + encodeURIComponent('📹 Присоединяйся к видеоконференции!\n' + link), '_blank');
  });

  // ============ APPLY SAVED DEVICES on media init ============
  const origInitMedia = ConferenceManager.prototype.initMedia;
  ConferenceManager.prototype.initMedia = async function(audio, video) {
    const micId = localStorage.getItem('conf_mic');
    const camId = localStorage.getItem('conf_camera');
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audio ? {
          deviceId: micId ? { exact: micId } : undefined,
          echoCancellation: true, noiseSuppression: true, autoGainControl: true
        } : false,
        video: video ? {
          deviceId: camId ? { exact: camId } : undefined,
          width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }
        } : false
      });
      this.audioEnabled = audio && this.localStream.getAudioTracks().length > 0;
      this.videoEnabled = video && this.localStream.getVideoTracks().length > 0;
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = this.localStream;
      this.updateLocalVideoUI();

      // Apply saved speaker
      const spkId = localStorage.getItem('conf_speaker');
      if (spkId) {
        document.querySelectorAll('#video-grid video').forEach(v => {
          if (v.setSinkId) v.setSinkId(spkId).catch(() => {});
        });
      }
      return true;
    } catch (err) {
      console.error('Media error (device select):', err);
      return origInitMedia.call(this, audio, video);
    }
  };

  // Deep link: ?conf=ROOMID — auto-join when WebApp opened with conference link
  const confParam = new URLSearchParams(window.location.search).get('conf');
  if (confParam) {
    pendingJoinRoomId = confParam.toUpperCase();
    // Immediately switch to conf tab — don't wait for DOMContentLoaded
    function activateConfTab() {
      // Hide planner UI
      const quickAdd = document.querySelector('.quick-add');
      const taskList = document.getElementById('taskList');
      const statsBar = document.getElementById('statsBar');
      if (quickAdd) quickAdd.style.display = 'none';
      if (taskList) taskList.style.display = 'none';
      if (statsBar) statsBar.style.display = 'none';
      // Show conf panel
      confPanel.style.display = 'flex';
      confPanel.style.flexDirection = 'column';
      confPanel.style.flex = '1';
      confPanel.style.overflow = 'hidden';
      // Mark tab active
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tabConf.classList.add('active');
      // Init socket and load rooms
      if (!socket) initSocket();
      loadRooms();
    }
    // Try immediately, and also after a delay as fallback
    activateConfTab();
    setTimeout(activateConfTab, 100);
    setTimeout(activateConfTab, 500);
  }

  // ============ Helpers ============
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function authAsGuest(name) {
    const guestId = localStorage.getItem('guest_id') || ('guest_' + Math.random().toString(36).slice(2, 10));
    localStorage.setItem('guest_id', guestId);
    localStorage.setItem('guest_name', name);
    myTgId = guestId;
    myFirstName = name;
    socket.emit('auth', { telegramId: guestId, username: '', firstName: name, guest: true });
  }

  function showGuestNameModal() {
    const modal = document.getElementById('guestNameModal');
    if (!modal) {
      // Fallback — create modal dynamically if not in HTML
      const name = prompt('Введите ваше имя:', localStorage.getItem('guest_name') || '') || 'Гость';
      authAsGuest(name);
      return;
    }
    modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;align-items:center;justify-content:center;padding:16px';
    const input = document.getElementById('guestNameInput');
    const btn = document.getElementById('guestNameSubmit');
    // Pre-fill with saved name
    const saved = localStorage.getItem('guest_name');
    if (saved) input.value = saved;
    setTimeout(() => { input.focus(); input.select(); }, 100);
    function submit() {
      const name = input.value.trim();
      if (!name) { input.style.borderColor = '#f44'; input.focus(); return; }
      modal.style.display = 'none';
      authAsGuest(name);
    }
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  }

  function showToast(msg, type = 'info') {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 16px;border-radius:8px;z-index:9999;font-size:13px;max-width:280px;text-align:center;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

})();
