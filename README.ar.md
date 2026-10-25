<div dir="rtl">

# استوديو HASKA للموشن بالذكاء الاصطناعي

[English](README.md) · [العربية](README.ar.md)

HASKA بيئة محلية ثنائية اللغة لصناعة الموشن غرافيك باستخدام Remotion وReact وTypeScript وGSAP وThree.js وFFmpeg، مع دعم اختياري لـ Blender وwhisper.cpp. تحوّل وصفًا نصيًا أو تسجيلًا صوتيًا مراجعًا إلى معاينة ورندر حتميين مرتبطين بإطار Remotion.

هذا إصدار تجريبي عام مبكر. تم التحقق محليًا على Kali/Linux. توجد أدوات PowerShell واختبارات CI لويندوز، لكن اختبار الوسائط وChromium وGPU على جهاز Windows حقيقي ما زال مطلوبًا.

## المزايا

| المجال | ما يتضمنه |
| --- | --- |
| الإنتاج | ShotGraph وStyle Profiles وفهرس الأصول وQA وبوابات الموافقة |
| الحركة | مكوّنات كتابة وانتقالات وأنماط حركة وGSAP مربوط بالإطار |
| ثلاثي الأبعاد | Three.js وReact Three Fiber وRapier ولقطات Blender الاختيارية |
| الصوت | Audio-to-Motion ومراجعة النص والـ storyboard وترجمة RTL/LTR |
| المونتاج | خطط القص، المونتاج الإيقاعي، الأغلفة، النص خلف الشخص، EDL/OTIO |
| المساعد | أوامر ومهارات Claude Code داخل المشروع |
| التوزيع | ZIP لويندوز وtar.gz للينكس مع manifest وSHA-256 |

## المتطلبات

- Git وNode.js 22 أو أحدث وnpm وPython 3.10 أو أحدث وFFmpeg/FFprobe.
- الحد الأدنى: معالج حديث بأربع أنوية، وذاكرة 8 GB، ومساحة SSD قدرها 10 GB.
- الموصى به: 8 أنوية، وذاكرة 16 GB، ومساحة 20 GB، وبطاقة رسومية مدعومة.
- NVIDIA وBlender وwhisper.cpp اختيارية. لا تعدّل أدوات التثبيت التعريفات أو kernel أو GRUB أو حماية النظام.
- قد ينزّل Remotion نسخة Chromium متوافقة عند أول رندر إذا لم يجد متصفحًا محليًا مدعومًا.

## التثبيت

افحص النسخة المحلية قبل تشغيل المثبّت.

### Linux / Kali

```bash
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
cd haska-ai-motion-studio
./scripts/setup-linux.sh
./run-studio.sh
```

### Windows 10/11 عبر PowerShell

```powershell
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
Set-Location haska-ai-motion-studio
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
.\run-studio.ps1
```

الخيار `ExecutionPolicy` أعلاه خاص بهذه العملية ولا يغيّر سياسة الجهاز. WSL2 بديل اختياري فقط. افتح <http://localhost:3000>؛ المشغّل يربط الخدمة محليًا فقط.

## أول فيديو

```bash
npm run production -- new hello --title "أول فيديو" --platform youtube --language ar --style haska-cyber
npm run production -- validate hello
npm run production -- qa hello
npm run production -- preview hello
```

عدّل `production/projects/hello/brief.md` و`shot-graph.json`. الرندر محمي ببوابة موافقة؛ راجع [البدء السريع](docs/ar/QUICK_START.md).

## Claude Code (اختياري)

يتطلب حساب Anthropic واتصالًا بالإنترنت، وتكاليفه منفصلة عن HASKA:

```bash
npm install -g @anthropic-ai/claude-code
claude doctor
claude
```

لا تستخدم `sudo npm install -g`. بعد التشغيل استخدم `/create-video <الوصف>`، أو بعد استيراد التعليق الصوتي استخدم `/audio-to-motion <project-id>`.

## الوثائق

- [التثبيت](docs/ar/INSTALL.md) · [البدء السريع](docs/ar/QUICK_START.md)
- [المزايا والبنية](docs/ar/FEATURES.md)
- [حل المشكلات](docs/ar/TROUBLESHOOTING.md) · [التطوير](docs/ar/DEVELOPMENT.md)
- [التراخيص](docs/ar/LICENSING.md) · [إشعارات الطرف الثالث](THIRD_PARTY_NOTICES.md)

## حالة التوافق

| الهدف | الحالة |
| --- | --- |
| Kali/Linux x64 | تم التحقق محليًا من الفحوص والاختبارات والحزمة |
| Ubuntu في GitHub Actions | مُعدّ في CI، والنتيجة الفعلية تظهر بعد تشغيل workflow |
| Windows في GitHub Actions | مُعدّ في CI من دون ضمان GPU أو Blender |
| جهاز Windows 10/11 حقيقي | ما زال يحتاج اختبار الوسائط وChromium وGPU |
| NVIDIA / OptiX / Blender GPU | اختياري وغير متاح في CI المستضاف |

## الأمان والمساهمة

اقرأ [SECURITY.md](SECURITY.md) قبل الإبلاغ عن ثغرة، و[CONTRIBUTING.md](CONTRIBUTING.md) للمساهمة بالكود أو المهارات. لا ترفق تسجيلًا خاصًا أو فيديو عميل أو بيانات اعتماد في issue عامة.

## الترخيص

كود HASKA الأصلي في هذه اللقطة منشور بترخيص MIT. كود Majed والخطوط وRemotion وGSAP وبقية التبعيات تحت تراخيصها وشروطها المنفصلة. Remotion ليس MIT وقد يحتاج ترخيص شركة مدفوعًا بحسب حجم الجهة وطريقة الاستخدام. راجع [تفاصيل الترخيص](docs/ar/LICENSING.md).

</div>
