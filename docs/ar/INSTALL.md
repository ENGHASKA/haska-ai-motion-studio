<div dir="rtl">

# التثبيت

[English](../en/INSTALL.md) · [العربية](INSTALL.md)

## المتطلبات الإلزامية

ثبّت Git وNode.js 22 أو أحدث وnpm وPython 3.10 أو أحدث وFFmpeg/FFprobe من مصادر رسمية موثوقة. لا يرفع HASKA الصلاحيات ولا يغيّر المستودعات أو التعريفات أو سياسات الحماية.

الحد الأدنى: 4 أنوية وذاكرة 8 GB ومساحة SSD قدرها 10 GB. الموصى به: 8 أنوية و16 GB و20 GB. البطاقة الرسومية اختيارية.

## Linux / Kali

```bash
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
cd haska-ai-motion-studio
./scripts/setup-linux.sh
./scripts/doctor-linux.sh
./run-studio.sh
```

يشغّل المثبّت `npm ci` من lockfile، وينشئ مجلدات محلية، ويربط مهارات Claude. لا يستخدم `sudo`.

```bash
./scripts/setup-linux.sh --python-deps  # حزم Python محلية اختيارية
./scripts/setup-linux.sh --whisper      # تنزيل اختياري بعد الموافقة
```

Blender اختياري: ضعه تحت `tools/` أو عيّن `HASKA_BLENDER`. لا تغيّر تعريفات الرسوميات.

## Windows 10/11 الأصلي

أمثلة WinGet بعد مراجعة كل حزمة:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

ثم افتح PowerShell جديدًا:

```powershell
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
Set-Location haska-ai-motion-studio
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-windows.ps1
.\run-studio.ps1
```

الخيار `-PythonDeps` ينشئ `.venv`. ينشئ المثبّت junction للمهارات أو ينسخها إذا تعذر ذلك. WSL2 غير إلزامي.

## Chromium وRemotion

يقبل الطبيب Chrome/Chromium/Edge مدعومًا أو نسخة Remotion المحلية. قد يحتاج أول رندر إلى الإنترنت لتنزيل headless shell. استخدم `HASKA_BROWSER` عند فشل الاكتشاف.

## NVIDIA وBlender

الفحص عبر `nvidia-smi` للقراءة فقط. لا تعديل لتعريف أو CUDA أو kernel أو وضع الطاقة. CI المستضاف لا يثبت توافق GPU.

## Claude Code

اختياري ويتطلب حساب Anthropic واتصالًا:

```bash
npm install -g @anthropic-ai/claude-code
claude doctor
claude
```

لا تستخدم sudo. الأوامر في `.claude/commands` والمهارات في `.agents/skills`.

## التحديث

انسخ مشاريعك غير المحفوظة، ثم:

```bash
git fetch --tags origin
git switch --detach vNEXT
npm ci
npm run doctor
```

مع الأرشيف، فك الإصدار الجديد في مجلد جديد وانقل مشاريعك وأصولك فقط بعد مراجعة التراخيص. لا تستبدل تثبيتًا يعمل بصورة عمياء.

</div>
