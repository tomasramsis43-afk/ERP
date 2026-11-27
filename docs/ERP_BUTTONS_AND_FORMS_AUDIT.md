# تدقيق الأزرار والنماذج والمدخلات — واجهة الويب

**المنهج:** فحص ساكن للكود (static) + مطابقة كل مسار API تستدعيه الواجهة مع مسارات الـ Controllers + قراءة يدوية للصفحات ذات المخاطر.
**ما لم يُنفَّذ:** لم تُشغَّل الواجهة في متصفح ولم تُشغَّل اختبارات الـ e2e (لا يتوفر PostgreSQL ولا محرك Prisma في بيئة الفحص). لذلك الحالات أدناه "مؤكدة من الكود" وليست "مؤكدة بالتشغيل".

## ملخص النتائج

| الفحص | النتيجة |
|---|---|
| مسارات API التي تستدعيها الواجهة وليس لها Controller | **0** (كل الاستدعاءات مطابقة لمسارات موجودة) |
| مسارات API في الباك إند (135) التي لا يوجد لها أي استخدام في الويب | الاستخدامات الفعلية ديناميكية (hooks)، والفحص اليدوي أثبت أن كل وحدة لها واجهة عدا **قواعد العمولات** و**سجل إقفالات المندوب** (تم إصلاحهما في هذا الفرع) |
| علامات TODO / mock / dummy / "قريباً" في الكود | **0** |
| `catch {}` فارغ | **0** (لكن وُجد `.catch(() => undefined)` يبتلع الأخطاء في موضعين — تم إصلاحهما) |
| أزرار بلا `onClick` | **0** |

## عيوب مؤكدة وتم إصلاحها في فرع `erp-audit-fixes`

| # | الملف | العيب | الأثر | الإصلاح |
|---|---|---|---|---|
| 1 | `representatives/page.tsx` | نموذج المندوب يرسل `jobTitle` و`baseSalary` و`financialAccountId` وهي غير موجودة في `CreateRepresentativeDto`، والـ API يستخدم `forbidNonWhitelisted: true` | **رفض 400** عند ملء أي منها | حُذفت الحقول (الراتب في الموارد البشرية، وحساب العهدة يُنشأ تلقائياً من الخادم) |
| 2 | `representatives/page.tsx` | حقول الخط والسيارة والمستخدم حقول نص حر تتطلب لصق UUID | النموذج غير قابل للاستخدام فعلياً | قوائم منسدلة تجلب بيانات حقيقية (`routes`, `vehicles`, `users`) |
| 3 | `representatives/page.tsx` | حقل `userId` ظاهر في التعديل، لكن `UpdateRepresentativeDto` لا يقبله | رفض 400 عند التعديل | `hideInEdit` |
| 4 | `representatives/page.tsx` | زر "مندوب جديد" في رأس الصفحة يضبط حالة `creating` لا يقرؤها أحد | **زر ميت** (يوجد زر ثانٍ سليم داخل الجدول) | حُذف الزر المكرر والحالة |
| 5 | `representatives/page.tsx` تبويب العمولات | يقرأ `period` و`paid` و`total` بينما الكيان يحوي `sourceType` و`paidAt` و`amount` | عمود الفترة دائماً "—"، والعمولة **المدفوعة تظهر "مستحقة"** دائماً | أعمدة مطابقة للبيانات الفعلية + إجمالي المستحق من الـ API |
| 6 | نفس التبويب | صرف العمولات يستخدم `accounts.data?.[0]` (أول حساب مالي عشوائياً، وقد يكون undefined) بلا تأكيد، ولا يُحدّث الجدول بعد الصرف | **صرف من حساب لم يختره المستخدم** | اختيار صريح للحساب + نافذة تأكيد + إعادة تحميل |
| 7 | نفس التبويب | جلب خام `fetch` يتجاوز مساعد `api` ويبتلع الأخطاء | فشل صامت وعدم إعادة التوجيه عند انتهاء الجلسة | استخدام `useApi` |
| 8 | تبويب إقفال اليوم | تعبئة "النقدية المعلنة" و"المعدود" مسبقاً بالقيم المتوقعة من النظام | **إخفاء النقص الحقيقي**: الضغط على "إقفال" يسجل مطابقة تامة دون عدّ | الحقول فارغة وإلزامية، عرض الفرق لحظياً، ومنع الإقفال حتى إدخال كل الأصناف، مع تأكيد يذكر الفروقات |
| 9 | `vehicles/page.tsx` | حقل الخط نص حر (UUID) | غير قابل للاستخدام | قائمة منسدلة حقيقية |
| 10 | `treasury/page.tsx` (سجل التسويات البنكية) | `fetch` خام + `.catch(() => undefined)` | فشل صامت | `get` مع إشعار بالخطأ |
| 11 | الصفحة + الـ API | لا واجهة لقواعد العمولات (3 مسارات API بلا واجهة) | لا يمكن ضبط سياسة العمولة إلا بالـ API | تبويب "قواعد العمولات": عرض/إضافة/إيقاف |
| 12 | الصفحة + الـ API | لا واجهة لسجل إقفالات المندوب (`GET :id/closings`) | لا يمكن مراجعة الإقفالات السابقة | تبويب "سجل الإقفالات" بفروق النقدية والمخزون |

## فحوص أُجريت وتبيّن أنها سليمة (لا تُعدَّل)

- كل مسار تستدعيه الواجهة له Controller مطابق.
- حالات `creating`/`detailId` في صفحات المحاسبة والموارد البشرية والخطوط والمخازن مستخدمة فعلاً (فُحصت يدوياً بعد أن أظهر فحص آلي أولي إيجابيات كاذبة).
- الجلسة: كوكيز httpOnly عبر وكيل same-origin؛ ولا يوجد وصول مباشر للتوكن من المتصفح.

## فجوات معروفة لم تُعالَج بعد (مرتبطة بمراحل لاحقة)

1. **أسباب الفروقات عند إقفال اليومية:** `CloseDayDto` لا يحتوي حقل سبب/ملاحظة ولا اعتماد صاحب صلاحية للفرق غير الصفري (مطلب المرحلة الخامسة). يحتاج تعديل API + migration + واجهة.
2. **تعديل الحقول إلى فارغ:** `ResourcePage` يتجاهل القيم الفارغة، لذلك لا يمكن إزالة الخط/السيارة من مندوب بعد تعيينها.
3. اختبارات الواجهة (UI/E2E) غير موجودة: لا Playwright ولا اختبارات مكونات.

## جرد الصفحات (مولَّد آلياً من الكود)

### `app/(app)/accounting/accounts/page.tsx`
- أزرار/إجراءات: تعديل, حساب جديد, حفظ, لا توجد حسابات
- مسارات API: `accounting/accounts`, `accounting/accounts/${editing.id}`
- حقول نماذج معرّفة: 0

### `app/(app)/accounting/journal/page.tsx`
- أزرار/إجراءات: إضافة بند, إلغاء, تأكيد, ترحيل, حفظ, عكس, قيد جديد
- مسارات API: `accounting/accounts`, `accounting/journal-entries`, `accounting/journal-entries/${id}`, `accounting/journal-entries/${id}/post`, `accounting/journal-entries/${id}/reverse`
- حقول نماذج معرّفة: 0

### `app/(app)/accounting/ledger/page.tsx`
- أزرار/إجراءات: —
- مسارات API: `accounting/accounts`, `accounting/reports/trial-balance`
- حقول نماذج معرّفة: 0

### `app/(app)/admin/page.tsx`
- أزرار/إجراءات: إغلاق, إلغاء, تعديل, تغيير الحالة, حفظ, دور جديد, فترة جديدة, لا توجد أدوار, لا توجد مستخدمون, مستخدم جديد
- مسارات API: `fiscal-periods`, `fiscal-periods/${id}`, `permissions`, `roles`, `roles/${editing.id}`, `settings`, `users`, `users/${statusTarget.id}/status`
- حقول نماذج معرّفة: 1

### `app/(app)/catalog/page.tsx`
- أزرار/إجراءات: وحدة جديدة
- مسارات API: `product-categories`, `units`
- حقول نماذج معرّفة: 6

### `app/(app)/customers/page.tsx`
- أزرار/إجراءات: —
- مسارات API: —
- حقول نماذج معرّفة: 0

### `app/(app)/dashboard/page.tsx`
- أزرار/إجراءات: —
- مسارات API: `financial-accounts`, `inventory/balances`, `reports/dashboard`, `sales/invoices`
- حقول نماذج معرّفة: 0

### `app/(app)/hr/page.tsx`
- أزرار/إجراءات: إلغاء, اعتماد, تسجيل, تشغيل المرتبات, تقديم, حفظ, رفض, سلفة جديدة, صرف, طلب إجازة
- مسارات API: `financial-accounts`, `hr/advances`, `hr/attendance`, `hr/employees`, `hr/leaves`, `hr/leaves/${id}/decide`, `hr/payroll`, `hr/payroll/${id}`, `hr/payroll/${payId}/pay`, `users`
- حقول نماذج معرّفة: 10

### `app/(app)/inventory/page.tsx`
- أزرار/إجراءات: إضافة صنف, إلغاء, تحويل مخزون, تسوية جرد, تنفيذ, رصيد افتتاحي
- مسارات API: `inventory/${mode`, `warehouses`
- حقول نماذج معرّفة: 0

### `app/(app)/products/page.tsx`
- أزرار/إجراءات: إضافة وحدة, تعديل, حذف, حفظ, حفظ السعر, صنف جديد, لا توجد أصناف
- مسارات API: `customers`, `product-categories`, `products`, `products/${product.id}`, `products/${product.id}/customer-prices`, `units`
- حقول نماذج معرّفة: 0

### `app/(app)/purchases/page.tsx`
- أزرار/إجراءات: —
- مسارات API: —
- حقول نماذج معرّفة: 0

### `app/(app)/reports/page.tsx`
- أزرار/إجراءات: تصدير
- مسارات API: —
- حقول نماذج معرّفة: 0

### `app/(app)/representatives/page.tsx`
- أزرار/إجراءات: إقفال اليوم, صرف العمولات, قاعدة جديدة, لا توجد قواعد عمولات, معاينة
- مسارات API: `financial-accounts`, `representatives`, `representatives/${rep.id}`, `representatives/${rep.id}/close-day`, `representatives/${rep.id}/closing-preview`, `representatives/${repId}/closings`, `representatives/${repId}/commissions`, `representatives/${repId}/commissions/pay`, `representatives/commission-rules`, `representatives/commission-rules/${r.id}/deactivate`, `routes`, `users`, `vehicles`
- حقول نماذج معرّفة: 8

### `app/(app)/routes/page.tsx`
- أزرار/إجراءات: إلغاء, تعيين عملاء, حفظ, خط جديد, منطقة جديدة
- مسارات API: `customers`, `geo-areas`, `routes`, `routes/${assignRoute.id}/customers`
- حقول نماذج معرّفة: 0

### `app/(app)/sales/page.tsx`
- أزرار/إجراءات: —
- مسارات API: —
- حقول نماذج معرّفة: 0

### `app/(app)/suppliers/page.tsx`
- أزرار/إجراءات: —
- مسارات API: —
- حقول نماذج معرّفة: 0

### `app/(app)/treasury/page.tsx`
- أزرار/إجراءات: إرجاع, إصدار شيك, إلغاء, استلام شيك, تأكيد, تحصيل, تراجع, تسوية, حساب جديد, حفظ, سند جديد, لا توجد سندات
- مسارات API: `banks/${bankId}/reconcile`, `banks/${bankId}/reconciliations`, `customers`, `financial-accounts`, `suppliers`, `treasury/cheques/${cheque`, `treasury/cheques/incoming`, `treasury/cheques/outgoing`, `treasury/vouchers`, `treasury/vouchers/${voucher`
- حقول نماذج معرّفة: 0

### `app/(app)/vehicles/page.tsx`
- أزرار/إجراءات: إلغاء, المصروفات, تم تسجيل المصروف, حفظ
- مسارات API: `financial-accounts`, `routes`, `vehicles/${vehicle.id}/expenses`
- حقول نماذج معرّفة: 7

### `app/(app)/warehouses/page.tsx`
- أزرار/إجراءات: تعديل, مخزن جديد
- مسارات API: `warehouses`
- حقول نماذج معرّفة: 5

### `components/InvoicePage.tsx`
- أزرار/إجراءات: إضافة بند, إلغاء المستند, تأكيد الإلغاء, تراجع, حفظ وترحيل, طباعة, فاتورة بيع, لا توجد مستندات, مرتجع
- مسارات API: `representatives/${representativeId}`, `warehouses`
- حقول نماذج معرّفة: 0

### `components/PartyPage.tsx`
- أزرار/إجراءات: —
- مسارات API: `geo-areas`, `representatives`, `routes`
- حقول نماذج معرّفة: 11

### `components/ResourcePage.tsx`
- أزرار/إجراءات: إضافة جديد, إلغاء, حفظ
- مسارات API: —
- حقول نماذج معرّفة: 0

---

## Additions merged from `main` (earlier audit pass)

| Page | Actions | Endpoint | Status |
|---|---|---|---|
| Commission rules | list, create, deactivate | `representatives/commission-rules` | Added |
| Reports > Inventory | valuation (with GL comparison), low stock, slow-moving | `reports/inventory/*` | Added |

Also fixed there: the Reports > Export **Language** selector had an empty `onChange`; it now sets the export language (PDF is forced to English because the PDF library cannot shape Arabic).
