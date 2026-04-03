// Conference i18n — 10 languages
var CONF_LANGS = {
  en: { name: 'English', flag: '🇬🇧' },
  ru: { name: 'Русский', flag: '🇷🇺' },
  es: { name: 'Español', flag: '🇪🇸' },
  fr: { name: 'Français', flag: '🇫🇷' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  zh: { name: '中文', flag: '🇨🇳' },
  ja: { name: '日本語', flag: '🇯🇵' },
  ko: { name: '한국어', flag: '🇰🇷' },
  pt: { name: 'Português', flag: '🇧🇷' },
  hi: { name: 'हिन्दी', flag: '🇮🇳' },
  tr: { name: 'Türkçe', flag: '🇹🇷' }
};

var CONF_I18N = {
  // ── Join screen ──
  joinTitle: {
    en:'Join conference',ru:'Присоединиться к конференции',es:'Unirse a la conferencia',fr:'Rejoindre la conférence',de:'Konferenz beitreten',zh:'加入会议',ja:'会議に参加',ko:'회의 참여',pt:'Entrar na conferência',hi:'कॉन्फ्रेंस में शामिल हों',tr:'Konferansa katıl'
  },
  enterName: {
    en:'Enter your name to join',ru:'Введите ваше имя, чтобы войти',es:'Ingrese su nombre para unirse',fr:'Entrez votre nom pour rejoindre',de:'Geben Sie Ihren Namen ein',zh:'输入您的姓名加入',ja:'参加するには名前を入力してください',ko:'참여하려면 이름을 입력하세요',pt:'Digite seu nome para entrar',hi:'शामिल होने के लिए अपना नाम दर्ज करें',tr:'Katılmak için adınızı girin'
  },
  yourName: {
    en:'Your name',ru:'Ваше имя',es:'Su nombre',fr:'Votre nom',de:'Ihr Name',zh:'您的姓名',ja:'お名前',ko:'이름',pt:'Seu nome',hi:'आपका नाम',tr:'Adınız'
  },
  join: {
    en:'Join',ru:'Войти',es:'Unirse',fr:'Rejoindre',de:'Beitreten',zh:'加入',ja:'参加',ko:'참여',pt:'Entrar',hi:'शामिल हों',tr:'Katıl'
  },
  room: {
    en:'Room',ru:'Комната',es:'Sala',fr:'Salle',de:'Raum',zh:'房间',ja:'ルーム',ko:'방',pt:'Sala',hi:'कमरा',tr:'Oda'
  },
  allowMic: {
    en:'Allow microphone access when joining',ru:'Разрешите доступ к микрофону при входе',es:'Permita el acceso al micrófono',fr:'Autorisez l\'accès au microphone',de:'Erlauben Sie den Mikrofonzugriff',zh:'加入时允许麦克风访问',ja:'マイクへのアクセスを許可してください',ko:'마이크 접근을 허용하세요',pt:'Permita o acesso ao microfone',hi:'माइक्रोफ़ोन एक्सेस की अनुमति दें',tr:'Mikrofon erişimine izin verin'
  },
  cameraLater: {
    en:'Camera can be enabled inside',ru:'Камеру можно включить внутри конференции',es:'La cámara se puede activar dentro',fr:'La caméra peut être activée à l\'intérieur',de:'Kamera kann drinnen aktiviert werden',zh:'可以在会议内开启摄像头',ja:'カメラは会議内で有効にできます',ko:'카메라는 내부에서 활성화할 수 있습니다',pt:'A câmera pode ser ativada dentro',hi:'कैमरा अंदर चालू किया जा सकता है',tr:'Kamera içeride açılabilir'
  },
  shareLink: {
    en:'Share link to invite participants',ru:'Поделитесь ссылкой чтобы пригласить участников',es:'Comparta el enlace para invitar',fr:'Partagez le lien pour inviter',de:'Teilen Sie den Link zum Einladen',zh:'分享链接邀请参与者',ja:'リンクを共有して参加者を招待',ko:'링크를 공유하여 참가자를 초대하세요',pt:'Compartilhe o link para convidar',hi:'प्रतिभागियों को आमंत्रित करने के लिए लिंक साझा करें',tr:'Katılımcıları davet etmek için bağlantıyı paylaşın'
  },

  // ── Preview ──
  micWorking: {
    en:'Microphone working',ru:'Микрофон работает',es:'Micrófono funcionando',fr:'Microphone fonctionne',de:'Mikrofon funktioniert',zh:'麦克风正常',ja:'マイク動作中',ko:'마이크 작동 중',pt:'Microfone funcionando',hi:'माइक्रोफ़ोन काम कर रहा है',tr:'Mikrofon çalışıyor'
  },
  micUnavailable: {
    en:'Microphone unavailable',ru:'Микрофон недоступен',es:'Micrófono no disponible',fr:'Microphone indisponible',de:'Mikrofon nicht verfügbar',zh:'麦克风不可用',ja:'マイクが利用できません',ko:'마이크를 사용할 수 없습니다',pt:'Microfone indisponível',hi:'माइक्रोफ़ोन उपलब्ध नहीं',tr:'Mikrofon kullanılamıyor'
  },
  camera: {
    en:'Camera',ru:'Камера',es:'Cámara',fr:'Caméra',de:'Kamera',zh:'摄像头',ja:'カメラ',ko:'카메라',pt:'Câmera',hi:'कैमरा',tr:'Kamera'
  },
  checking: {
    en:'Checking...',ru:'Проверка...',es:'Verificando...',fr:'Vérification...',de:'Überprüfung...',zh:'检查中...',ja:'確認中...',ko:'확인 중...',pt:'Verificando...',hi:'जांच हो रही है...',tr:'Kontrol ediliyor...'
  },

  // ── Controls ──
  sound: {
    en:'sound',ru:'звук',es:'sonido',fr:'son',de:'Ton',zh:'声音',ja:'音声',ko:'소리',pt:'som',hi:'ध्वनि',tr:'ses'
  },
  speakerOn: {
    en:'speaker',ru:'динамик',es:'altavoz',fr:'haut-parleur',de:'Lautsprecher',zh:'扬声器',ja:'スピーカー',ko:'스피커',pt:'alto-falante',hi:'स्पीकर',tr:'hoparlör'
  },
  speakerOff: {
    en:'earpiece',ru:'телефон',es:'auricular',fr:'écouteur',de:'Hörer',zh:'听筒',ja:'受話器',ko:'수화기',pt:'fone',hi:'ईयरपीस',tr:'kulaklık'
  },
  muteSound: {
    en:'mute',ru:'выкл. звук',es:'silenciar',fr:'couper',de:'stumm',zh:'静音',ja:'ミュート',ko:'음소거',pt:'mudo',hi:'म्यूट',tr:'sessize al'
  },
  video: {
    en:'video',ru:'видео',es:'vídeo',fr:'vidéo',de:'Video',zh:'视频',ja:'ビデオ',ko:'비디오',pt:'vídeo',hi:'वीडियो',tr:'video'
  },
  screen: {
    en:'screen',ru:'экран',es:'pantalla',fr:'écran',de:'Bildschirm',zh:'屏幕',ja:'画面',ko:'화면',pt:'tela',hi:'स्क्रीन',tr:'ekran'
  },
  record: {
    en:'record',ru:'запись',es:'grabar',fr:'enregistrer',de:'aufnehmen',zh:'录制',ja:'録画',ko:'녹화',pt:'gravar',hi:'रिकॉर्ड',tr:'kayıt'
  },
  leave: {
    en:'leave',ru:'выйти',es:'salir',fr:'quitter',de:'verlassen',zh:'离开',ja:'退出',ko:'나가기',pt:'sair',hi:'छोड़ें',tr:'çık'
  },
  more: {
    en:'more',ru:'ещё',es:'más',fr:'plus',de:'mehr',zh:'更多',ja:'その他',ko:'더보기',pt:'mais',hi:'और',tr:'daha'
  },

  // ── More menu ──
  raiseHand: {
    en:'Raise hand',ru:'Поднять руку',es:'Levantar la mano',fr:'Lever la main',de:'Hand heben',zh:'举手',ja:'挙手',ko:'손들기',pt:'Levantar a mão',hi:'हाथ उठाएं',tr:'El kaldır'
  },
  lowerHand: {
    en:'Lower hand',ru:'Опустить руку',es:'Bajar la mano',fr:'Baisser la main',de:'Hand senken',zh:'放下手',ja:'手を下ろす',ko:'손내리기',pt:'Abaixar a mão',hi:'हाथ नीचे करें',tr:'El indir'
  },
  pushToTalk: {
    en:'Push-to-talk',ru:'Push-to-talk',es:'Pulsar para hablar',fr:'Appuyez pour parler',de:'Push-to-talk',zh:'按键通话',ja:'プッシュトゥトーク',ko:'푸시투토크',pt:'Pressione para falar',hi:'बात करने के लिए दबाएं',tr:'Konuşmak için bas'
  },
  fullscreen: {
    en:'Fullscreen',ru:'Полный экран',es:'Pantalla completa',fr:'Plein écran',de:'Vollbild',zh:'全屏',ja:'全画面',ko:'전체화면',pt:'Tela cheia',hi:'पूर्ण स्क्रीन',tr:'Tam ekran'
  },
  adminPanel: {
    en:'Admin panel',ru:'Админ-панель',es:'Panel de administración',fr:'Panneau d\'administration',de:'Admin-Panel',zh:'管理面板',ja:'管理パネル',ko:'관리자 패널',pt:'Painel de administração',hi:'एडमिन पैनल',tr:'Yönetici paneli'
  },

  // ── Participants ──
  participants: {
    en:'Participants',ru:'Участники',es:'Participantes',fr:'Participants',de:'Teilnehmer',zh:'参与者',ja:'参加者',ko:'참가자',pt:'Participantes',hi:'प्रतिभागी',tr:'Katılımcılar'
  },
  you: {
    en:'You',ru:'Вы',es:'Tú',fr:'Vous',de:'Sie',zh:'你',ja:'あなた',ko:'나',pt:'Você',hi:'आप',tr:'Sen'
  },
  listening: {
    en:'listening',ru:'слушает',es:'escuchando',fr:'écoute',de:'hört zu',zh:'正在收听',ja:'聴いています',ko:'듣는 중',pt:'ouvindo',hi:'सुन रहा है',tr:'dinliyor'
  },
  speaking: {
    en:'speaking',ru:'говорит',es:'hablando',fr:'parle',de:'spricht',zh:'正在说话',ja:'話しています',ko:'말하는 중',pt:'falando',hi:'बोल रहा है',tr:'konuşuyor'
  },
  inviteLink: {
    en:'Invitation link',ru:'Ссылка-приглашение',es:'Enlace de invitación',fr:'Lien d\'invitation',de:'Einladungslink',zh:'邀请链接',ja:'招待リンク',ko:'초대 링크',pt:'Link de convite',hi:'आमंत्रण लिंक',tr:'Davet bağlantısı'
  },

  // ── Chat ──
  chat: {
    en:'Chat',ru:'Чат',es:'Chat',fr:'Discussion',de:'Chat',zh:'聊天',ja:'チャット',ko:'채팅',pt:'Chat',hi:'चैट',tr:'Sohbet'
  },
  message: {
    en:'Message...',ru:'Сообщение...',es:'Mensaje...',fr:'Message...',de:'Nachricht...',zh:'消息...',ja:'メッセージ...',ko:'메시지...',pt:'Mensagem...',hi:'संदेश...',tr:'Mesaj...'
  },

  // ── Settings ──
  settings: {
    en:'Device settings',ru:'Настройки устройств',es:'Configuración de dispositivos',fr:'Paramètres des appareils',de:'Geräteeinstellungen',zh:'设备设置',ja:'デバイス設定',ko:'장치 설정',pt:'Configurações de dispositivos',hi:'डिवाइस सेटिंग्स',tr:'Cihaz ayarları'
  },
  microphone: {
    en:'Microphone',ru:'Микрофон',es:'Micrófono',fr:'Microphone',de:'Mikrofon',zh:'麦克风',ja:'マイク',ko:'마이크',pt:'Microfone',hi:'माइक्रोफ़ोन',tr:'Mikrofon'
  },
  speaker: {
    en:'Speaker',ru:'Динамик',es:'Altavoz',fr:'Haut-parleur',de:'Lautsprecher',zh:'扬声器',ja:'スピーカー',ko:'스피커',pt:'Alto-falante',hi:'स्पीकर',tr:'Hoparlör'
  },
  testMic: {
    en:'Test',ru:'Тест',es:'Probar',fr:'Tester',de:'Testen',zh:'测试',ja:'テスト',ko:'테스트',pt:'Testar',hi:'परीक्षण',tr:'Test'
  },
  apply: {
    en:'Apply',ru:'Применить',es:'Aplicar',fr:'Appliquer',de:'Anwenden',zh:'应用',ja:'適用',ko:'적용',pt:'Aplicar',hi:'लागू करें',tr:'Uygula'
  },
  stop: {
    en:'Stop',ru:'Стоп',es:'Parar',fr:'Arrêter',de:'Stopp',zh:'停止',ja:'停止',ko:'중지',pt:'Parar',hi:'रुकें',tr:'Dur'
  },

  // ── Admin ──
  adminPanelTitle: {
    en:'Admin panel',ru:'Админ-панель',es:'Panel de administración',fr:'Panneau d\'administration',de:'Admin-Panel',zh:'管理面板',ja:'管理パネル',ko:'관리자 패널',pt:'Painel de administração',hi:'एडमिन पैनल',tr:'Yönetici paneli'
  },
  enterAdminCode: {
    en:'Enter admin code to get management rights',ru:'Введите код администратора для получения прав управления',es:'Ingrese el código de administrador',fr:'Entrez le code administrateur',de:'Geben Sie den Admin-Code ein',zh:'输入管理员代码获取管理权限',ja:'管理コードを入力してください',ko:'관리자 코드를 입력하세요',pt:'Digite o código de administrador',hi:'प्रबंधन अधिकार प्राप्त करने के लिए एडमिन कोड दर्ज करें',tr:'Yönetim hakları için yönetici kodunu girin'
  },
  adminCode: {
    en:'Admin code',ru:'Код админа',es:'Código de admin',fr:'Code admin',de:'Admin-Code',zh:'管理员代码',ja:'管理コード',ko:'관리자 코드',pt:'Código de admin',hi:'एडमिन कोड',tr:'Yönetici kodu'
  },
  youAreAdmin: {
    en:'You are an administrator',ru:'Вы — администратор',es:'Eres administrador',fr:'Vous êtes administrateur',de:'Sie sind Administrator',zh:'您是管理员',ja:'あなたは管理者です',ko:'당신은 관리자입니다',pt:'Você é administrador',hi:'आप प्रशासक हैं',tr:'Siz yöneticisiniz'
  },
  admin: {
    en:'Admin',ru:'Админ',es:'Admin',fr:'Admin',de:'Admin',zh:'管理员',ja:'管理者',ko:'관리자',pt:'Admin',hi:'एडमिन',tr:'Yönetici'
  },
  helper: {
    en:'Helper',ru:'Помощник',es:'Ayudante',fr:'Assistant',de:'Helfer',zh:'助手',ja:'ヘルパー',ko:'도우미',pt:'Ajudante',hi:'सहायक',tr:'Yardımcı'
  },
  participant: {
    en:'Participant',ru:'Участник',es:'Participante',fr:'Participant',de:'Teilnehmer',zh:'参与者',ja:'参加者',ko:'참가자',pt:'Participante',hi:'प्रतिभागी',tr:'Katılımcı'
  },

  // ── Toasts ──
  micConnected: {
    en:'Microphone connected',ru:'Микрофон подключён',es:'Micrófono conectado',fr:'Microphone connecté',de:'Mikrofon verbunden',zh:'麦克风已连接',ja:'マイク接続済み',ko:'마이크 연결됨',pt:'Microfone conectado',hi:'माइक्रोफ़ोन कनेक्टेड',tr:'Mikrofon bağlandı'
  },
  micUnavailableAllow: {
    en:'Microphone unavailable. Allow access in browser settings',ru:'Микрофон недоступен. Разрешите доступ в настройках браузера',es:'Micrófono no disponible. Permita el acceso',fr:'Microphone indisponible. Autorisez l\'accès',de:'Mikrofon nicht verfügbar. Zugriff erlauben',zh:'麦克风不可用。请在浏览器设置中允许访问',ja:'マイクが利用できません。ブラウザ設定でアクセスを許可してください',ko:'마이크를 사용할 수 없습니다. 브라우저 설정에서 허용하세요',pt:'Microfone indisponível. Permita o acesso',hi:'माइक्रोफ़ोन उपलब्ध नहीं। ब्राउज़र सेटिंग्स में एक्सेस की अनुमति दें',tr:'Mikrofon kullanılamıyor. Tarayıcı ayarlarından izin verin'
  },
  joined: {
    en:'joined',ru:'присоединился',es:'se unió',fr:'a rejoint',de:'ist beigetreten',zh:'加入了',ja:'が参加しました',ko:'참여했습니다',pt:'entrou',hi:'शामिल हुआ',tr:'katıldı'
  },
  left: {
    en:'left',ru:'вышел',es:'salió',fr:'est parti',de:'hat verlassen',zh:'离开了',ja:'が退出しました',ko:'나갔습니다',pt:'saiu',hi:'निकल गया',tr:'ayrıldı'
  },
  youLeft: {
    en:'You left the conference',ru:'Вы покинули конференцию',es:'Has dejado la conferencia',fr:'Vous avez quitté la conférence',de:'Sie haben die Konferenz verlassen',zh:'您已离开会议',ja:'会議を退出しました',ko:'회의에서 나갔습니다',pt:'Você saiu da conferência',hi:'आपने कॉन्फ्रेंस छोड़ दी',tr:'Konferanstan ayrıldınız'
  },
  linkCopied: {
    en:'Link copied!',ru:'Ссылка скопирована!',es:'¡Enlace copiado!',fr:'Lien copié !',de:'Link kopiert!',zh:'链接已复制！',ja:'リンクをコピーしました！',ko:'링크가 복사되었습니다!',pt:'Link copiado!',hi:'लिंक कॉपी हो गया!',tr:'Bağlantı kopyalandı!'
  },
  copyFailed: {
    en:'Failed to copy',ru:'Не удалось скопировать',es:'Error al copiar',fr:'Échec de la copie',de:'Kopieren fehlgeschlagen',zh:'复制失败',ja:'コピーに失敗しました',ko:'복사 실패',pt:'Falha ao copiar',hi:'कॉपी करने में विफल',tr:'Kopyalama başarısız'
  },
  settingsApplied: {
    en:'Settings applied',ru:'Настройки применены',es:'Configuración aplicada',fr:'Paramètres appliqués',de:'Einstellungen angewendet',zh:'设置已应用',ja:'設定が適用されました',ko:'설정이 적용되었습니다',pt:'Configurações aplicadas',hi:'सेटिंग्स लागू हो गईं',tr:'Ayarlar uygulandı'
  },
  recordStarted: {
    en:'Recording started',ru:'Запись начата',es:'Grabación iniciada',fr:'Enregistrement démarré',de:'Aufnahme gestartet',zh:'录制已开始',ja:'録画を開始しました',ko:'녹화가 시작되었습니다',pt:'Gravação iniciada',hi:'रिकॉर्डिंग शुरू हुई',tr:'Kayıt başladı'
  },
  recordSaved: {
    en:'Recording saved',ru:'Запись сохранена',es:'Grabación guardada',fr:'Enregistrement sauvegardé',de:'Aufnahme gespeichert',zh:'录制已保存',ja:'録画が保存されました',ko:'녹화가 저장되었습니다',pt:'Gravação salva',hi:'रिकॉर्डिंग सेव हो गई',tr:'Kayıt kaydedildi'
  },
  connected: {
    en:'Connected',ru:'Подключено',es:'Conectado',fr:'Connecté',de:'Verbunden',zh:'已连接',ja:'接続済み',ko:'연결됨',pt:'Conectado',hi:'कनेक्टेड',tr:'Bağlandı'
  },
  connecting: {
    en:'Connecting...',ru:'Подключение...',es:'Conectando...',fr:'Connexion...',de:'Verbindung...',zh:'连接中...',ja:'接続中...',ko:'연결 중...',pt:'Conectando...',hi:'कनेक्ट हो रहा है...',tr:'Bağlanıyor...'
  },
  disconnected: {
    en:'Disconnected',ru:'Отключено',es:'Desconectado',fr:'Déconnecté',de:'Getrennt',zh:'已断开',ja:'切断されました',ko:'연결 끊김',pt:'Desconectado',hi:'डिस्कनेक्टेड',tr:'Bağlantı kesildi'
  },
  pttMode: {
    en:'Push-to-talk: hold SPACE to speak',ru:'Push-to-talk: зажмите ПРОБЕЛ чтобы говорить',es:'Pulsar para hablar: mantenga ESPACIO',fr:'Appuyez pour parler: maintenez ESPACE',de:'Push-to-talk: LEERTASTE halten',zh:'按键通话：按住空格键说话',ja:'プッシュトゥトーク：スペースを押して話す',ko:'푸시투토크: 스페이스바를 눌러 말하세요',pt:'Pressione para falar: segure ESPAÇO',hi:'बात करने के लिए दबाएं: स्पेस दबाए रखें',tr:'Konuşmak için bas: BOŞLUK tuşunu basılı tutun'
  },
  normalMode: {
    en:'Normal microphone mode',ru:'Обычный режим микрофона',es:'Modo normal de micrófono',fr:'Mode microphone normal',de:'Normaler Mikrofonmodus',zh:'正常麦克风模式',ja:'通常マイクモード',ko:'일반 마이크 모드',pt:'Modo normal do microfone',hi:'सामान्य माइक्रोफ़ोन मोड',tr:'Normal mikrofon modu'
  },
  galleryView: {
    en:'Gallery view',ru:'Режим галереи',es:'Vista de galería',fr:'Vue galerie',de:'Galerieansicht',zh:'画廊视图',ja:'ギャラリービュー',ko:'갤러리 보기',pt:'Vista de galeria',hi:'गैलरी व्यू',tr:'Galeri görünümü'
  },
  speakerView: {
    en:'Speaker focus',ru:'Фокус на говорящего',es:'Enfoque en el orador',fr:'Focus sur l\'orateur',de:'Sprecherfokus',zh:'发言人焦点',ja:'スピーカーフォーカス',ko:'발표자 포커스',pt:'Foco no orador',hi:'स्पीकर फोकस',tr:'Konuşmacı odağı'
  },
  screenSharing: {
    en:'is sharing screen',ru:'демонстрирует экран',es:'está compartiendo pantalla',fr:'partage l\'écran',de:'teilt den Bildschirm',zh:'正在分享屏幕',ja:'画面を共有しています',ko:'화면을 공유하고 있습니다',pt:'está compartilhando a tela',hi:'स्क्रीन साझा कर रहा है',tr:'ekranını paylaşıyor'
  },
  screenStopped: {
    en:'Screen sharing stopped',ru:'Демонстрация экрана завершена',es:'Se detuvo la pantalla compartida',fr:'Partage d\'écran arrêté',de:'Bildschirmfreigabe beendet',zh:'屏幕共享已停止',ja:'画面共有が停止されました',ko:'화면 공유가 중지되었습니다',pt:'Compartilhamento de tela parado',hi:'स्क्रीन शेयरिंग बंद हो गई',tr:'Ekran paylaşımı durduruldu'
  },
  micMutedWarning: {
    en:'Your microphone is off!',ru:'Ваш микрофон выключен!',es:'¡Tu micrófono está apagado!',fr:'Votre micro est coupé !',de:'Ihr Mikrofon ist aus!',zh:'您的麦克风已关闭！',ja:'マイクがオフです！',ko:'마이크가 꺼져 있습니다!',pt:'Seu microfone está desligado!',hi:'आपका माइक्रोफ़ोन बंद है!',tr:'Mikrofonunuz kapalı!'
  },
  becameAdmin: {
    en:'You became an administrator',ru:'Вы стали администратором',es:'Te has convertido en administrador',fr:'Vous êtes devenu administrateur',de:'Sie sind jetzt Administrator',zh:'您已成为管理员',ja:'管理者になりました',ko:'관리자가 되었습니다',pt:'Você se tornou administrador',hi:'आप प्रशासक बन गए',tr:'Yönetici oldunuz'
  },
  wrongCode: {
    en:'Wrong code',ru:'Неверный код',es:'Código incorrecto',fr:'Code incorrect',de:'Falscher Code',zh:'代码错误',ja:'コードが間違っています',ko:'잘못된 코드',pt:'Código incorreto',hi:'गलत कोड',tr:'Yanlış kod'
  },
  micForceMuted: {
    en:'turned off your microphone',ru:'выключил ваш микрофон',es:'apagó tu micrófono',fr:'a coupé votre microphone',de:'hat Ihr Mikrofon ausgeschaltet',zh:'关闭了您的麦克风',ja:'あなたのマイクをオフにしました',ko:'마이크를 끄셨습니다',pt:'desligou seu microfone',hi:'ने आपका माइक्रोफ़ोन बंद कर दिया',tr:'mikrofonunuzu kapattı'
  },
  banned: {
    en:'You have been blocked by the administrator',ru:'Вы заблокированы администратором',es:'Has sido bloqueado por el administrador',fr:'Vous avez été bloqué par l\'administrateur',de:'Sie wurden vom Administrator blockiert',zh:'您已被管理员封禁',ja:'管理者によってブロックされました',ko:'관리자에 의해 차단되었습니다',pt:'Você foi bloqueado pelo administrador',hi:'आपको प्रशासक द्वारा ब्लॉक किया गया है',tr:'Yönetici tarafından engellendiniz'
  },
  banConfirm: {
    en:'Ban this participant? They won\'t be able to return.',ru:'Забанить участника? Он не сможет войти снова.',es:'¿Bloquear a este participante?',fr:'Bloquer ce participant ?',de:'Diesen Teilnehmer sperren?',zh:'封禁此参与者？他们将无法返回。',ja:'この参加者をブロックしますか？',ko:'이 참가자를 차단하시겠습니까?',pt:'Banir este participante?',hi:'इस प्रतिभागी को प्रतिबंधित करें?',tr:'Bu katılımcıyı yasakla?'
  },
  conference: {
    en:'Conference',ru:'Конференция',es:'Conferencia',fr:'Conférence',de:'Konferenz',zh:'会议',ja:'会議',ko:'회의',pt:'Conferência',hi:'कॉन्फ्रेंस',tr:'Konferans'
  },

  // ── Quality ──
  quality: {
    en:'Connection quality',ru:'Качество связи',es:'Calidad de conexión',fr:'Qualité de connexion',de:'Verbindungsqualität',zh:'连接质量',ja:'接続品質',ko:'연결 품질',pt:'Qualidade da conexão',hi:'कनेक्शन की गुणवत्ता',tr:'Bağlantı kalitesi'
  },
  ping: {
    en:'Ping',ru:'Пинг',es:'Ping',fr:'Ping',de:'Ping',zh:'延迟',ja:'ピング',ko:'핑',pt:'Ping',hi:'पिंग',tr:'Ping'
  },
  packetLoss: {
    en:'Packet loss',ru:'Потери пакетов',es:'Pérdida de paquetes',fr:'Perte de paquets',de:'Paketverlust',zh:'丢包率',ja:'パケットロス',ko:'패킷 손실',pt:'Perda de pacotes',hi:'पैकेट लॉस',tr:'Paket kaybı'
  },
  bitrateUp: {
    en:'Bitrate ↑',ru:'Битрейт ↑',es:'Bitrate ↑',fr:'Débit ↑',de:'Bitrate ↑',zh:'比特率 ↑',ja:'ビットレート ↑',ko:'비트레이트 ↑',pt:'Bitrate ↑',hi:'बिटरेट ↑',tr:'Bitrate ↑'
  },
  bitrateDown: {
    en:'Bitrate ↓',ru:'Битрейт ↓',es:'Bitrate ↓',fr:'Débit ↓',de:'Bitrate ↓',zh:'比特率 ↓',ja:'ビットレート ↓',ko:'비트레이트 ↓',pt:'Bitrate ↓',hi:'बिटरेट ↓',tr:'Bitrate ↓'
  },
  codec: {
    en:'Codec',ru:'Кодек',es:'Códec',fr:'Codec',de:'Codec',zh:'编解码器',ja:'コーデック',ko:'코덱',pt:'Codec',hi:'कोडेक',tr:'Kodek'
  },

  // ── Instructions title ──
  howToUse: {
    en:'How to use',ru:'Инструкция',es:'Cómo usar',fr:'Comment utiliser',de:'Anleitung',zh:'使用说明',ja:'使い方',ko:'사용 방법',pt:'Como usar',hi:'कैसे उपयोग करें',tr:'Nasıl kullanılır'
  },
  gotIt: {
    en:'Got it!',ru:'Понятно!',es:'¡Entendido!',fr:'Compris !',de:'Verstanden!',zh:'明白了！',ja:'了解！',ko:'알겠습니다!',pt:'Entendi!',hi:'समझ गया!',tr:'Anladım!'
  },
  dontShowAgain: {
    en:'Don\'t show again',ru:'Больше не показывать',es:'No mostrar de nuevo',fr:'Ne plus afficher',de:'Nicht mehr anzeigen',zh:'不再显示',ja:'今後表示しない',ko:'다시 표시하지 않기',pt:'Não mostrar novamente',hi:'दोबारा न दिखाएं',tr:'Bir daha gösterme'
  },
  noRoomError: {
    en:'Error: room ID not specified',ru:'Ошибка: не указан ID комнаты',es:'Error: ID de sala no especificado',fr:'Erreur : ID de salle non spécifié',de:'Fehler: Raum-ID nicht angegeben',zh:'错误：未指定房间ID',ja:'エラー：ルームIDが指定されていません',ko:'오류: 방 ID가 지정되지 않았습니다',pt:'Erro: ID da sala não especificado',hi:'त्रुटि: कमरे की ID निर्दिष्ट नहीं है',tr:'Hata: oda ID\'si belirtilmedi'
  }
};

// Translation function
var confLang = localStorage.getItem('conf_lang') || navigator.language?.slice(0,2) || 'en';
if (!CONF_I18N.join[confLang]) confLang = 'en';

function t(key) {
  var entry = CONF_I18N[key];
  if (!entry) return key;
  return entry[confLang] || entry['en'] || key;
}

function setConfLang(lang) {
  confLang = lang;
  localStorage.setItem('conf_lang', lang);
}
