<div dir="rtl">

# 🇸🇦 نظام جسر فيشيو × AI CLI (feishu-claudecode-bridge)

> حوّل روبوت فيشيو إلى واجهة تفاعل عن بُعد مع أدوات AI CLI مثل Claude Code / Codex. لا حاجة بعد الآن للدخول عبر SSH إلى الخادم وفتح طرفية — فقط أشر إلى الروبوت بـ @ في فيشيو، واستطع تشغيل واحد أو أكثر من عمليات البرمجة بالذكاء الاصطناعي.

[🌐 إصدارات متعددة اللغات](#-إصدارات-متعددة-اللغات--language-versions) · [🤖 تطبيق أندرويد المرافق bacs-android](#-تطبيق-أندرويد-المرافق-bacs-android)

---

## 📖 جدول المحتويات

- [مقدمة المشروع](#-مقدمة-المشروع)
- [الميزات الأساسية](#-الميزات-الأساسية)
- [بنية النظام](#-بنية-النظام)
- [هيكل المشروع](#-هيكل-المشروع)
- [البدء السريع](#-البدء-السريع)
- [دليل النشر](#-دليل-النشر)
- [دليل الاستخدام](#-دليل-الاستخدام)
- [تطبيق أندرويد المرافق bacs-android](#-تطبيق-أندرويد-المرافق-bacs-android)
- [متغيرات البيئة](#-متغيرات-البيئة)
- [الأسئلة الشائعة](#-الأسئلة-الشائعة)
- [الإصدارات والتكرارات](#-الإصدارات-والتكرارات)
- [الرخصة](#-الرخصة)

---

## 🌟 مقدمة المشروع

**feishu-claudecode-bridge** هو نظام جسر ثنائي الاتجاه بين روبوتات فيشيو وأدوات AI CLI (Claude Code / Codex). يعمل خادم Bridge دائم التشغيل على توجيه أحداث رسائل فيشيو إلى عمليات CLI محددة، ثم يعيد إرسال ردود CLI إلى مجموعة فيشيو أو المحادثة الخاصة المقابلة.

سيناريوهات الاستخدام:
- التعاون عبر مجموعات فيشيو لتشغيل مهام البرمجة بالذكاء الاصطناعي ضمن الفريق
- التحكم عن بُعد في Claude Code على الخادم في حالات عدم توفر جهاز كمبيوتر (هاتف، جهاز لوحي)
- ربط عمليات AI متعددة على نفس الخادم بمجموعات فيشيو مختلفة لعزل المشاريع
- مراقبة تقدم معالجة AI والسجلات والمحادثات Timeline في الوقت الفعلي عبر المتصفح أو تطبيق أندرويد

---

## ✨ الميزات الأساسية

| الوحدة | القدرة |
|--------|--------|
| **ربط آلات متعددة** | دعم إدارة عمليات CLI متعددة على نفس الخادم في وقت واحد (cc-a / cc-b / codex-x ...)، كل عملية مرتبطة بروبوت فيشيو مستقل |
| **إدارة الآلات عن بُعد** | منفذ SSH Executor مدمج، إدارة موحدة لجلسات tmux على الجهاز المحلي + آلات بعيدة متعددة |
| **دعم CLI مزدوج** | محولان لـ Claude Code (cc) و Codex، قابلان للاستخدام المتزامن |
| **تكوين مزودي خدمة مرن** | تكوينات مدمجة لمزودي خدمة مثل Anthropic / OpenAI، دعم base_url مخصص ومفتاح API |
| **نماذج متعددة + Effort** | cc يدعم low~max، codex يدعم minimal~xhigh، قطع تلقائي حسب maxEffort النموذج |
| **Web Terminal** | اتصال xterm مباشر داخل المتصفح بـ tmux pane، ما تراه هو ما تحصل عليه، إغلاق النافذة لا يقتل عملية العمل |
| **Timeline فوري** | دفع SSE فوري لجميع رسائل AI ↔ المستخدم على الصفحة الرئيسية، مع رسوم متحركة TransitionGroup |
| **مصادقة TOTP ثنائية العامل** | 2FA مدمج، دعم بصمة الجهاز الموثوق (FingerprintJS) + Cookie Token بقناتين |
| **سجلات التدقيق** | جميع العمليات الحساسة (ربط، تسجيل دخول، اتصال Terminal) تُكتب في audit_logs |
| **سمة بأسلوب macOS** | تصميم أبيض وأسود ورمادي بـ Tailwind + shadcn/ui، دعم التبديل بين Light/Dark |
| **نشر بنقرة واحدة بـ PM2** | `deploy.sh` + `ecosystem.config.cjs` مدمجان، فصل بين المصدر وبيئة التشغيل |

---

## 🏗 بنية النظام

```
┌────────────┐   @ روبوت + رسالة    ┌────────────────┐
│  المستخدم   │ ───────────────────▶│  منصة فيشيو   │
│ (فيشيو/هاتف) │ ◀───────────────── │  المفتوحة      │
└────────────┘                     └────────┬───────┘
                                            │ Webhook / WS
                                            ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ تجريد Channel     │   │   ← عميل فيشيو WS
                              │  │ توجيه Session     │   │
                              │  │ محول CLI          │   │
                              │  │ منفذ (محلي+SSH)   │   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  الجهاز المحلي أو البعيد │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

حزمة التقنيات:
- **الواجهة الأمامية**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **الواجهة الخلفية**: Node.js 20+ + Express + ws + node-pty + ssh2
- **قاعدة البيانات**: SQLite + Drizzle ORM
- **إدارة العمليات**: tmux + PM2

---

## 📁 هيكل المشروع

```
feishu-claudecode-bridge/
├── src/
│   ├── client/               # واجهة Vue 3 الأمامية
│   │   ├── views/            # 9 صفحات أساسية
│   │   ├── components/       # مكونات مشتركة
│   │   ├── composables/      # useAuth / useDeviceId / useTerminalSession
│   │   └── router/           # vue-router
│   ├── server/               # واجهة Express الخلفية
│   │   ├── routes/           # auth/bindings/machines/providers/sessions/logs/timeline/settings/models/health
│   │   ├── channel/          # قناة فيشيو WS + واجهة مجردة
│   │   ├── cli/              # محول CC / Codex
│   │   ├── executor/         # منفذ محلي + SSH
│   │   ├── terminal/         # pty-bridge + ws-server
│   │   ├── auth/             # JWT + TOTP + بصمة جهاز موثوق
│   │   ├── db/               # Drizzle schema + ملفات الترحيل
│   │   └── session/          # آلة حالة الجلسة
│   └── shared/               # أنواع مشتركة بين الواجهتين
├── scripts/                  # migrate-db / seed-admin / migrate-bindings
├── data/                     # قاعدة بيانات SQLite
├── docs/                     # التوثيق
├── deploy.sh                 # سكريبت نشر بنقرة واحدة بـ PM2
├── cll.sh                    # سكريبت تثبيت عن بُعد بنقرة واحدة
├── ecosystem.config.cjs      # إعدادات PM2
├── .env.example
└── package.json
```

---

## 🚀 البدء السريع

### 1. متطلبات البيئة

- Node.js ≥ 20
- npm ≥ 10 (أو pnpm)
- tmux ≥ 3.0
- أداة AI CLI واحدة على الأقل قابلة للتنفيذ: `claude` أو `codex`
- تطبيق فيشيو مؤسسي ذاتي البناء (يتطلب تفعيل `im:message` و `im:message.group_at_msg`)

### 2. التشغيل المحلي

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge
npm install
cp .env.example .env
npm run db:migrate
npm run seed
npm run dev
```

افتح `http://localhost:3456/`، واستخدم الحساب الافتراضي `nimasile` / كلمة المرور المحددة في `ADMIN_PASSWORD` ضمن `.env` لتسجيل الدخول.

---

## 📦 دليل النشر

### الطريقة الأولى: نشر عن بُعد بنقرة واحدة (موصى به)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh)
```

تحديد مجلد التثبيت:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh) /opt/feishu-bridge
```

### الطريقة الثانية: نشر يدوي بـ PM2

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge
bash deploy.sh
```

### الطريقة الثالثة: عملية التحديث اليومية

```bash
cd sourceCode/
git pull
bash deploy.sh
```

### خطوات ضرورية بعد النشر الأول

1. عدّل `deploy/.env`، وأدخل `JWT_SECRET` و `ADMIN_PASSWORD`
2. افتح المتصفح على `http://<IP-الخادم>:3456/`
3. بعد تسجيل الدخول بالحساب الافتراضي، انتقل إلى «الإعدادات» وفعّل 2FA
4. قائمة «الآلات»: الجهاز المحلي جاهز افتراضيًا؛ لإضافة آلة بعيدة، أنشئ واحدة وأدخل بيانات SSH
5. قائمة «مزودي الخدمة»: أنشئ مزود خدمة جديد، وأدخل base_url + مفتاح API
6. ابدأ جلسة tmux على الخادم: `tmux new-session -d -s cc-work`
7. قائمة «الربط»: أضف ربط روبوت فيشيو جديد
8. أشر إلى الروبوت بـ @ في مجموعة فيشيو وأرسل أي رسالة ← سيبدأ النظام العملية ويقوم بالجسر تلقائيًا

---

## 📘 دليل الاستخدام

### تكوين تطبيق فيشيو

1. ادخل إلى منصة فيشيو المفتوحة، وأنشئ تطبيقًا مؤسسيًا ذاتي البناء
2. فعّل الصلاحيات: `im:message` و `im:message:receive_v1` و `im:message.group_at_msg`
3. اشتراك الأحداث: فعّل وضع الاتصال الطويل (موصى به) أو اضبط Request URL
4. انسخ App ID / App Secret / Verification Token / Encrypt Key ← ألصقها في إعدادات ربط Bridge

### إنشاء ربط

ادخل إلى قائمة «الربط» ← أضف جديد:
- اسم الربط، الآلة، نوع CLI، مزود الخدمة، النموذج، Effort
- المجموعة الرباعية لتطبيق فيشيو: App ID / Secret / Verification Token / Encrypt Key

### Web Terminal

اضغط زر Terminal في قائمة الربط، سيُفتح xterm مباشرة في المتصفح. إغلاق تبويب المتصفح لا يقتل جلسة tmux، وتستمر عملية العمل بالتشغيل.

### Timeline الفوري

يعرض قسم Timeline في أسفل الصفحة الرئيسية آخر 20 رسالة (دفع SSE فوري).

### سجلات النظام

قائمة السجلات: تمرير فوري لسجلات تشغيل الواجهة الخلفية عبر SSE.

### تبديل السمة

أيقونة الشمس/القمر في الزاوية العلوية اليمنى للتبديل بين وضعي Light / Dark.

---

## 📱 تطبيق أندرويد المرافق bacs-android

> عنوان المشروع: https://github.com/LengendXing/bacs-android

bacs-android هو تطبيق أندرويد الرسمي المرافق لهذا النظام:
- استلام دفعات Bridge Timeline فوريًا في الوقت الفعلي
- إدخال الأوامر مباشرة من الهاتف وإرسالها إلى Bridge
- عرض حالة جميع عمليات CLI المرتبطة
- تصفح المحادثات السابقة وسجلات النظام
- تسجيل دخول بمصادقة TOTP ثنائية العامل + بصمة جهاز موثوق
- سمة Light / Dark تتبع النظام

---

## 🔧 متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `BRIDGE_PORT` | `3456` | منفذ استماع HTTP / WS |
| `BRIDGE_HOST` | `0.0.0.0` | عنوان الاستماع |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | فاصل تحديث بطاقة التقدم (بالثواني) |
| `BRIDGE_TIMEOUT` | `600` | مهلة انتظار AI لكل طلب (بالثواني) |
| `BRIDGE_POLL_INTERVAL` | `2` | فاصل اقتراع tmux capture-pane (بالثواني) |
| `BRIDGE_MAX_CONCURRENT` | `4` | الحد الأقصى للجلسات المتزامنة |
| `DB_PATH` | `./data/bridge.db` | مسار ملف SQLite |
| `JWT_SECRET` | — | **مطلوب**، مفتاح توقيع JWT |
| `ADMIN_PASSWORD` | `admin` | كلمة مرور المدير عند التهيئة الأولى (seed) |
| `LOG_LEVEL` | `info` | مستوى التسجيل |
| `LOG_DIR` | `./logs` | مجلد السجلات |

---

## ❓ الأسئلة الشائعة

**س: لا استجابة بعد إرسال رسالة في فيشيو؟**
ج: تحقق من حالة الربط هل هي online؛ هل جلسة tmux لا تزال نشطة؛ هل مفتاح API صالح.

**س: فشل تسجيل الدخول على الآلة البعيدة؟**
ج: تم الإصلاح في v1.0.8 — تأكد من استخدام أمر تشغيل tmux مُغلّف بـ bash -ilc.

**س: انقطاع الاتصال أثناء مهمة SSH طويلة؟**
ج: تم الإصلاح في v1.0.10 — نبضات القلب من 5min إلى 30s.

**س: هل إغلاق Web Terminal يقتل عملية العمل؟**
ج: لا. Web Terminal يقوم فقط بفصل عميل tmux.

---

## 🗂 الإصدارات والتكرارات

الإصدارات الأخيرة:
- **v1.1.7** (الحالي) — README متعدد اللغات (10+ لغة)
- **v1.1.6** — Timeline فوري
- **v1.1.5** — إعادة هيكلة بصمة الجهاز الموثوق
- **v1.1.4** — BindingsView بتبويب مزدوج + ترقيم الصفحات
- **v1.1.3** — Web Terminal
- **v1.0.0** — إعادة هيكلة شاملة

---

## 🌐 إصدارات متعددة اللغات / Language Versions

| اللغة | Language | الملف |
|-------|----------|-------|
| 🇨🇳 简体中文 | Chinese (Simplified) | [README.zh.md](README.zh.md) |
| 🇺🇸 English | English | [README.en.md](README.en.md) |
| 🇯🇵 日本語 | Japanese | [README.ja.md](README.ja.md) |
| 🇷🇺 Русский | Russian | [README.ru.md](README.ru.md) |
| 🇩🇪 Deutsch | German | [README.de.md](README.de.md) |
| 🇫🇷 Français | French | [README.fr.md](README.fr.md) |
| 🇪🇸 Español | Spanish | [README.es.md](README.es.md) |
| 🇸🇦 العربية | Arabic (RTL) | [README.ar.md](README.ar.md) |
| 🇨🇳 བོད་སྐད་ | Tibetan | [README.bo.md](README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | Uyghur (RTL) | [README.ug.md](README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](README.ko.md) |

---

## 📄 الرخصة

MIT © [LengendXing](https://github.com/LengendXing)

</div>
