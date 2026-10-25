<div dir="rtl">

# التطوير

[English](../en/DEVELOPMENT.md) · [العربية](DEVELOPMENT.md)

## الإعداد والفحوص

```bash
npm ci
npm run typecheck
npm run test:production
python3 -m unittest discover -s tests/python -v
npm run smoke:majed
```

شغّل `npm run studio` لمعاينة محلية. لا ترفع node_modules أو caches أو renders أو تسجيلات أو نماذج أو إعدادات محلية أو مشاريع إنتاج.

## الحتمية

استخدم `useCurrentFrame()` و`useVideoConfig()`. يجب إيقاف GSAP والانتقال فيه وفق frame/fps. استخدم `ThreeCanvas` للرندر ثلاثي الأبعاد. لا loops حرة أو timers أو CSS transitions أو عشوائية بلا seed.

ضع المكوّنات في `src/components`، وأدوات الحركة في `src/motion` أو `src/lib`، والطباعة في `src/typography`.

## الإنتاج

شغّل `validate` و`qa ID`، واحفظ النص داخل safe area، ولا تقسّم العربية دون مستوى الكلمة. لا توافق نيابة عن المراجع.

## المهارات والمساهمات

اقرأ `SKILL.md` المناسب قبل تعديل الحركة. يجب أن تبقى المهارات محلية ومحددة ومن دون أسرار أو ترويج أو تحديث تلقائي. حدّث الوثائق الإنجليزية والعربية معًا، وأضف اختبارات، واذكر ما تم التحقق منه فعلًا.

## الإصدارات

`npm run release:build` ينفذ الفحوص ويمسح اللقطة المسموحة ويبني ZIP لويندوز وtar.gz للينكس مع SHA-256 ويختبر الفك في مجلد جديد. نستخدم SemVer وتبقى وسوم beta إصدارات أولية.

</div>
