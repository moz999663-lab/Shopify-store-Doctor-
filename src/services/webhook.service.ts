import { Request, Response } from 'express';
import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class WebhookService {
  // ============================================
  // التحقق من التوقيع
  // ============================================
  
  static verifyWebhookSignature(req: Request, shopifyApiSecret: string): boolean {
    try {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
      const body = req.rawBody || '';

      if (!hmacHeader) {
        logger.warn('⚠️ لا يوجد توقيع HMAC في الرأس');
        return false;
      }

      const hash = crypto
        .createHmac('sha256', shopifyApiSecret)
        .update(body, 'utf8')
        .digest('base64');

      const isValid = hash === hmacHeader;
      
      if (!isValid) {
        logger.warn('⚠️ فشل التحقق من توقيع webhook');
      }

      return isValid;
    } catch (error) {
      logger.error('❌ خطأ في التحقق من التوقيع:', error);
      return false;
    }
  }

  // ============================================
  // معالجة Webhook: Order Created
  // ============================================
  
  static async handleOrderCreated(shopId: string, order: any): Promise<void> {
    try {
      logger.info(`📦 معالجة webhook: طلب جديد ${order.order_number}`);

      const orderId = uuidv4();
      const shopifyOrderId = order.id.toString();

      // إدراج الطلب
      await database
        .insertInto('orders')
        .values({
          id: orderId,
          shop_id: shopId,
          shopify_order_id: shopifyOrderId,
          order_number: `#${order.order_number}`,
          customer_id: order.customer?.id?.toString() || null,
          email: order.email,
          total_price: order.total_price,
          subtotal_price: order.subtotal_price,
          total_tax: order.total_tax,
          total_discounts: order.total_discounts,
          total_shipping: order.total_shipping,
          currency: order.currency,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          created_at_shopify: new Date(order.created_at),
          synced_at: new Date()
        })
        .onConflict(oc =>
          oc.column('shopify_order_id').doUpdateSet({
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            synced_at: new Date()
          })
        )
        .execute();

      // معالجة عناصر الطلب
      for (const lineItem of order.line_items) {
        const shopifyVariantId = lineItem.variant_id?.toString() || null;
        let variantId = null;

        if (shopifyVariantId) {
          const variant = await database
            .selectFrom('product_variants')
            .select('id')
            .where('shop_id', '=', shopId)
            .where('shopify_variant_id', '=', shopifyVariantId)
            .executeTakeFirst();
          variantId = variant?.id || null;
        }

        await database
          .insertInto('order_line_items')
          .values({
            id: uuidv4(),
            shop_id: shopId,
            order_id: orderId,
            shopify_line_item_id: lineItem.id.toString(),
            product_id: null, // سيتم ربطه من variant_id
            variant_id: variantId,
            title: lineItem.title,
            quantity: lineItem.quantity,
            price: lineItem.price,
            total_discount: lineItem.total_discount || '0',
            requires_shipping: lineItem.requires_shipping
          })
          .execute();
      }

      logger.info(`✅ تم معالجة الطلب ${order.order_number} بنجاح`);
    } catch (error) {
      logger.error('❌ خطأ في معالجة طلب جديد:', error);
      throw error;
    }
  }

  // ============================================
  // معالجة Webhook: Order Updated
  // ============================================
  
  static async handleOrderUpdated(shopId: string, order: any): Promise<void> {
    try {
      logger.info(`📦 معالجة webhook: تحديث طلب ${order.order_number}`);

      const shopifyOrderId = order.id.toString();

      // تحديث الطلب
      await database
        .updateTable('orders')
        .set({
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          total_price: order.total_price,
          total_discounts: order.total_discounts,
          total_refunds: order.total_refunds?.toString() || '0',
          synced_at: new Date()
        })
        .where('shop_id', '=', shopId)
        .where('shopify_order_id', '=', shopifyOrderId)
        .execute();

      logger.info(`✅ تم تحديث الطلب ${order.order_number} بنجاح`);
    } catch (error) {
      logger.error('❌ خطأ في تحديث الطلب:', error);
      throw error;
    }
  }

  // ============================================
  // معالجة Webhook: Refund Created
  // ============================================
  
  static async handleRefundCreated(shopId: string, refund: any, orderId: string): Promise<void> {
    try {
      logger.info(`💸 معالجة webhook: استرجاع جديد`);

      // العثور على الطلب
      const order = await database
        .selectFrom('orders')
        .select('id')
        .where('shop_id', '=', shopId)
        .where('shopify_order_id', '=', orderId)
        .executeTakeFirst();

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // إدراج الاسترجاع
      const refundAmount = refund.transactions?.reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0) || 0;

      await database
        .insertInto('refunds')
        .values({
          id: uuidv4(),
          shop_id: shopId,
          order_id: order.id,
          shopify_refund_id: refund.id.toString(),
          amount: refundAmount.toString(),
          reason: refund.reason,
          note: refund.note || null,
          created_at_shopify: new Date(refund.created_at)
        })
        .onConflict(oc =>
          oc.column('shopify_refund_id').doUpdateSet({
            amount: refundAmount.toString()
          })
        )
        .execute();

      logger.info(`✅ تم معالجة الاسترجاع بنجاح`);
    } catch (error) {
      logger.error('❌ خطأ في معالجة الاسترجاع:', error);
      throw error;
    }
  }

  // ============================================
  // معالجة Webhook: Product Updated
  // ============================================
  
  static async handleProductUpdated(shopId: string, product: any): Promise<void> {
    try {
      logger.info(`📦 معالجة webhook: تحديث منتج ${product.title}`);

      const shopifyProductId = product.id.toString();
      const productId = uuidv4();

      // إدراج أو تحديث المنتج
      await database
        .insertInto('products')
        .values({
          id: productId,
          shop_id: shopId,
          shopify_product_id: shopifyProductId,
          title: product.title,
          handle: product.handle,
          description: product.body_html,
          vendor: product.vendor,
          product_type: product.product_type,
          tags: product.tags ? JSON.stringify(product.tags.split(',')) : null,
          status: product.status,
          synced_at: new Date()
        })
        .onConflict(oc =>
          oc.column('shopify_product_id').doUpdateSet({
            title: product.title,
            description: product.body_html,
            vendor: product.vendor,
            status: product.status,
            synced_at: new Date()
          })
        )
        .execute();

      // معالجة المتغيرات
      for (const variant of product.variants) {
        const shopifyVariantId = variant.id.toString();
        const productRec = await database
          .selectFrom('products')
          .select('id')
          .where('shop_id', '=', shopId)
          .where('shopify_product_id', '=', shopifyProductId)
          .executeTakeFirst();

        if (productRec) {
          await database
            .insertInto('product_variants')
            .values({
              id: uuidv4(),
              shop_id: shopId,
              product_id: productRec.id,
              shopify_variant_id: shopifyVariantId,
              sku: variant.sku,
              barcode: variant.barcode,
              title: variant.title,
              price: variant.price,
              compare_at_price: variant.compare_at_price,
              weight: variant.weight,
              weight_unit: variant.weight_unit,
              requires_shipping: variant.requires_shipping,
              taxable: variant.taxable
            })
            .onConflict(oc =>
              oc.column('shopify_variant_id').doUpdateSet({
                title: variant.title,
                price: variant.price,
                sku: variant.sku
              })
            )
            .execute();
        }
      }

      logger.info(`✅ تم تحديث المنتج بنجاح`);
    } catch (error) {
      logger.error('❌ خطأ في معالجة تحديث المنتج:', error);
      throw error;
    }
  }
}
