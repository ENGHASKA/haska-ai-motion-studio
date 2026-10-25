<div dir="rtl">

# البدء السريع

[English](../en/QUICK_START.md) · [العربية](QUICK_START.md)

شغّل `npm run doctor` ثم `npm run studio` وافتح <http://localhost:3000>.

## فيديو من وصف نصي

```bash
npm run production -- new first-video --title "أول فيديو" --platform youtube --language ar --style haska-cyber
npm run production -- validate first-video
npm run production -- qa first-video
npm run production -- preview first-video
```

عدّل `brief.md` و`shot-graph.json` داخل المشروع. الصيغ: `youtube` و`reel` و`tiktok` و`square` و`web-hero`. الأنماط المدمجة تشمل `haska-cyber` و`haska-signal`.

داخل Claude Code:

```text
/create-video مقدمة عربية لمنتج مدتها عشر ثوانٍ بصيغة Reel عمودية
```

يجهّز Claude الخطة والمعاينة، ولا يوافق أو يرندر نيابة عنك.

## Audio-to-Motion

```bash
python3 scripts/audio_motion.py import /path/to/narration.wav --name first-audio --language ar
python3 scripts/audio_motion.py validate first-audio
python3 scripts/audio_motion.py preview first-audio
```

صحّح `transcript.json` ثم راجع دلالة مشاهد `storyboard.json`. داخل Claude استخدم `/audio-to-motion first-audio`. التأثيرات الصوتية مساعدة ولا تستبدل فهم المحتوى.

النص العربي باتجاه RTL ويُحرّك كلمة أو سطرًا، ولا يُفصل إلى أحرف.

## الموافقة والرندر

```bash
npm run production -- approval submit storyboard first-video --actor contributor
npm run production -- approval approve storyboard first-video --actor YOUR_NAME
npm run production -- render first-video
```

المراجع البشري وحده ينفّذ الموافقة. لمشروع صوتي: `./render-audio.sh first-audio youtube`. أوامر الرندر تتحقق من المشروع ومن الملف عبر FFprobe.

</div>
