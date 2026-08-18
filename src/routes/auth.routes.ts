import { Router } from 'express';

const router = Router();

// مسار OAuth
router.get('/shopify', (req, res) => {
  // سيتم تنفيذ OAuth Shopify هنا في المرحلة القادمة
  res.json({
    message: 'OAuth Shopify - سيتم تنفيذها في المرحلة 2'
  });
});

router.get('/shopify/callback', (req, res) => {
  // معالج رد الاتصال
  res.json({
    message: 'OAuth Callback - سيتم تنفيذها في المرحلة 2'
  });
});

export { router as authRoutes };
