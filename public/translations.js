window.translations = {
    en: {
        title: "YouTube Video Summarizer",
        urlPlaceholder: "Enter YouTube URL",
        allowAutoGenerated: "Allow auto-generated captions",
        getCaptions: "Get Captions",
        processingCaptions: "Processing video captions...",
        processingMessage: "Processing your message...",
        chatPlaceholder: "Type your message...",
        settings: {
            title: "API Settings",
            save: "Save Settings",
            cancel: "Cancel",
            googleSection: "Google Settings",
            claudeSection: "Claude Settings",
            debugSection: "Debug Settings",
            googleApiKey: "Google API Key",
            claudeApiKey: "Claude API Key",
            enableDebug: "Enable Debug Mode",
            saved: "Settings saved successfully",
            error: "Error saving settings"
        },
        providers: {
            koboldcpp: "Koboldcpp",
            claude: "Claude (Opus)",
            haiku: "Claude (Haiku)",
            sonnet: "Claude (Sonnet)",
            google: "Google"
        },
        errors: {
            prefix: "Error",
            enterUrl: "Please enter a YouTube URL",
            invalidUrl: "Invalid YouTube URL",
            noCaptions: "No captions found for this video",
            enterMessage: "Please enter a message",
            loadCaptions: "Please load video captions first",
            sendFailed: "Failed to send message",
            apiKeyRequired: "API key is required for this provider"
        },
        modelLimitNote: "Note: Due to model limitations, captions will be trimmed when processing your questions. All captions are still visible here for reference.",
        buttons: {
            submit: "Get Captions",
            send: "Send",
            settings: "Settings",
            home: "Home",
            install: "Install App",
            test: "Test Page",
            diagnostics: "Diagnostics",
            apiInstructions: "API Instructions"
        },
        install: {
            title: "Install VidChatBox on Android",
            warning: "Make sure you have installed Termux from F-Droid (not Play Store) before proceeding.",
            copy: "Copy",
            copied: "Copied!",
            copyError: "Failed to copy command. Please try selecting and copying manually.",
            step1: {
                title: "Step 1: Install Required Apps",
                description: "Install these apps from F-Droid:",
                downloadTermux: "1. Download Termux",
                downloadWidget: "2. Download Termux:Widget",
                note: "Termux:Widget allows you to create a launcher icon on your home screen."
            },
            step2: {
                title: "Step 2: Install VidChatBox",
                description: "Click the button below to automatically start the installation in Termux:",
                oneClick: "One-Click Install",
                manualDescription: "Or manually copy and paste this command in Termux:",
                alternativeNote: "If the above methods don't work, try this alternative:"
            },
            step3: {
                title: "Step 3: Create Home Screen Icon",
                step1: "Long press on your home screen",
                step2: "Select \"Widgets\"",
                step3: "Find and add \"Termux Widget\"",
                step4: "Tap the widget and select \"VidChatBox\"",
                note: "The icon will automatically start the server and open the app in your browser."
            },
            step4: {
                title: "Step 4: Access the App",
                description: "You can access VidChatBox in three ways:",
                method1: "Tap the home screen icon (recommended)",
                method2: "Open in browser: http://localhost:3005",
                method3: "Use command line in Termux:",
                startServer: "Start the server",
                checkStatus: "Check server status",
                stopServer: "Stop the server",
                restartServer: "Restart the server"
            }
        },
        testPage: {
            title: "YouTube Caption Test",
            getCaptions: "Get Captions",
            loading: "Loading captions...",
            serverResponse: "Server Response",
            formattedCaptions: "Formatted Captions",
            captionStats: "Found {lineCount} lines ({charCount} characters) of captions",
            success: "Successfully retrieved captions",
            initialized: "Page initialized"
        },
        diagnostics: {
            title: "YouTube Summarizer Diagnostics",
            initialized: "Diagnostic page initialized",
            envInfo: {
                title: "Environment Information",
                loaded: "Environment info loaded"
            },
            providerTest: {
                title: "Provider Test",
                testProvider: "Test Provider",
                testAll: "Test All Providers",
                googleStatus: "Google API Key Status",
                claudeStatus: "Claude API Key Status",
                configured: "Configured",
                notConfigured: "Not Configured"
            },
            captionTest: {
                title: "Caption Test",
                testCustom: "Test Custom Video",
                testAllLangs: "Test All Languages",
                testSample: "Test Sample Video"
            },
            debugLog: {
                title: "Debug Log",
                clear: "Clear Log",
                copy: "Copy Log",
                copied: "Log copied to clipboard",
                cleared: "Log cleared"
            }
        },
        apiInstructions: {
            title: "How to Get API Keys",
            claude: {
                title: "Claude API Key",
                step1: "Visit the Anthropic website: https://console.anthropic.com/",
                step2: "Sign up for an account or log in if you already have one",
                step3: "Navigate to the API Keys section in your account settings",
                step4: "Click \"Create New API Key\"",
                step5: "Copy your API key and store it securely",
                step6: "In the app settings, paste your Claude API key in the Claude API Key field",
                note: "Note: Keep your API key secure and never share it publicly. You can find more information about Claude's API pricing on their website."
            },
            google: {
                title: "Google API Key",
                step1: "Go to the Google Cloud Console: https://console.cloud.google.com/",
                step2: "Create a new project or select an existing one",
                step3: "Enable the YouTube Data API v3 for your project",
                step4: "Go to the Credentials page",
                step5: "Click \"Create Credentials\" and select \"API Key\"",
                step6: "Copy your API key",
                step7: "In the app settings, paste your Google API key in the Google API Key field",
                note: "Note: The YouTube Data API has quotas and usage limits. Make sure to review Google's pricing and quotas documentation."
            }
        }
    },
    ar: {
        title: "ملخص فيديو يوتيوب",
        urlPlaceholder: "أدخل رابط اليوتيوب",
        allowAutoGenerated: "السماح بالترجمات التلقائية",
        getCaptions: "الحصول على الترجمات",
        processingCaptions: "جاري معالجة الترجمات...",
        processingMessage: "جاري معالجة رسالتك...",
        chatPlaceholder: "اكتب رسالتك...",
        settings: {
            title: "إعدادات API",
            save: "حفظ الإعدادات",
            cancel: "إلغاء",
            googleSection: "إعدادات Google",
            claudeSection: "إعدادات Claude",
            debugSection: "إعدادات التصحيح",
            googleApiKey: "مفتاح Google API",
            claudeApiKey: "مفتاح Claude API",
            enableDebug: "تمكين وضع التصحيح",
            saved: "تم حفظ الإعدادات بنجاح",
            error: "خطأ في حفظ الإعدادات"
        },
        providers: {
            koboldcpp: "Koboldcpp",
            claude: "Claude (Opus)",
            haiku: "Claude (Haiku)",
            sonnet: "Claude (Sonnet)",
            google: "Google"
        },
        errors: {
            prefix: "خطأ",
            enterUrl: "الرجاء إدخال رابط يوتيوب",
            invalidUrl: "رابط يوتيوب غير صالح",
            noCaptions: "لم يتم العثور على ترجمات لهذا الفيديو",
            enterMessage: "الرجاء إدخال رسالة",
            loadCaptions: "الرجاء تحميل ترجمات الفيديو أولاً",
            sendFailed: "فشل في إرسال الرسالة",
            apiKeyRequired: "مفتاح API مطلوب لهذا المزود"
        },
        modelLimitNote: "ملاحظة: نظراً لقيود النموذج، سيتم اقتصار الترجمات عند معالجة أسئلتك. جميع الترجمات لا تزال مرئية هنا كمرجع.",
        buttons: {
            submit: "الحصول على الترجمات",
            send: "إرسال",
            settings: "الإعدادات",
            home: "الرئيسية",
            install: "تثبيت التطبيق",
            test: "صفحة الاختبار",
            diagnostics: "التشخيص",
            apiInstructions: "تعليمات API"
        },
        install: {
            title: "تثبيت VidChatBox على أندرويد",
            warning: "تأكد من تثبيت Termux من F-Droid (وليس من متجر Play) قبل المتابعة.",
            copy: "نسخ",
            copied: "تم النسخ!",
            copyError: "فشل نسخ الأمر. الرجاء المحاولة يدوياً.",
            step1: {
                title: "الخطوة 1: تثبيت التطبيقات المطلوبة",
                description: "قم بتثبيت هذه التطبيقات من F-Droid:",
                downloadTermux: "1. تحميل Termux",
                downloadWidget: "2. تحميل Termux:Widget",
                note: "Termux:Widget يتيح لك إنشاء أيقونة تشغيل على شاشة الرئيسية."
            },
            step2: {
                title: "الخطوة 2: تثبيت VidChatBox",
                description: "انقر على الزر أدناه لبدء التثبيت تلقائياً في Termux:",
                oneClick: "تثبيت بنقرة واحدة",
                manualDescription: "أو انسخ والصق هذا الأمر في Termux:",
                alternativeNote: "إذا لم تعمل الطرق أعلاه، جرب هذا البديل:"
            },
            step3: {
                title: "الخطوة 3: إنشاء أيقونة على الشاشة الرئيسية",
                step1: "اضغط مطولاً على شاشتك الرئيسية",
                step2: "اختر \"Widgets\"",
                step3: "ابحث وأضف \"Termux Widget\"",
                step4: "انقر على الويدجت واختر \"VidChatBox\"",
                note: "ستقوم الأيقونة تلقائياً بتشغيل الخادم وفتح التطبيق في المتصفح."
            },
            step4: {
                title: "الخطوة 4: الوصول إلى التطبيق",
                description: "يمكنك الوصول إلى VidChatBox بثلاث طرق:",
                method1: "انقر على أيقونة الشاشة الرئيسية (موصى به)",
                method2: "افتح في المتصفح: http://localhost:3005",
                method3: "استخدم سطر الأوامر في Termux:",
                startServer: "تشغيل الخادم",
                checkStatus: "التحقق من حالة الخادم",
                stopServer: "إيقاف الخادم",
                restartServer: "إعادة تشغيل الخادم"
            }
        },
        testPage: {
            title: "اختبار ترجمات يوتيوب",
            getCaptions: "الحصول على الترجمات",
            loading: "جاري تحميل الترجمات...",
            serverResponse: "استجابة الخادم",
            formattedCaptions: "الترجمات المنسقة",
            captionStats: "تم العثور على {lineCount} سطر ({charCount} حرف) من الترجمات",
            success: "تم استرجاع الترجمات بنجاح",
            initialized: "تم تهيئة الصفحة"
        },
        diagnostics: {
            title: "تشخيصات ملخص يوتيوب",
            initialized: "تم تهيئة صفحة التشخيص",
            envInfo: {
                title: "معلومات البيئة",
                loaded: "تم تحميل معلومات البيئة"
            },
            providerTest: {
                title: "اختبار المزود",
                testProvider: "اختبار المزود",
                testAll: "اختبار جميع المزودين",
                googleStatus: "حالة مفتاح Google API",
                claudeStatus: "حالة مفتاح Claude API",
                configured: "تم التكوين",
                notConfigured: "لم يتم التكوين"
            },
            captionTest: {
                title: "اختبار الترجمات",
                testCustom: "اختبار فيديو مخصص",
                testAllLangs: "اختبار جميع اللغات",
                testSample: "اختبار فيديو نموذجي"
            },
            debugLog: {
                title: "سجل التصحيح",
                clear: "مسح السجل",
                copy: "نسخ السجل",
                copied: "تم نسخ السجل إلى الحافظة",
                cleared: "تم مسح السجل"
            }
        },
        apiInstructions: {
            title: "كيفية الحصول على مفاتيح API",
            claude: {
                title: "مفتاح Claude API",
                step1: "قم بزيارة موقع Anthropic: https://console.anthropic.com/",
                step2: "قم بإنشاء حساب أو تسجيل الدخول إذا كان لديك حساب بالفعل",
                step3: "انتقل إلى قسم مفاتيح API في إعدادات حسابك",
                step4: "انقر على \"إنشاء مفتاح API جديد\"",
                step5: "انسخ مفتاح API الخاص بك واحفظه بشكل آمن",
                step6: "في إعدادات التطبيق، الصق مفتاح Claude API في حقل مفتاح Claude API",
                note: "ملاحظة: احتفظ بمفتاح API الخاص بك بشكل آمن ولا تشاركه علناً. يمكنك العثور على مزيد من المعلومات حول تسعير Claude API على موقعهم."
            },
            google: {
                title: "مفتاح Google API",
                step1: "اذهب إلى وحدة تحكم Google Cloud: https://console.cloud.google.com/",
                step2: "قم بإنشاء مشروع جديد أو اختر مشروعاً موجوداً",
                step3: "قم بتفعيل YouTube Data API v3 لمشروعك",
                step4: "اذهب إلى صفحة بيانات الاعتماد",
                step5: "انقر على \"إنشاء بيانات اعتماد\" واختر \"مفتاح API\"",
                step6: "انسخ مفتاح API الخاص بك",
                step7: "في إعدادات التطبيق، الصق مفتاح Google API في حقل مفتاح Google API",
                note: "ملاحظة: يحتوي YouTube Data API على حصص وحدود استخدام. تأكد من مراجعة وثائق التسعير والحصص من Google."
            }
        }
    }
};