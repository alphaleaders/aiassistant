// Bot i18n — 10 languages
const BOT_LANGS = {en:'English',ru:'Русский',es:'Español',fr:'Français',de:'Deutsch',zh:'中文',ja:'日本語',ko:'한국어',pt:'Português',hi:'हिन्दी',tr:'Türkçe'};

const T = {
// ── Main keyboard ──
kbToday:{en:'📋 Today',ru:'📋 Сегодня',es:'📋 Hoy',fr:'📋 Aujourd\'hui',de:'📋 Heute',zh:'📋 今天',ja:'📋 今日',ko:'📋 오늘',pt:'📋 Hoje',hi:'📋 आज',tr:'📋 Bugün'},
kbTomorrow:{en:'📅 Tomorrow',ru:'📅 Завтра',es:'📅 Mañana',fr:'📅 Demain',de:'📅 Morgen',zh:'📅 明天',ja:'📅 明日',ko:'📅 내일',pt:'📅 Amanhã',hi:'📅 कल',tr:'📅 Yarın'},
kbWeek:{en:'📆 Week',ru:'📆 Неделя',es:'📆 Semana',fr:'📆 Semaine',de:'📆 Woche',zh:'📆 本周',ja:'📆 週間',ko:'📆 주간',pt:'📆 Semana',hi:'📆 सप्ताह',tr:'📆 Hafta'},
kbHabits:{en:'📊 Habits',ru:'📊 Привычки',es:'📊 Hábitos',fr:'📊 Habitudes',de:'📊 Gewohnheiten',zh:'📊 习惯',ja:'📊 習慣',ko:'📊 습관',pt:'📊 Hábitos',hi:'📊 आदतें',tr:'📊 Alışkanlıklar'},
kbAdd:{en:'➕ Add',ru:'➕ Добавить',es:'➕ Añadir',fr:'➕ Ajouter',de:'➕ Hinzufügen',zh:'➕ 添加',ja:'➕ 追加',ko:'➕ 추가',pt:'➕ Adicionar',hi:'➕ जोड़ें',tr:'➕ Ekle'},
kbMenu:{en:'🏠 Menu',ru:'🏠 Меню',es:'🏠 Menú',fr:'🏠 Menu',de:'🏠 Menü',zh:'🏠 菜单',ja:'🏠 メニュー',ko:'🏠 메뉴',pt:'🏠 Menu',hi:'🏠 मेन्यू',tr:'🏠 Menü'},
kbConf:{en:'📹 Video conference',ru:'📹 Видеоконференции',es:'📹 Videoconferencia',fr:'📹 Vidéoconférence',de:'📹 Videokonferenz',zh:'📹 视频会议',ja:'📹 ビデオ会議',ko:'📹 화상회의',pt:'📹 Videoconferência',hi:'📹 वीडियो कॉन्फ्रेंस',tr:'📹 Video konferans'},

// ── Start/Welcome ──
welcomeBack:{en:'👋 Welcome back, <b>%s</b>!',ru:'👋 С возвращением, <b>%s</b>!',es:'👋 ¡Bienvenido de nuevo, <b>%s</b>!',fr:'👋 Bon retour, <b>%s</b> !',de:'👋 Willkommen zurück, <b>%s</b>!',zh:'👋 欢迎回来，<b>%s</b>！',ja:'👋 おかえりなさい、<b>%s</b>！',ko:'👋 돌아오신 것을 환영합니다, <b>%s</b>!',pt:'👋 Bem-vindo de volta, <b>%s</b>!',hi:'👋 वापस स्वागत है, <b>%s</b>!',tr:'👋 Tekrar hoş geldin, <b>%s</b>!'},
iAmSecretary:{en:'I\'m %s, your personal secretary.',ru:'Я %s, твой персональный секретарь.',es:'Soy %s, tu secretario personal.',fr:'Je suis %s, votre secrétaire personnel.',de:'Ich bin %s, Ihr persönlicher Sekretär.',zh:'我是%s，您的私人秘书。',ja:'%sです、あなたの個人秘書です。',ko:'저는 %s, 당신의 개인 비서입니다.',pt:'Eu sou %s, seu secretário pessoal.',hi:'मैं %s, आपका निजी सचिव हूं।',tr:'Ben %s, kişisel sekreteriniz.'},
writeOrVoice:{en:'Just write or send a voice message — I\'ll note everything.',ru:'Просто напиши или отправь голосовое — я всё запишу и напомню.',es:'Escribe o envía un mensaje de voz — lo anotaré todo.',fr:'Écrivez ou envoyez un vocal — je note tout.',de:'Schreiben Sie oder senden Sie eine Sprachnachricht.',zh:'直接写或发语音消息——我会记录一切。',ja:'テキストか音声メッセージを送ってください。',ko:'텍스트나 음성 메시지를 보내세요.',pt:'Escreva ou envie um áudio — eu anoto tudo.',hi:'लिखें या वॉइस मैसेज भेजें — मैं सब नोट करूंगा।',tr:'Yazın veya sesli mesaj gönderin — her şeyi not ederim.'},
tryExample:{en:'💡 Try: <i>"meeting tomorrow at 2pm"</i>',ru:'💡 Попробуй: <i>"завтра в 14:00 встреча с клиентом"</i>',es:'💡 Prueba: <i>"reunión mañana a las 14:00"</i>',fr:'💡 Essayez : <i>"réunion demain à 14h"</i>',de:'💡 Versuch: <i>"Morgen um 14 Uhr Treffen"</i>',zh:'💡 试试：<i>"明天下午2点开会"</i>',ja:'💡 例：<i>"明日14時にミーティング"</i>',ko:'💡 시도: <i>"내일 오후 2시 미팅"</i>',pt:'💡 Tente: <i>"reunião amanhã às 14h"</i>',hi:'💡 कोशिश करें: <i>"कल दोपहर 2 बजे मीटिंग"</i>',tr:'💡 Deneyin: <i>"yarın saat 14:00 toplantı"</i>'},
whatToDo:{en:'What shall we do?',ru:'Что делаем?',es:'¿Qué hacemos?',fr:'Que faisons-nous ?',de:'Was machen wir?',zh:'我们做什么？',ja:'何をしましょう？',ko:'무엇을 할까요?',pt:'O que fazemos?',hi:'क्या करें?',tr:'Ne yapalım?'},

// ── Onboarding ──
onboardWelcome:{en:'👋 Hello, <b>%s</b>!\n\nI\'m your AI secretary and planner.\nI\'ll manage your tasks, remind you and help plan your day.\n\n🎭 First — <b>what do you want to call me?</b>\n\nPick a name or write your own:',ru:'👋 Привет, <b>%s</b>!\n\nЯ твой AI-секретарь и планировщик.\nЯ буду управлять твоими делами, напоминать о задачах и помогать планировать день.\n\n🎭 Для начала — <b>как ты хочешь меня называть?</b>\n\nВыбери готовое имя или напиши своё:',es:'👋 ¡Hola, <b>%s</b>!\n\nSoy tu secretario IA y planificador.\n\n🎭 Primero — <b>¿cómo quieres llamarme?</b>',fr:'👋 Bonjour, <b>%s</b> !\n\nJe suis votre secrétaire IA.\n\n🎭 D\'abord — <b>comment voulez-vous m\'appeler ?</b>',de:'👋 Hallo, <b>%s</b>!\n\nIch bin Ihr KI-Sekretär.\n\n🎭 Zuerst — <b>wie möchten Sie mich nennen?</b>',zh:'👋 你好，<b>%s</b>！\n\n我是你的AI秘书和规划师。\n\n🎭 首先——<b>你想叫我什么？</b>',ja:'👋 こんにちは、<b>%s</b>！\n\nAI秘書兼プランナーです。\n\n🎭 まず——<b>私をなんと呼びますか？</b>',ko:'👋 안녕하세요, <b>%s</b>!\n\nAI 비서이자 플래너입니다.\n\n🎭 먼저 — <b>저를 뭐라고 부르시겠어요?</b>',pt:'👋 Olá, <b>%s</b>!\n\nSou seu secretário IA.\n\n🎭 Primeiro — <b>como quer me chamar?</b>',hi:'👋 नमस्ते, <b>%s</b>!\n\nमैं आपका AI सचिव हूं।\n\n🎭 पहले — <b>आप मुझे क्या बुलाना चाहेंगे?</b>',tr:'👋 Merhaba, <b>%s</b>!\n\nBen AI sekreterinizim.\n\n🎭 Önce — <b>bana ne ad vermek istersiniz?</b>'},
customName:{en:'✍️ Custom name...',ru:'✍️ Своё имя...',es:'✍️ Nombre propio...',fr:'✍️ Nom personnalisé...',de:'✍️ Eigener Name...',zh:'✍️ 自定义名字...',ja:'✍️ カスタム名...',ko:'✍️ 직접 입력...',pt:'✍️ Nome personalizado...',hi:'✍️ अपना नाम...',tr:'✍️ Özel ad...'},
chooseStyle:{en:'🎨 Now choose communication style for <b>%s</b>:',ru:'🎨 Теперь выбери стиль общения для <b>%s</b>:',es:'🎨 Ahora elige el estilo de comunicación:',fr:'🎨 Choisissez le style de communication :',de:'🎨 Wählen Sie den Kommunikationsstil:',zh:'🎨 选择沟通风格：',ja:'🎨 コミュニケーションスタイルを選択：',ko:'🎨 커뮤니케이션 스타일을 선택하세요:',pt:'🎨 Escolha o estilo de comunicação:',hi:'🎨 संवाद शैली चुनें:',tr:'🎨 İletişim tarzını seçin:'},
tellAboutYou:{en:'Tell me about yourself — what do you do, what\'s important to you?',ru:'Расскажи о себе — чем занимаешься, что для тебя важно?',es:'Cuéntame sobre ti — ¿a qué te dedicas?',fr:'Parlez-moi de vous — que faites-vous ?',de:'Erzählen Sie mir von sich — was machen Sie?',zh:'告诉我关于你——你做什么？',ja:'あなたについて教えてください',ko:'자신에 대해 알려주세요',pt:'Conte-me sobre você',hi:'अपने बारे में बताएं',tr:'Kendinizden bahsedin'},
skipStep:{en:'⏭ Skip',ru:'⏭ Пропустить',es:'⏭ Omitir',fr:'⏭ Passer',de:'⏭ Überspringen',zh:'⏭ 跳过',ja:'⏭ スキップ',ko:'⏭ 건너뛰기',pt:'⏭ Pular',hi:'⏭ छोड़ें',tr:'⏭ Atla'},
onboardDone:{en:'🎉 Great! Ready to work.',ru:'🎉 Отлично! Готов к работе.',es:'🎉 ¡Genial! Listo para trabajar.',fr:'🎉 Excellent ! Prêt à travailler.',de:'🎉 Großartig! Bereit zur Arbeit.',zh:'🎉 太好了！准备开始。',ja:'🎉 素晴らしい！準備完了です。',ko:'🎉 좋습니다! 준비 완료.',pt:'🎉 Ótimo! Pronto para trabalhar.',hi:'🎉 बढ़िया! काम के लिए तैयार।',tr:'🎉 Harika! Çalışmaya hazır.'},

// ── Settings ──
settingsTitle:{en:'⚙️ <b>Settings:</b>',ru:'⚙️ <b>Настройки:</b>',es:'⚙️ <b>Configuración:</b>',fr:'⚙️ <b>Paramètres :</b>',de:'⚙️ <b>Einstellungen:</b>',zh:'⚙️ <b>设置：</b>',ja:'⚙️ <b>設定：</b>',ko:'⚙️ <b>설정:</b>',pt:'⚙️ <b>Configurações:</b>',hi:'⚙️ <b>सेटिंग्स:</b>',tr:'⚙️ <b>Ayarlar:</b>'},
timezone:{en:'🌍 Timezone',ru:'🌍 Часовой пояс',es:'🌍 Zona horaria',fr:'🌍 Fuseau horaire',de:'🌍 Zeitzone',zh:'🌍 时区',ja:'🌍 タイムゾーン',ko:'🌍 시간대',pt:'🌍 Fuso horário',hi:'🌍 समय क्षेत्र',tr:'🌍 Saat dilimi'},
dnd:{en:'🔕 Do not disturb',ru:'🔕 Не беспокоить',es:'🔕 No molestar',fr:'🔕 Ne pas déranger',de:'🔕 Nicht stören',zh:'🔕 免打扰',ja:'🔕 おやすみモード',ko:'🔕 방해 금지',pt:'🔕 Não perturbe',hi:'🔕 परेशान न करें',tr:'🔕 Rahatsız etme'},
alerts:{en:'🔔 Task notifications',ru:'🔔 Уведомления о задачах',es:'🔔 Notificaciones',fr:'🔔 Notifications',de:'🔔 Benachrichtigungen',zh:'🔔 任务通知',ja:'🔔 タスク通知',ko:'🔔 작업 알림',pt:'🔔 Notificações',hi:'🔔 कार्य सूचनाएं',tr:'🔔 Görev bildirimleri'},
changeName:{en:'🎭 Change name',ru:'🎭 Сменить имя',es:'🎭 Cambiar nombre',fr:'🎭 Changer le nom',de:'🎭 Name ändern',zh:'🎭 更改名称',ja:'🎭 名前を変更',ko:'🎭 이름 변경',pt:'🎭 Mudar nome',hi:'🎭 नाम बदलें',tr:'🎭 Ad değiştir'},
changeStyle:{en:'🎨 Change style',ru:'🎨 Сменить стиль',es:'🎨 Cambiar estilo',fr:'🎨 Changer le style',de:'🎨 Stil ändern',zh:'🎨 更改风格',ja:'🎨 スタイル変更',ko:'🎨 스타일 변경',pt:'🎨 Mudar estilo',hi:'🎨 शैली बदलें',tr:'🎨 Tarz değiştir'},
selectTimezone:{en:'🌍 <b>Select timezone:</b>\n\nChoose your city or set GMT offset',ru:'🌍 <b>Выберите часовой пояс:</b>\n\n⬇️ Выберите свой город или укажите GMT вручную',es:'🌍 <b>Seleccione zona horaria:</b>',fr:'🌍 <b>Sélectionnez le fuseau :</b>',de:'🌍 <b>Zeitzone wählen:</b>',zh:'🌍 <b>选择时区：</b>',ja:'🌍 <b>タイムゾーンを選択：</b>',ko:'🌍 <b>시간대 선택:</b>',pt:'🌍 <b>Selecione o fuso:</b>',hi:'🌍 <b>समय क्षेत्र चुनें:</b>',tr:'🌍 <b>Saat dilimi seçin:</b>'},
byGmt:{en:'🕐 By GMT offset',ru:'🕐 По GMT смещению',es:'🕐 Por offset GMT',fr:'🕐 Par décalage GMT',de:'🕐 Nach GMT',zh:'🕐 按GMT偏移',ja:'🕐 GMTオフセットで',ko:'🕐 GMT 오프셋으로',pt:'🕐 Por offset GMT',hi:'🕐 GMT ऑफसेट से',tr:'🕐 GMT ofsetine göre'},
customGmt:{en:'✏️ Custom (enter GMT)',ru:'✏️ Свой вариант (ввести GMT)',es:'✏️ Personalizado (GMT)',fr:'✏️ Personnalisé (GMT)',de:'✏️ Benutzerdefiniert (GMT)',zh:'✏️ 自定义（输入GMT）',ja:'✏️ カスタム（GMT入力）',ko:'✏️ 직접 입력 (GMT)',pt:'✏️ Personalizado (GMT)',hi:'✏️ कस्टम (GMT दर्ज करें)',tr:'✏️ Özel (GMT girin)'},
enterGmt:{en:'✏️ <b>Enter your GMT:</b>\n\nWrite a number from -12 to +14\nExample: <code>+4</code> or <code>-5</code>',ru:'✏️ <b>Введите ваш GMT:</b>\n\nНапишите число от -12 до +14\nНапример: <code>+4</code> или <code>-5</code> или <code>3</code>\n\n<i>Москва = +3, Саратов = +4, Камчатка = +12</i>',es:'✏️ <b>Ingrese su GMT:</b>\n\nEscriba un número de -12 a +14',fr:'✏️ <b>Entrez votre GMT :</b>\n\nÉcrivez un nombre de -12 à +14',de:'✏️ <b>GMT eingeben:</b>\n\nZahl von -12 bis +14',zh:'✏️ <b>输入GMT：</b>\n\n输入-12到+14的数字',ja:'✏️ <b>GMTを入力：</b>\n\n-12から+14の数字',ko:'✏️ <b>GMT 입력:</b>\n\n-12에서 +14 사이의 숫자',pt:'✏️ <b>Digite seu GMT:</b>\n\nNúmero de -12 a +14',hi:'✏️ <b>अपना GMT दर्ज करें:</b>\n\n-12 से +14 तक का नंबर',tr:'✏️ <b>GMT\'nizi girin:</b>\n\n-12 ile +14 arası bir sayı'},
tzSaved:{en:'✅ Timezone: <b>GMT%s</b>',ru:'✅ Часовой пояс: <b>GMT%s</b>',es:'✅ Zona horaria: <b>GMT%s</b>',fr:'✅ Fuseau : <b>GMT%s</b>',de:'✅ Zeitzone: <b>GMT%s</b>',zh:'✅ 时区：<b>GMT%s</b>',ja:'✅ タイムゾーン：<b>GMT%s</b>',ko:'✅ 시간대: <b>GMT%s</b>',pt:'✅ Fuso: <b>GMT%s</b>',hi:'✅ समय क्षेत्र: <b>GMT%s</b>',tr:'✅ Saat dilimi: <b>GMT%s</b>'},

// ── Styles ──
styleFriendly:{en:'😊 Friendly',ru:'😊 Дружелюбный',es:'😊 Amigable',fr:'😊 Amical',de:'😊 Freundlich',zh:'😊 友好',ja:'😊 フレンドリー',ko:'😊 친근한',pt:'😊 Amigável',hi:'😊 मैत्रीपूर्ण',tr:'😊 Arkadaşça'},
styleBusiness:{en:'💼 Business',ru:'💼 Деловой',es:'💼 Profesional',fr:'💼 Professionnel',de:'💼 Geschäftlich',zh:'💼 商务',ja:'💼 ビジネス',ko:'💼 비즈니스',pt:'💼 Profissional',hi:'💼 व्यवसायिक',tr:'💼 İş'},
styleCoach:{en:'🔥 Coach',ru:'🔥 Коуч-мотиватор',es:'🔥 Coach motivador',fr:'🔥 Coach motivateur',de:'🔥 Motivationscoach',zh:'🔥 教练激励者',ja:'🔥 コーチ',ko:'🔥 코치',pt:'🔥 Coach motivador',hi:'🔥 कोच',tr:'🔥 Koç'},
styleGentle:{en:'🌸 Gentle',ru:'🌸 Мягкий',es:'🌸 Suave',fr:'🌸 Doux',de:'🌸 Sanft',zh:'🌸 温柔',ja:'🌸 やさしい',ko:'🌸 부드러운',pt:'🌸 Suave',hi:'🌸 कोमल',tr:'🌸 Nazik'},
styleBold:{en:'😈 Bold',ru:'😈 Дерзкий',es:'😈 Atrevido',fr:'😈 Audacieux',de:'😈 Frech',zh:'😈 大胆',ja:'😈 大胆',ko:'😈 대담한',pt:'😈 Ousado',hi:'😈 बोल्ड',tr:'😈 Cesur'},
stylePatsansky:{en:'🤙 Street',ru:'🤙 По пацански',es:'🤙 Callejero',fr:'🤙 De la rue',de:'🤙 Straße',zh:'🤙 街头',ja:'🤙 ストリート',ko:'🤙 스트리트',pt:'🤙 De rua',hi:'🤙 स्ट्रीट',tr:'🤙 Sokak'},
styleBrash:{en:'🔥 Brash',ru:'🔥 Наглый',es:'🔥 Descarado',fr:'🔥 Effronté',de:'🔥 Dreist',zh:'🔥 嚣张',ja:'🔥 ずうずうしい',ko:'🔥 뻔뻔한',pt:'🔥 Descarado',hi:'🔥 ढीठ',tr:'🔥 Küstah'},
stylePartner:{en:'🤝 Partner',ru:'🤝 Партнёрский',es:'🤝 Socio',fr:'🤝 Partenaire',de:'🤝 Partner',zh:'🤝 伙伴',ja:'🤝 パートナー',ko:'🤝 파트너',pt:'🤝 Parceiro',hi:'🤝 साझेदार',tr:'🤝 Ortak'},

// ── Menu ──
mainMenu:{en:'🏠 <b>Main menu</b>',ru:'🏠 <b>Главное меню</b>',es:'🏠 <b>Menú principal</b>',fr:'🏠 <b>Menu principal</b>',de:'🏠 <b>Hauptmenü</b>',zh:'🏠 <b>主菜单</b>',ja:'🏠 <b>メインメニュー</b>',ko:'🏠 <b>메인 메뉴</b>',pt:'🏠 <b>Menu principal</b>',hi:'🏠 <b>मुख्य मेन्यू</b>',tr:'🏠 <b>Ana menü</b>'},
tasksToday:{en:'📋 Tasks today',ru:'📋 Задачи сегодня',es:'📋 Tareas hoy',fr:'📋 Tâches aujourd\'hui',de:'📋 Aufgaben heute',zh:'📋 今日任务',ja:'📋 今日のタスク',ko:'📋 오늘의 작업',pt:'📋 Tarefas hoje',hi:'📋 आज के कार्य',tr:'📋 Bugünkü görevler'},
habits:{en:'📊 Habits',ru:'📊 Привычки',es:'📊 Hábitos',fr:'📊 Habitudes',de:'📊 Gewohnheiten',zh:'📊 习惯',ja:'📊 習慣',ko:'📊 습관',pt:'📊 Hábitos',hi:'📊 आदतें',tr:'📊 Alışkanlıklar'},
daySummary:{en:'☀️ Day summary',ru:'☀️ Итог дня',es:'☀️ Resumen del día',fr:'☀️ Résumé du jour',de:'☀️ Tagesübersicht',zh:'☀️ 日总结',ja:'☀️ 1日のまとめ',ko:'☀️ 하루 요약',pt:'☀️ Resumo do dia',hi:'☀️ दिन का सारांश',tr:'☀️ Gün özeti'},
settings:{en:'⚙️ Settings',ru:'⚙️ Настройки',es:'⚙️ Configuración',fr:'⚙️ Paramètres',de:'⚙️ Einstellungen',zh:'⚙️ 设置',ja:'⚙️ 設定',ko:'⚙️ 설정',pt:'⚙️ Configurações',hi:'⚙️ सेटिंग्स',tr:'⚙️ Ayarlar'},
features:{en:'🌟 Features',ru:'🌟 Возможности',es:'🌟 Funciones',fr:'🌟 Fonctionnalités',de:'🌟 Funktionen',zh:'🌟 功能',ja:'🌟 機能',ko:'🌟 기능',pt:'🌟 Recursos',hi:'🌟 सुविधाएं',tr:'🌟 Özellikler'},
guide:{en:'📖 Guide',ru:'📖 Инструкции',es:'📖 Guía',fr:'📖 Guide',de:'📖 Anleitung',zh:'📖 指南',ja:'📖 ガイド',ko:'📖 가이드',pt:'📖 Guia',hi:'📖 गाइड',tr:'📖 Rehber'},
openPlanner:{en:'📱 Open planner',ru:'📱 Открыть планировщик',es:'📱 Abrir planificador',fr:'📱 Ouvrir le planificateur',de:'📱 Planer öffnen',zh:'📱 打开计划器',ja:'📱 プランナーを開く',ko:'📱 플래너 열기',pt:'📱 Abrir planejador',hi:'📱 प्लानर खोलें',tr:'📱 Planlayıcıyı aç'},

// ── Tasks ──
writeTask:{en:'✏️ Write a task:',ru:'✏️ Напиши задачу:',es:'✏️ Escribe una tarea:',fr:'✏️ Écrivez une tâche :',de:'✏️ Aufgabe schreiben:',zh:'✏️ 写一个任务：',ja:'✏️ タスクを入力：',ko:'✏️ 작업을 입력하세요:',pt:'✏️ Escreva uma tarefa:',hi:'✏️ कार्य लिखें:',tr:'✏️ Bir görev yazın:'},
noTasks:{en:'No tasks',ru:'Нет задач',es:'Sin tareas',fr:'Pas de tâches',de:'Keine Aufgaben',zh:'没有任务',ja:'タスクなし',ko:'작업 없음',pt:'Sem tarefas',hi:'कोई कार्य नहीं',tr:'Görev yok'},
taskDone:{en:'✅ Done!',ru:'✅ Готово!',es:'✅ ¡Hecho!',fr:'✅ Terminé !',de:'✅ Erledigt!',zh:'✅ 完成！',ja:'✅ 完了！',ko:'✅ 완료!',pt:'✅ Feito!',hi:'✅ हो गया!',tr:'✅ Tamamlandı!'},
movedToday:{en:'📅 Moved to today',ru:'📅 На сегодня',es:'📅 Movido a hoy',fr:'📅 Déplacé à aujourd\'hui',de:'📅 Auf heute verschoben',zh:'📅 移到今天',ja:'📅 今日に移動',ko:'📅 오늘로 이동',pt:'📅 Movido para hoje',hi:'📅 आज के लिए',tr:'📅 Bugüne taşındı'},
movedTomorrow:{en:'📅 Moved to tomorrow',ru:'📅 На завтра',es:'📅 Movido a mañana',fr:'📅 Déplacé à demain',de:'📅 Auf morgen verschoben',zh:'📅 移到明天',ja:'📅 明日に移動',ko:'📅 내일로 이동',pt:'📅 Movido para amanhã',hi:'📅 कल के लिए',tr:'📅 Yarına taşındı'},

// ── Conference ──
confCreated:{en:'📹 <b>Room created!</b>',ru:'📹 <b>Комната создана!</b>',es:'📹 <b>¡Sala creada!</b>',fr:'📹 <b>Salle créée !</b>',de:'📹 <b>Raum erstellt!</b>',zh:'📹 <b>房间已创建！</b>',ja:'📹 <b>ルーム作成！</b>',ko:'📹 <b>방이 생성되었습니다!</b>',pt:'📹 <b>Sala criada!</b>',hi:'📹 <b>कमरा बनाया गया!</b>',tr:'📹 <b>Oda oluşturuldu!</b>'},
confScheduled:{en:'📹 <b>Conference scheduled!</b>',ru:'📹 <b>Конференция запланирована!</b>',es:'📹 <b>¡Conferencia programada!</b>',fr:'📹 <b>Conférence planifiée !</b>',de:'📹 <b>Konferenz geplant!</b>',zh:'📹 <b>会议已安排！</b>',ja:'📹 <b>会議が予定されました！</b>',ko:'📹 <b>회의가 예약되었습니다!</b>',pt:'📹 <b>Conferência agendada!</b>',hi:'📹 <b>कॉन्फ्रेंस शेड्यूल हो गई!</b>',tr:'📹 <b>Konferans planlandı!</b>'},
confClosed:{en:'❌ <b>Room closed</b>',ru:'❌ <b>Комната закрыта</b>',es:'❌ <b>Sala cerrada</b>',fr:'❌ <b>Salle fermée</b>',de:'❌ <b>Raum geschlossen</b>',zh:'❌ <b>房间已关闭</b>',ja:'❌ <b>ルーム閉鎖</b>',ko:'❌ <b>방이 닫혔습니다</b>',pt:'❌ <b>Sala fechada</b>',hi:'❌ <b>कमरा बंद</b>',tr:'❌ <b>Oda kapatıldı</b>'},
invite:{en:'🔗 Invite',ru:'🔗 Пригласить',es:'🔗 Invitar',fr:'🔗 Inviter',de:'🔗 Einladen',zh:'🔗 邀请',ja:'🔗 招待',ko:'🔗 초대',pt:'🔗 Convidar',hi:'🔗 आमंत्रित करें',tr:'🔗 Davet et'},
share:{en:'🔗 Share',ru:'🔗 Поделиться',es:'🔗 Compartir',fr:'🔗 Partager',de:'🔗 Teilen',zh:'🔗 分享',ja:'🔗 共有',ko:'🔗 공유',pt:'🔗 Compartilhar',hi:'🔗 शेयर करें',tr:'🔗 Paylaş'},
joinConf:{en:'🚀 Join',ru:'🚀 Войти',es:'🚀 Unirse',fr:'🚀 Rejoindre',de:'🚀 Beitreten',zh:'🚀 加入',ja:'🚀 参加',ko:'🚀 참여',pt:'🚀 Entrar',hi:'🚀 शामिल हों',tr:'🚀 Katıl'},
browserJoin:{en:'🌐 Join (browser)',ru:'🌐 Войти (браузер)',es:'🌐 Unirse (navegador)',fr:'🌐 Rejoindre (navigateur)',de:'🌐 Beitreten (Browser)',zh:'🌐 加入（浏览器）',ja:'🌐 参加（ブラウザ）',ko:'🌐 참여 (브라우저)',pt:'🌐 Entrar (navegador)',hi:'🌐 शामिल हों (ब्राउज़र)',tr:'🌐 Katıl (tarayıcı)'},
tgJoin:{en:'📱 Join (Telegram)',ru:'📱 Войти (Telegram)',es:'📱 Unirse (Telegram)',fr:'📱 Rejoindre (Telegram)',de:'📱 Beitreten (Telegram)',zh:'📱 加入（Telegram）',ja:'📱 参加（Telegram）',ko:'📱 참여 (텔레그램)',pt:'📱 Entrar (Telegram)',hi:'📱 शामिल हों (टेलीग्राम)',tr:'📱 Katıl (Telegram)'},
willAttend:{en:'✋ Will attend',ru:'✋ Буду',es:'✋ Asistiré',fr:'✋ Je serai là',de:'✋ Ich komme',zh:'✋ 会参加',ja:'✋ 参加します',ko:'✋ 참석',pt:'✋ Estarei lá',hi:'✋ आऊंगा',tr:'✋ Katılacağım'},
cantAttend:{en:'❌ Can\'t attend',ru:'❌ Не смогу',es:'❌ No podré',fr:'❌ Ne pourrai pas',de:'❌ Kann nicht',zh:'❌ 无法参加',ja:'❌ 参加できません',ko:'❌ 불참',pt:'❌ Não poderei',hi:'❌ नहीं आ पाऊंगा',tr:'❌ Katılamayacağım'},
closeRoom:{en:'❌ Close room',ru:'❌ Закрыть комнату',es:'❌ Cerrar sala',fr:'❌ Fermer la salle',de:'❌ Raum schließen',zh:'❌ 关闭房间',ja:'❌ ルームを閉じる',ko:'❌ 방 닫기',pt:'❌ Fechar sala',hi:'❌ कमरा बंद करें',tr:'❌ Odayı kapat'},
myRooms:{en:'📋 My rooms',ru:'📋 Мои комнаты',es:'📋 Mis salas',fr:'📋 Mes salles',de:'📋 Meine Räume',zh:'📋 我的房间',ja:'📋 マイルーム',ko:'📋 내 방',pt:'📋 Minhas salas',hi:'📋 मेरे कमरे',tr:'📋 Odalarım'},
adminCodeBtn:{en:'👑 Admin code',ru:'👑 Код админа',es:'👑 Código admin',fr:'👑 Code admin',de:'👑 Admin-Code',zh:'👑 管理员代码',ja:'👑 管理コード',ko:'👑 관리자 코드',pt:'👑 Código admin',hi:'👑 एडमिन कोड',tr:'👑 Yönetici kodu'},
adminCodeMsg:{en:'👑 <b>Administrator code</b>\n\nRoom: <b>%s</b>\nCode: <code>%s</code>\n\n<i>This code grants admin rights.\nEnter it in browser: ••• → 👑 Admin panel</i>',ru:'👑 <b>Код администратора</b>\n\nКомната: <b>%s</b>\nКод: <code>%s</code>\n\n<i>Этот код даёт права администратора.\nВведите его в браузере: ••• → 👑 Админ-панель</i>',es:'👑 <b>Código de administrador</b>\n\nSala: <b>%s</b>\nCódigo: <code>%s</code>',fr:'👑 <b>Code administrateur</b>\n\nSalle : <b>%s</b>\nCode : <code>%s</code>',de:'👑 <b>Admin-Code</b>\n\nRaum: <b>%s</b>\nCode: <code>%s</code>',zh:'👑 <b>管理员代码</b>\n\n房间：<b>%s</b>\n代码：<code>%s</code>',ja:'👑 <b>管理者コード</b>\n\nルーム：<b>%s</b>\nコード：<code>%s</code>',ko:'👑 <b>관리자 코드</b>\n\n방: <b>%s</b>\n코드: <code>%s</code>',pt:'👑 <b>Código de administrador</b>\n\nSala: <b>%s</b>\nCódigo: <code>%s</code>',hi:'👑 <b>एडमिन कोड</b>\n\nकमरा: <b>%s</b>\nकोड: <code>%s</code>',tr:'👑 <b>Yönetici kodu</b>\n\nOda: <b>%s</b>\nKod: <code>%s</code>'},

// ── Group ──
groupOnlyDM:{en:'💡 This command works only in private chat. Write me in DM!',ru:'💡 Эта команда работает только в личном чате. Напишите мне в ЛС!',es:'💡 Este comando solo funciona en chat privado.',fr:'💡 Cette commande fonctionne uniquement en privé.',de:'💡 Dieser Befehl funktioniert nur im privaten Chat.',zh:'💡 此命令仅在私聊中有效。',ja:'💡 このコマンドはプライベートチャットでのみ動作します。',ko:'💡 이 명령은 개인 채팅에서만 작동합니다.',pt:'💡 Este comando funciona apenas no chat privado.',hi:'💡 यह कमांड केवल निजी चैट में काम करता है।',tr:'💡 Bu komut yalnızca özel sohbette çalışır.'},
groupIntro:{en:'👋 Hello! I\'m an AI planner.\n\nIn groups I can:\n• /call — start a video call\n\nFor full features — write me in DM!',ru:'👋 Привет! Я AI-планировщик.\n\nВ группе я могу:\n• /call — созвать видеозвонок\n\nДля полного функционала — напишите мне в личку!',es:'👋 ¡Hola! Soy un planificador IA.\n\nEn grupos puedo:\n• /call — iniciar videollamada',fr:'👋 Bonjour ! Je suis un planificateur IA.\n\nDans les groupes :\n• /call — lancer un appel vidéo',de:'👋 Hallo! Ich bin ein KI-Planer.\n\nIn Gruppen:\n• /call — Videoanruf starten',zh:'👋 你好！我是AI规划师。\n\n在群组中：\n• /call — 发起视频通话',ja:'👋 こんにちは！AIプランナーです。\n\nグループでは：\n• /call — ビデオ通話を開始',ko:'👋 안녕하세요! AI 플래너입니다.\n\n그룹에서:\n• /call — 영상통화 시작',pt:'👋 Olá! Sou um planejador IA.\n\nEm grupos:\n• /call — iniciar videochamada',hi:'👋 नमस्ते! मैं AI प्लानर हूं।\n\nग्रुप में:\n• /call — वीडियो कॉल शुरू करें',tr:'👋 Merhaba! Ben bir AI planlayıcıyım.\n\nGruplarda:\n• /call — görüntülü arama başlat'},

// ── Common ──
back:{en:'⬅️ Back',ru:'⬅️ Назад',es:'⬅️ Atrás',fr:'⬅️ Retour',de:'⬅️ Zurück',zh:'⬅️ 返回',ja:'⬅️ 戻る',ko:'⬅️ 뒤로',pt:'⬅️ Voltar',hi:'⬅️ वापस',tr:'⬅️ Geri'},
newStyle:{en:'🎭 New style:',ru:'🎭 Новый стиль:',es:'🎭 Nuevo estilo:',fr:'🎭 Nouveau style :',de:'🎭 Neuer Stil:',zh:'🎭 新风格：',ja:'🎭 新しいスタイル：',ko:'🎭 새 스타일:',pt:'🎭 Novo estilo:',hi:'🎭 नई शैली:',tr:'🎭 Yeni tarz:'},
newName:{en:'✍️ New secretary name:',ru:'✍️ Новое имя секретаря:',es:'✍️ Nuevo nombre:',fr:'✍️ Nouveau nom :',de:'✍️ Neuer Name:',zh:'✍️ 新名字：',ja:'✍️ 新しい名前：',ko:'✍️ 새 이름:',pt:'✍️ Novo nome:',hi:'✍️ नया नाम:',tr:'✍️ Yeni ad:'},
nameChanged:{en:'✅ Now I\'m <b>%s</b>!',ru:'✅ Теперь меня зовут <b>%s</b>!',es:'✅ ¡Ahora me llamo <b>%s</b>!',fr:'✅ Maintenant je m\'appelle <b>%s</b> !',de:'✅ Jetzt heiße ich <b>%s</b>!',zh:'✅ 现在我叫<b>%s</b>！',ja:'✅ 今から<b>%s</b>です！',ko:'✅ 이제 제 이름은 <b>%s</b>입니다!',pt:'✅ Agora me chamo <b>%s</b>!',hi:'✅ अब मेरा नाम <b>%s</b> है!',tr:'✅ Artık adım <b>%s</b>!'},
invalidTime:{en:'❌ Invalid time format. Use HH:MM',ru:'❌ Неверный формат времени. Используйте ЧЧ:ММ',es:'❌ Formato de hora inválido',fr:'❌ Format d\'heure invalide',de:'❌ Ungültiges Zeitformat',zh:'❌ 时间格式无效',ja:'❌ 無効な時間形式',ko:'❌ 잘못된 시간 형식',pt:'❌ Formato de hora inválido',hi:'❌ अमान्य समय प्रारूप',tr:'❌ Geçersiz saat formatı'},
invalidTz:{en:'❌ Invalid timezone',ru:'❌ Неверный часовой пояс',es:'❌ Zona horaria inválida',fr:'❌ Fuseau horaire invalide',de:'❌ Ungültige Zeitzone',zh:'❌ 无效时区',ja:'❌ 無効なタイムゾーン',ko:'❌ 잘못된 시간대',pt:'❌ Fuso horário inválido',hi:'❌ अमान्य समय क्षेत्र',tr:'❌ Geçersiz saat dilimi'},
onlyCreator:{en:'Only the creator can close the room',ru:'Только создатель может закрыть',es:'Solo el creador puede cerrar',fr:'Seul le créateur peut fermer',de:'Nur der Ersteller kann schließen',zh:'只有创建者可以关闭',ja:'作成者のみ閉じられます',ko:'생성자만 닫을 수 있습니다',pt:'Apenas o criador pode fechar',hi:'केवल निर्माता बंद कर सकता है',tr:'Yalnızca oluşturucu kapatabilir'},
roomNotFound:{en:'Room not found',ru:'Комната не найдена',es:'Sala no encontrada',fr:'Salle non trouvée',de:'Raum nicht gefunden',zh:'房间未找到',ja:'ルームが見つかりません',ko:'방을 찾을 수 없습니다',pt:'Sala não encontrada',hi:'कमरा नहीं मिला',tr:'Oda bulunamadı'},

// ── Alerts ──
alert15min:{en:'⏰ <b>In 15 minutes!</b>',ru:'⏰ <b>Через 15 минут!</b>',es:'⏰ <b>¡En 15 minutos!</b>',fr:'⏰ <b>Dans 15 minutes !</b>',de:'⏰ <b>In 15 Minuten!</b>',zh:'⏰ <b>还有15分钟！</b>',ja:'⏰ <b>あと15分！</b>',ko:'⏰ <b>15분 후!</b>',pt:'⏰ <b>Em 15 minutos!</b>',hi:'⏰ <b>15 मिनट में!</b>',tr:'⏰ <b>15 dakika sonra!</b>'},
alertStarted:{en:'🔴 <b>Conference started!</b>',ru:'🔴 <b>Конференция началась!</b>',es:'🔴 <b>¡Conferencia iniciada!</b>',fr:'🔴 <b>Conférence commencée !</b>',de:'🔴 <b>Konferenz gestartet!</b>',zh:'🔴 <b>会议已开始！</b>',ja:'🔴 <b>会議開始！</b>',ko:'🔴 <b>회의가 시작되었습니다!</b>',pt:'🔴 <b>Conferência iniciada!</b>',hi:'🔴 <b>कॉन्फ्रेंस शुरू!</b>',tr:'🔴 <b>Konferans başladı!</b>'},
confirmed:{en:'Confirmed',ru:'Подтвердили',es:'Confirmados',fr:'Confirmés',de:'Bestätigt',zh:'已确认',ja:'確認済み',ko:'확인됨',pt:'Confirmados',hi:'पुष्टि',tr:'Onaylandı'},
organizer:{en:'Organizer',ru:'Организатор',es:'Organizador',fr:'Organisateur',de:'Organisator',zh:'组织者',ja:'主催者',ko:'주최자',pt:'Organizador',hi:'आयोजक',tr:'Organizatör'},
};

function t(lang, key) {
  var entry = T[key];
  if (!entry) return key;
  var text = entry[lang] || entry['en'] || key;
  var args = Array.prototype.slice.call(arguments, 2);
  args.forEach(function(a) { text = text.replace('%s', a); });
  return text;
}

function getUserLang(ctx) {
  // Check user settings first, then Telegram language
  var user = ctx.from;
  if (user && user._lang) return user._lang;
  var tgLang = user?.language_code?.slice(0,2) || 'en';
  if (T.kbToday[tgLang]) return tgLang;
  return 'en';
}

module.exports = { T, t, getUserLang, BOT_LANGS };
