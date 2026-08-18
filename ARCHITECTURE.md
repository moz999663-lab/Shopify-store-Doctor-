# 🏗️ التصميم المعماري لـ دكتور الأرباح من Shopify

## نظرة عامة

هذا المستند يصف البنية المعمارية لتطبيق دكتور الأرباح.

## الطبقات المعمارية

### 1. طبقة الواجهة (Frontend)
- **React 18**: واجهة مستخدم تفاعلية
- **React Router**: توجيه العروض
- **Axios**: طلبات HTTP

### 2. طبقة API (API Layer)
- **Express.js**: تطبيق ويب
- **Middleware**:
  - CORS: السماح بالطلبات من الواجهة الأمامية
  - Error Handler: معالجة الأخطاء المركزية
  - Request Logger: تسجيل الطلبات
  - Authentication: التحقق من الهوية

### 3. طبقة الخدمات (Services Layer)
سيتم تنفيذها في المرحلة 2+:
- Shopify Integration Service
- Sync Service
- Profit Calculation Service
- Diagnostic Service
- AI Service

### 4. طبقة البيانات (Data Layer)
- **Kysely ORM**: الوصول إلى البيانات بأمان
- **PostgreSQL**: قاعدة البيانات
- **Redis**: التخزين المؤقت والقوائم

## العزل متعدد المستأجرين

كل متجر Shopify هو "مستأجر" منفصل:

1. **مستوى قاعدة البيانات**:
   - جميع الجداول تحتوي على `shop_id`
   - جميع الاستعلامات تصفي حسب `shop_id`
   - لا توجد استعلامات بدون شرط `WHERE shop_id = ...`

2. **مستوى التطبيق**:
   - توثيق الهوية والتحقق المركزي
   - الحصول على `shop_id` من الجلسة
   - تمرير `shop_id` إلى جميع الخدمات

3. **مستوى API**:
   - لا تقبل مسارات API المعاملات `shop_id` من العميل
   - استخراج `shop_id` من الجلسة المصرح بها

## تدفق البيانات

```
متجر Shopify
    ↓
Shopify API (Webhooks + Polling)
    ↓
Sync Service
    ↓
PostgreSQL (normalized data)
    ↓
Profit Calculation Engine
    ↓
Diagnostic Engine
    ↓
AI Layer
    ↓
React Frontend (Dashboard)
```

## نموذج البيانات

### الكيانات الأساسية

1. **Shop**: متجر Shopify المتصل
2. **User**: مستخدم المتجر
3. **Product**: منتج من Shopify
4. **ProductVariant**: نوع المنتج
5. **Order**: الطلب
6. **OrderLineItem**: سطر من الطلب
7. **Refund**: المبلغ المسترجع
8. **Discount**: الخصم
9. **ProductCost**: تكلفة المنتج (مدخل من المستخدم أو Shopify)
10. **MetricSnapshot**: لقطة يومية من المقاييس
11. **Diagnostic**: التشخيص المكتشف
12. **Recommendation**: التوصية

## محرك الأرباح (Profit Engine)

### الحسابات الأساسية

```
إجمالي المبيعات (Gross Sales)
  = مجموع أسعار الخطوط

صافي المبيعات (Net Sales)
  = إجمالي المبيعات - الخصومات

إجمالي الربح (Gross Profit)
  = صافي المبيعات - تكاليف المنتجات

هامش الربح (Gross Margin %)
  = (إجمالي الربح / صافي المبيعات) * 100

معدل الاسترجاع (Refund Rate %)
  = (مجموع المبالغ المسترجعة / صافي المبيعات) * 100
```

## محرك التشخيص (Diagnostic Engine)

سيكتشف:
- منتجات غير مربحة
- معدلات استرجاع عالية
- خصومات مفرطة
- تغييرات مفاجئة في الأرباح
- فرص تحسين الهامش

## نظام الأولويات

```
Priority Score = 
  (Financial Impact × Confidence × Urgency × Actionability) / 100
```

النتيجة بين 0-100 لتصنيف المشاكل والفرص.

## المزامنة (Sync)

### نمط المزامنة

1. **المزامنة الأولية** (Full Sync):
   - جلب جميع البيانات من Shopify
   - قد تستغرق وقتاً طويلاً للمتاجر الكبيرة

2. **المزامنة المتزايدة** (Incremental Sync):
   - جلب البيانات الجديدة منذ آخر مزامنة
   - أسرع وأكثر كفاءة

3. **معالجة Webhook**:
   - الاستجابة الفورية لأحداث Shopify
   - تحديث البيانات في الوقت الفعلي

### آلية إعادة المحاولة (Retry)

- محاولة 3 مرات على الفشل
- تأخير الأسي بين المحاولات
- تسجيل الأخطاء للمراجعة اليدوية

## الأداء والقابلية للتوسع

### المؤشرات المحسوبة مسبقاً (Pre-computed Metrics)

- حساب لقطات يومية (Daily Snapshots) في الخلفية
- تخزين مؤقت للنتائج المحسوبة
- استعلامات سريعة بدون حسابات مكثفة

### الفهرسة (Indexing)

```sql
CREATE INDEX idx_shops_shop_id ON shops(shop_id);
CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

## الأمان

### أنواع البيانات الحساسة

1. **Shopify Access Token**: مشفر في قاعدة البيانات
2. **بيانات العملاء**: بيانات شخصية
3. **بيانات مالية**: أرباح ومبيعات وتكاليف

### التشفير

- استخدام `.env` لتخزين مفاتيح التشفير
- تشفير البيانات الحساسة قبل التخزين

### الوصول والتحكم

- JWT tokens للمصادقة
- التحقق من `shop_id` في كل طلب
- عدم السماح للمستخدم برؤية بيانات متاجر أخرى

## التوسعية المستقبلية

هذه البنية تدعم إضافة:
- تطبيقات Meta Ads و Google Ads
- تكاملات Stripe و Shopify Payments
- Google Analytics
- منصات تسويق أخرى

---

**آخر تحديث**: أغسطس 2026
