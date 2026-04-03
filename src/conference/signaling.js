// WebRTC Signaling for Alpha Planner Conference
// Adapted from TeleMeet, uses alpha-planner DB (users.id, not users.telegram_id)

const activeRooms = new Map(); // roomId -> Map<socketId, { userId (db id), tgId, username, firstName }>
const socketUsers = new Map(); // socketId -> user data

function initSignaling(io, db) {
  io.on('connection', (socket) => {
    // --- Auth ---
    socket.on('auth', ({ telegramId, username, firstName, guest }) => {
      console.log('[SIG] auth:', firstName, telegramId, guest?'GUEST':'TG');
      if (!telegramId) { socket.emit('auth_error', { message: 'No telegram ID' }); return; }

      // Guest mode — browser access without Telegram
      if (guest || String(telegramId).startsWith('guest_')) {
        socketUsers.set(socket.id, {
          userId: 'g_' + telegramId,  // string prefix to avoid DB conflicts
          tgId: telegramId,
          username: '',
          firstName: firstName || 'Гость',
          isGuest: true,
        });
        socket.emit('auth_success', { userId: telegramId, dbId: null });
        return;
      }

      // Regular Telegram user
      const user = db.ensureUser({ id: telegramId, username, first_name: firstName });
      if (!user) { socket.emit('auth_error', { message: 'User not found' }); return; }

      socketUsers.set(socket.id, {
        userId: user.id,
        tgId: telegramId,
        username: username || '',
        firstName: firstName || 'User',
      });

      socket.emit('auth_success', { userId: telegramId, dbId: user.id });
    });

    // --- Join Room ---
    socket.on('join_room', ({ roomId }) => {
      console.log('[SIG] join_room:', roomId, socketUsers.get(socket.id)?.firstName);
      const userData = socketUsers.get(socket.id);
      if (!userData) { socket.emit('error_msg', { message: 'Not authenticated' }); return; }

      const room = db.getConfRoom(roomId);
      if (!room || !room.is_active) { socket.emit('error_msg', { message: 'Комната не найдена или закрыта' }); return; }

      // Check IP ban
      var clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address;
      if (db.isIpBanned(roomId, clientIp)) {
        socket.emit('error_msg', { message: 'Вы заблокированы в этой комнате' });
        return;
      }

      // Guests skip DB member checks
      if (!userData.isGuest) {
        const existingMember = db.getConfMember(roomId, userData.userId);
        if (existingMember && existingMember.is_kicked) {
          socket.emit('error_msg', { message: 'Вы исключены из этой комнаты' });
          return;
        }
        if (room.is_locked && !existingMember) {
          socket.emit('error_msg', { message: 'Комната заблокирована' });
          return;
        }
        if (!existingMember) {
          const isCreator = room.created_by === userData.userId;
          db.addConfMember(roomId, userData.userId, isCreator ? 'admin' : 'user');
        }
      } else if (room.is_locked) {
        socket.emit('error_msg', { message: 'Комната закрыта для гостей' });
        return;
      }

      socket.join(roomId);

      if (!activeRooms.has(roomId)) activeRooms.set(roomId, new Map());
      const roomParticipants = activeRooms.get(roomId);

      // Убираем старое соединение этого пользователя (по tgId для надёжности)
      const oldSockets = [];
      roomParticipants.forEach((p, sid) => {
        if (p.tgId === userData.tgId && sid !== socket.id) oldSockets.push(sid);
      });
      for (const oldSid of oldSockets) {
        roomParticipants.delete(oldSid);
        io.to(roomId).emit('peer_left', { socketId: oldSid, userId: userData.tgId, firstName: userData.firstName });
        const oldSocket = io.sockets.sockets.get(oldSid);
        if (oldSocket) oldSocket.leave(roomId);
      }

      roomParticipants.set(socket.id, { ...userData, socketId: socket.id });

      const memberInfo = userData.isGuest ? null : db.getConfMember(roomId, userData.userId);

      // Уведомляем существующих участников
      console.log('[SIG] emitting peer_joined to room', roomId, 'for', userData.firstName);
      socket.to(roomId).emit('peer_joined', {
        socketId: socket.id,
        userId: userData.tgId,
        username: userData.username,
        firstName: userData.firstName,
        role: memberInfo ? memberInfo.role : 'user',
      });

      // Список участников для нового пользователя
      const participants = [];
      roomParticipants.forEach((p, sid) => {
        if (sid !== socket.id) {
          const pm = p.isGuest ? null : db.getConfMember(roomId, p.userId);
          participants.push({
            socketId: sid,
            userId: p.tgId,
            username: p.username,
            firstName: p.firstName,
            role: pm ? pm.role : 'user',
          });
        }
      });

      socket.emit('room_joined', {
        roomId,
        roomName: room.name,
        participants,
        role: memberInfo ? memberInfo.role : 'user',
        isLocked: room.is_locked,
      });

      if (!userData.isGuest) {
        try {
          const sysMsg = db.addConfMessage(roomId, userData.userId, `${userData.firstName} присоединился`, 'system');
          io.to(roomId).emit('chat_message', sysMsg);
        } catch(e) {}
      }
    });

    // --- WebRTC Signaling ---
    socket.on('webrtc_offer', ({ targetSocketId, offer, roomId }) => {
      console.log('[SIG] offer from', socketUsers.get(socket.id)?.firstName, 'to', socketUsers.get(targetSocketId)?.firstName);
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      let role = 'user';
      if (roomId && !userData.isGuest) {
        const m = db.getConfMember(roomId, userData.userId);
        if (m) role = m.role;
      }
      io.to(targetSocketId).emit('webrtc_offer', {
        senderSocketId: socket.id,
        userId: userData.tgId,
        username: userData.username,
        firstName: userData.firstName,
        role,
        offer,
      });
    });

    socket.on('webrtc_answer', ({ targetSocketId, answer }) => {
      console.log('[SIG] answer from', socketUsers.get(socket.id)?.firstName, 'to', socketUsers.get(targetSocketId)?.firstName);
      io.to(targetSocketId).emit('webrtc_answer', { senderSocketId: socket.id, answer });
    });

    socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate }) => {
      console.log('[SIG] ice from', socketUsers.get(socket.id)?.firstName);
      io.to(targetSocketId).emit('webrtc_ice_candidate', { senderSocketId: socket.id, candidate });
    });

    // --- Screen share ---
    socket.on('screen_share_started', ({ roomId }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      socket.to(roomId).emit('screen_share_started', { socketId: socket.id, userId: userData.tgId, firstName: userData.firstName });
    });

    socket.on('screen_share_stopped', ({ roomId }) => {
      socket.to(roomId).emit('screen_share_stopped', { socketId: socket.id });
    });

    // --- Chat ---
    socket.on('send_message', ({ roomId, content, replyTo }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      if (!userData.isGuest) {
        const member = db.getConfMember(roomId, userData.userId);
        if (!member || member.is_muted_by_admin) { socket.emit('error_msg', { message: 'Вы замьючены' }); return; }
      }
      const chatMsg = { sender_id: userData.isGuest ? 0 : userData.userId, content, type: 'text', firstName: userData.firstName, socketId: socket.id };
      try {
        const msg = db.addConfMessage(roomId, userData.isGuest ? 0 : userData.userId, content, 'text', replyTo || null);
        chatMsg.id = msg.id;
        chatMsg.created_at = msg.created_at;
      } catch(e) {}
      // Send to everyone EXCEPT the sender (sender already shows it locally)
      socket.to(roomId).emit('chat_message', chatMsg);
    });

    // --- Admin: Kick ---
    socket.on('kick_user', ({ roomId, targetUserId }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const member = db.getConfMember(roomId, userData.userId);
      if (!member || !['admin', 'helper'].includes(member.role)) return;

      // targetUserId = tgId, нужен db userId
      const targetDbId = db.getUserIdByTgId(targetUserId);
      if (!targetDbId) return;

      const targetMember = db.getConfMember(roomId, targetDbId);
      if (!targetMember || targetMember.role === 'admin') return;

      db.kickConfMember(roomId, targetDbId);

      const roomParticipants = activeRooms.get(roomId);
      if (roomParticipants) {
        roomParticipants.forEach((p, sid) => {
          if (p.userId === targetDbId) {
            io.to(sid).emit('kicked', { roomId });
            const s = io.sockets.sockets.get(sid);
            if (s) s.leave(roomId);
            roomParticipants.delete(sid);
          }
        });
      }
      io.to(roomId).emit('user_kicked', { userId: targetUserId });
      const sysMsg = db.addConfMessage(roomId, userData.userId, 'Участник исключён', 'system');
      io.to(roomId).emit('chat_message', sysMsg);
    });

    // --- Admin: Mute ---
    socket.on('mute_user', ({ roomId, targetUserId, muted }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const member = db.getConfMember(roomId, userData.userId);
      if (!member || !['admin', 'helper'].includes(member.role)) return;

      const targetDbId = db.getUserIdByTgId(targetUserId);
      if (!targetDbId) return;

      db.setConfMutedByAdmin(roomId, targetDbId, muted);
      const roomParticipants = activeRooms.get(roomId);
      if (roomParticipants) {
        roomParticipants.forEach((p, sid) => {
          if (p.userId === targetDbId) io.to(sid).emit('admin_mute', { muted });
        });
      }
      io.to(roomId).emit('user_muted', { userId: targetUserId, muted });
    });

    // --- Admin: Set Role ---
    socket.on('set_role', ({ roomId, targetUserId, role }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const member = db.getConfMember(roomId, userData.userId);
      if (!member || member.role !== 'admin') return;
      if (!['admin', 'helper', 'user'].includes(role)) return;

      const targetDbId = db.getUserIdByTgId(targetUserId);
      if (!targetDbId) return;

      db.setConfMemberRole(roomId, targetDbId, role);
      io.to(roomId).emit('role_changed', { userId: targetUserId, role });
    });

    // --- Lock room ---
    socket.on('lock_room', ({ roomId, locked }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const member = db.getConfMember(roomId, userData.userId);
      if (!member || member.role !== 'admin') return;
      db.lockConfRoom(roomId, locked);
      io.to(roomId).emit('room_locked', { locked });
    });

    // --- Delete message ---
    socket.on('delete_message', ({ roomId, messageId }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const member = db.getConfMember(roomId, userData.userId);
      if (!member || !['admin', 'helper'].includes(member.role)) return;
      db.deleteConfMessage(messageId);
      io.to(roomId).emit('message_deleted', { messageId });
    });

    // --- Media state ---
    socket.on('media_state', ({ roomId, audio, video, screenShare }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      socket.to(roomId).emit('peer_media_state', { socketId: socket.id, userId: userData.tgId, audio, video, screenShare });
    });

    // --- Hand raise ---
    socket.on('hand_raise', ({ roomId, raised }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      io.to(roomId).emit('hand_raised', { socketId: socket.id, userId: userData.tgId, firstName: userData.firstName, raised });
    });

    // --- Reactions ---
    socket.on('reaction', ({ roomId, emoji }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      io.to(roomId).emit('reaction', { userId: userData.tgId, firstName: userData.firstName, emoji });
    });

    // --- Admin: Authenticate with admin code ---
    // --- Force mute check — block unmute if force muted ---
    socket.on('try_unmute', ({ roomId }) => {
      const userData = socketUsers.get(socket.id);
      if (userData && userData.forceMuted) {
        socket.emit('force_muted', { muted: true, by: 'Администратор' });
      }
    });

    // --- Admin: Authenticate with admin code ---
    socket.on('admin_auth', ({ roomId, code }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData) return;
      const room = db.getConfRoom(roomId);
      if (!room || room.admin_code !== code) {
        socket.emit('admin_auth_result', { success: false, message: 'Неверный код' });
        return;
      }
      // Grant admin role
      userData.role = 'admin';
      if (!userData.isGuest) {
        try { db.addConfMember(roomId, userData.userId, 'admin'); } catch(e) {
          try { db.setConfMemberRole(roomId, userData.userId, 'admin'); } catch(e2) {}
        }
      }
      socket.emit('admin_auth_result', { success: true, role: 'admin' });
      io.to(roomId).emit('role_changed', { socketId: socket.id, userId: userData.tgId, firstName: userData.firstName, role: 'admin' });
    });

    // --- Admin: Force mute (user can't unmute) ---
    socket.on('admin_force_mute', ({ roomId, targetSocketId, muted }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData || userData.role !== 'admin') { socket.emit('error_msg', { message: 'Нет прав' }); return; }
      const targetData = socketUsers.get(targetSocketId);
      if (!targetData) return;
      targetData.forceMuted = muted;
      io.to(targetSocketId).emit('force_muted', { muted, by: userData.firstName });
      io.to(roomId).emit('peer_force_muted', { socketId: targetSocketId, firstName: targetData.firstName, muted });
    });

    // --- Admin: Ban user by IP ---
    socket.on('admin_ban', ({ roomId, targetSocketId }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData || userData.role !== 'admin') { socket.emit('error_msg', { message: 'Нет прав' }); return; }
      const targetData = socketUsers.get(targetSocketId);
      if (!targetData) return;
      // Get target IP
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        const ip = targetSocket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || targetSocket.handshake.address;
        if (ip) db.banIpInRoom(roomId, ip);
      }
      // Kick
      if (!targetData.isGuest) {
        try { db.kickConfMember(roomId, targetData.userId); } catch(e) {}
      }
      io.to(targetSocketId).emit('banned', { roomId, by: userData.firstName });
      if (targetSocket) targetSocket.leave(roomId);
      // Remove from room
      const roomParticipants = activeRooms.get(roomId);
      if (roomParticipants) roomParticipants.delete(targetSocketId);
      io.to(roomId).emit('peer_banned', { socketId: targetSocketId, firstName: targetData.firstName });
    });

    // --- Admin: Assign role ---
    socket.on('admin_set_role', ({ roomId, targetSocketId, role }) => {
      const userData = socketUsers.get(socket.id);
      if (!userData || userData.role !== 'admin') return;
      if (!['admin', 'helper', 'user'].includes(role)) return;
      const targetData = socketUsers.get(targetSocketId);
      if (!targetData) return;
      targetData.role = role;
      if (!targetData.isGuest) {
        try { db.setConfMemberRole(roomId, targetData.userId, role); } catch(e) {}
      }
      io.to(roomId).emit('role_changed', { socketId: targetSocketId, userId: targetData.tgId, firstName: targetData.firstName, role });
    });

    // --- Leave ---
    socket.on('leave_room', ({ roomId }) => {
      handleLeaveRoom(socket, roomId, db, io);
    });

    socket.on('disconnect', () => {
      activeRooms.forEach((participants, roomId) => {
        if (participants.has(socket.id)) handleLeaveRoom(socket, roomId, db, io);
      });
      socketUsers.delete(socket.id);
    });
  });
}

function handleLeaveRoom(socket, roomId, db, io) {
  const userData = socketUsers.get(socket.id);
  if (!userData) return;
  const roomParticipants = activeRooms.get(roomId);
  if (roomParticipants) {
    roomParticipants.delete(socket.id);
    if (roomParticipants.size === 0) activeRooms.delete(roomId);
  }
  socket.leave(roomId);
  io.to(roomId).emit('peer_left', { socketId: socket.id, userId: userData.tgId, firstName: userData.firstName });
  if (!userData.isGuest) {
    try {
      const sysMsg = db.addConfMessage(roomId, userData.userId, `${userData.firstName} вышел`, 'system');
      io.to(roomId).emit('chat_message', sysMsg);
    } catch {}
  }
}

module.exports = { initSignaling };
