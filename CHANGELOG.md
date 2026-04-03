# Changelog — Alpha Planner

## v3.1.0 (2026-04-03)
- Fix: AI Tools text handlers connected to main bot
- Fix: HF_TOKEN added — all 7 AI tools now functional
- Fix: Photo handler for Gemini Vision, Upscale, BG removal
- Added: All API keys configured (DeepSeek, Gemini, HuggingFace)

## v3.0.0 (2026-04-03)
- NEW: AI Tools module (/aitools) — 7 instruments:
  - Image generation (Pollinations.ai, no key)
  - Text-to-Speech (Edge TTS, no key)
  - DeepSeek AI chat (backup AI)
  - Photo analysis (Google Gemini Vision)
  - Image upscale (Real-ESRGAN via HuggingFace)
  - Background removal (BRIA RMBG via HuggingFace)
  - Video generation (AnimateDiff via HuggingFace, beta)
- NEW: Dream Planner (/dreams) — goals with AI coaching
  - Set goals with deadlines and categories
  - AI breaks goals into steps (Groq)
  - Daily AI advice cron (9:00 UTC)
  - 9 categories (business, finance, health, education, etc.)
- NEW: Period Planner (/planner)
  - Plans for day/week/month/3m/6m/year
  - Progress tracking with percentage bars
  - Auto-carry undone items to new period
  - Reminder chain when period ends
- NEW: Daily Routines (/daily)
  - Recurring daily tasks with progress bar
  - Resets every day
- NEW: Admin Panel (/admin)
  - Statistics dashboard
  - User list with pagination
  - CSV export
  - Broadcast to all users
  - Server settings view
- NEW: Group admin system (/gs_admin)
  - TG chat admins auto-synced as bot admins
  - Add/remove admins by @username or TG ID
  - Owner (who added bot) has highest rights
- NEW: Group commands
  - /task, /assign, /list, /board, /done, /mytasks, /stats
  - /call — instant video call
  - /meet 15:00 Topic — schedule conference
  - /gs_settings — group settings
- NEW: Multilingual support (10 languages)
  - EN, RU, ES, FR, DE, ZH, JA, KO, PT, HI, TR
  - Auto-detect from Telegram language
  - Browser conference + bot translated
- Fix: Group /start shows full command list
- Fix: Conference links in message text (not only buttons)
- Fix: DM button in all group messages

## v2.5.0 (2026-03-31)
- NEW: Speaker/earpiece toggle button in conference
- NEW: Screen share container in join.html
- NEW: Recording converts to MP4 (FFmpeg server-side)
- Fix: Screen share display for browser users
- Fix: applyTranslations wrapped in try-catch
- Fix: Screen button hidden on mobile

## v2.4.0 (2026-03-31)
- NEW: Audio processing pipeline (HPF 80Hz + LPF 8kHz + Compressor 4:1 + Noise Gate)
- NEW: Muted detection — Your mic is off! indicator
- NEW: Adaptive bitrate (auto-adjust based on RTT/loss)
- NEW: Keyboard shortcuts (M/V/H/R/Esc/Space)
- NEW: Conference timer
- NEW: Fullscreen mode
- NEW: Pin video on double-click
- NEW: Sound notifications (join/leave/chat)
- NEW: Emoji reactions with floating animation
- NEW: Chat timestamps
- Fix: Volume badge selector fixed
- Fix: Auto-reconnect with intentional leave flag

## v2.3.0 (2026-03-30)
- NEW: Conference admin panel (admin code, force mute, IP ban, roles)
- NEW: Mobile Telegram-style participant list
- NEW: Quality stats popup (ping, loss, bitrate, codec)
- NEW: Push-to-talk mode (hold Space)
- NEW: Speaker view (auto-focus on speaker)
- NEW: Local recording (MediaRecorder)
- NEW: Media preview before join (mic test + camera)
- Fix: conference.js — showToast safety, ICE queuing, peer cleanup, replaceTrack
- Fix: Duplicate participants on reconnect

## v2.2.0 (2026-03-29)
- NEW: Browser conference page (join.html)
- NEW: Guest auth for browser users
- NEW: Chat inside conference rooms
- NEW: Participant list with volume control (0-300%)
- NEW: Audio level indicators per participant
- NEW: Avatar circles with initials
- NEW: Onboarding tips overlay
- Fix: WebRTC ICE candidate event name (webrtc_ice → webrtc_ice_candidate)
- Fix: TURN server installed (coturn) + firewall ports opened

## v2.1.0 (2026-03-29)
- NEW: TURN server (coturn on port 3478)
- NEW: Device settings (mic/speaker/camera selection + test)
- NEW: Share links modal (browser + Telegram)
- Fix: conference.js critical bugs (6 fixes)

## v2.0.0 (2026-03-29)
- NEW: Video conferences (WebRTC + Socket.IO signaling)
- NEW: conference.js — full WebRTC peer management
- NEW: signaling.js — server-side WebRTC signaling
- NEW: meet.js — /meet command, scheduled conferences, RSVP
- NEW: alerts.js — task escalation alerts + meet reminders
- NEW: crypto.js — E2E encryption for conference chat

## v1.5.0 (2026-03-28)
- NEW: Bot styles (8 types: friendly, business, coach, gentle, bold, patsansky, brash, partner)
- NEW: Timezone quick select (Russian cities + GMT)
- Fix: AI response cleanup (strip markdown, special chars)
- Fix: Bot group behavior (private-only commands blocked in groups)

## v1.0.0 (2026-03-26)
- Initial release
- AI secretary (Groq Llama 3.3)
- Task management (create, move, done, delete)
- Habits tracker with streaks
- Voice messages (Whisper STT)
- Morning/evening digests
- Secretary name and style customization
