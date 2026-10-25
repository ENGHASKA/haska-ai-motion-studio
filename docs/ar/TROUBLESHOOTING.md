<div dir="rtl">

# حل المشكلات

[English](../en/TROUBLESHOOTING.md) · [العربية](TROUBLESHOOTING.md)

ابدأ بـ `npm run doctor` أو طبيب النظام؛ الفحص للقراءة فقط.

## Node أو npm

استخدم Node.js 22 أو أحدث وشغّل `npm ci` للحزم المقفلة. لا تحذف lockfile.

## FFmpeg أو FFprobe

ثبتهما من المصدر الموثوق نفسه، أو عيّن `HASKA_FFMPEG` و`HASKA_FFPROBE` إلى مسارات مطلقة.

## معاينة فارغة

شغّل `npm run typecheck` ثم `npm run compositions` واقرأ سجل الطرفية. بعض تركيبات التحرير ذات المدخل الفارغ تعرض placeholder موصوفًا عمدًا، والعينة الصوتية العامة لا تضم تسجيلًا صوتيًا.

## فشل Chromium

ثبّت Chrome/Chromium/Edge محليًا وعيّن `HASKA_BROWSER`. لا تعطّل antivirus أو sandbox عالميًا.

## مسارات Windows

استخدم مسارًا قصيرًا مثل `C:\HASKA`. فعّل long paths فقط وفق سياسة مؤسستك. WSL2 اختياري.

## حزم Python

لينكس: `./scripts/setup-linux.sh --python-deps`. ويندوز: `.\scripts\setup-windows.ps1 -PythonDeps`.

## أوامر Claude غير ظاهرة

تحقق من `.claude/skills/haska-video/SKILL.md` وأعد تشغيل المثبّت، ثم شغّل `claude` من جذر المشروع.

## تحذير NVIDIA أو Blender

اختياري. لا تغيّر التعريفات من أجل HASKA. عيّن `HASKA_BLENDER` لتثبيت محلي مختبر.

## الإبلاغ

أرفق النظام والمعمارية وإصدارات Node/Python/FFmpeg وخرج الطبيب ومثالًا غير خاص. احذف أسماء المستخدمين والمسارات والرموز والوسائط.

</div>
