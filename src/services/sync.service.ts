import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { ShopifyService } from './shopify.service';
import { v4 as uuidv4 } from 'uuid';

export class SyncService {
  private shopifyService: ShopifyService;
  private shopId: string;
  private batchSize: number = 250;

  constructor(shopId: string, shopifyService: ShopifyService) {
    this.shopId = shopId;
    this.shopifyService = shopifyService;
  }

  // ============================================
  // مزامنة كاملة
  // ============================================
  
  async performFullSync(): Promise<void> {
    const syncJobId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info(`🔄 بدء المزامنة الكاملة للمتجر ${this.shopId}`);

      // إنشاء سجل المزامنة
      await this.createSyncJob(syncJobId, 'full_sync', 'running');

      // مزامنة المنتجات
      let productsCount = 0;
      let productsAfter: string | undefined = undefined;
      
      do {
        const productsData = await this.shopifyService.getProducts(this.batchSize, productsAfter);
        productsCount += productsData.edges.length;
        
        for (const edge of productsData.edges) {
          await this.syncProduct(edge.node);
        }

        productsAfter = productsData.pageInfo.hasNextPage ? productsData.pageInfo.endCursor : undefined;
      } while (productsAfter);

      logger.info(`✅ تم مزامنة ${productsCount} منتج`);

      // مزامنة الطلبات
      let ordersCount = 0;
      let ordersAfter: string | undefined = undefined;
      
      do {
        const ordersData = await this.shopifyService.getOrders(this.batchSize, ordersAfter);
        ordersCount += ordersData.edges.length;
        
        for (const edge of ordersData.edges) {
          await this.syncOrder(edge.node);
        }

        ordersAfter = ordersData.pageInfo.hasNextPage ? ordersData.pageInfo.endCursor : undefined;
      } while (ordersAfter);

      logger.info(`✅ تم مزامنة ${ordersCount} طلب`);

      // تحديث حالة المزامنة
      const duration = Date.now() - startTime;
      await this.updateSyncJob(syncJobId, 'completed', productsCount + ordersCount, duration);

      logger.info(`✅ اكتملت المزامنة الكاملة في ${duration}ms`);
    } catch (error) {
      logger.error('❌ خطأ في المزامنة الكاملة:', error);
      await this.updateSyncJob(syncJobId, 'failed', 0, 0, (error as Error).message);
      throw error;
    }
  }

  // ============================================
  // مزامنة متزايدة
  // ============================================
  
  async performIncrementalSync(): Promise<void> {
    const syncJobId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info(`🔄 بدء المزامنة المتزايدة للمتجر ${this.shopId}`);

      // الحصول على آخر مزامنة
      const lastSync = await this.getLastSyncTime();
      const startDate = lastSync ? new Date(lastSync) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      await this.createSyncJob(syncJobId, 'incremental_sync', 'running');

      // مزامنة الطلبات الجديدة
      let ordersCount = 0;
      let ordersAfter: string | undefined = undefined;
      
      do {
        const ordersData = await this.shopifyService.getOrders(this.batchSize, ordersAfter, startDate);
        ordersCount += ordersData.edges.length;
        
        for (const edge of ordersData.edges) {
          await this.syncOrder(edge.node);
        }

        ordersAfter = ordersData.pageInfo.hasNextPage ? ordersData.pageInfo.endCursor : undefined;
      } while (ordersAfter);

      logger.info(`✅ تم مزامنة ${ordersCount} طلب جديد`);

      const duration = Date.now() - startTime;
      await this.updateSyncJob(syncJobId, 'completed', ordersCount, duration);

      logger.info(`✅ اكتملت المزامنة المتزايدة في ${duration}ms`);
    } catch (error) {
      logger.error('❌ خطأ في المزامنة المتزايدة:', error);
      await this.updateSyncJob(syncJobId, 'failed', 0, 0, (error as Error).message);
      throw error;
    }
  }

  // ============================================
  // مزامنة المنتجات
  // ============================================
  
  private async syncProduct(product: any): Promise<void> {
    try {
      const shopifyProductId = product.id.split('/').pop();
      
      // إدراج أو تحديث المنتج
      await database
        .insertInto('products')
        .values({
          id: uuidv4(),
          shop_id: this.shopId,
          shopify_product_id: shopifyProductId,
          title: product.title,
          handle: product.handle,
          description: product.description,
          vendor: product.vendor,
          product_type: product.productType,
          tags: product.tags ? JSON.stringify(product.tags) : null,
          status: product.status as any,
          synced_at: new Date()
        })
        .onConflict(oc => 
          oc.column('shopify_product_id').doUpdateSet({
            title: product.title,
            handle: product.handle,
            description: product.description,
            vendor: product.vendor,
            product_type: product.productType,
            tags: product.tags ? JSON.stringify(product.tags) : null,
            status: product.status,
            synced_at: new Date()
          })
        )
        .execute();

      // مزامنة المتغيرات
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const shopifyVariantId = variant.id.split('/').pop();
        const productId = await database
          .selectFrom('products')
          .select('id')
          .where('shop_id', '=', this.shopId)
          .where('shopify_product_id', '=', shopifyProductId)
          .executeTakeFirst();

        if (productId) {
          await database
            .insertInto('product_variants')
            .values({
              id: uuidv4(),
              shop_id: this.shopId,
              product_id: productId.id,
              shopify_variant_id: shopifyVariantId,
              sku: variant.sku,
              barcode: variant.barcode,
              title: variant.title,
              price: variant.price,
              compare_at_price: variant.compareAtPrice,
              weight: variant.weight,
              weight_unit: variant.weightUnit,
              requires_shipping: variant.requiresShipping,
              taxable: variant.taxable
            })
            .onConflict(oc =>
              oc.column('shopify_variant_id').doUpdateSet({
                title: variant.title,
                price: variant.price,
                compare_at_price: variant.compareAtPrice,
                weight: variant.weight,
                weight_unit: variant.weightUnit,
                requires_shipping: variant.requiresShipping,
                taxable: variant.taxable
              })
            )
            .execute();
        }
      }
    } catch (error) {
      logger.error(`❌ خطأ في مزامنة المنتج ${product.id}:`, error);
    }
  }

  // ============================================
  // مزامنة الطلبات
  // ============================================
  
  private async syncOrder(order: any): Promise<void> {
    try {
      const shopifyOrderId = order.id.split('/').pop();
      const orderId = uuidv4();

      // إدراج أو تحديث الطلب
      await database
        .insertInto('orders')
        .values({
          id: orderId,
          shop_id: this.shopId,
          shopify_order_id: shopifyOrderId,
          order_number: `#${order.orderNumber}`,
          customer_id: order.customer?.id?.split('/').pop() || null,
          email: order.email,
          total_price: order.totalPriceSet.shopMoney.amount,
          subtotal_price: order.subtotalPriceSet.shopMoney.amount,
          total_tax: order.totalTaxSet.shopMoney.amount,
          total_discounts: order.totalDiscountsSet.shopMoney.amount,
          total_shipping: order.totalShippingPriceSet.shopMoney.amount,
          currency: order.totalPriceSet.shopMoney.currencyCode,
          financial_status: order.financialStatus,
          fulfillment_status: order.fulfillmentStatus,
          created_at_shopify: new Date(order.createdAt),
          synced_at: new Date()
        })
        .onConflict(oc =>
          oc.column('shopify_order_id').doUpdateSet({
            financial_status: order.financialStatus,
            fulfillment_status: order.fulfillmentStatus,
            synced_at: new Date()
          })
        )
        .execute();

      // مزامنة عناصر الطلب
      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        const shopifyLineItemId = lineItem.id.split('/').pop();

        await database
          .insertInto('order_line_items')
          .values({
            id: uuidv4(),
            shop_id: this.shopId,
            order_id: orderId,
            shopify_line_item_id: shopifyLineItemId,
            product_id: lineItem.variant?.id ? await this.getProductIdByVariantId(lineItem.variant.id.split('/').pop()) : null,
            variant_id: lineItem.variant?.id ? await this.getVariantIdByShopifyId(lineItem.variant.id.split('/').pop()) : null,
            title: lineItem.title,
            quantity: lineItem.quantity,
            price: lineItem.discountedTotalSet.shopMoney.amount,
            total_discount: '0', // سيتم حسابها من الخصومات
            requires_shipping: lineItem.requiresShipping
          })
          .onConflict(oc =>
            oc.column('shopify_line_item_id').doUpdateSet({
              title: lineItem.title,
              quantity: lineItem.quantity,
              price: lineItem.discountedTotalSet.shopMoney.amount
            })
          )
          .execute();
      }

      // مزامنة الاسترجاعات
      for (const refundEdge of order.refunds.edges) {
        const refund = refundEdge.node;
        const shopifyRefundId = refund.id.split('/').pop();

        await database
          .insertInto('refunds')
          .values({
            id: uuidv4(),
            shop_id: this.shopId,
            order_id: orderId,
            shopify_refund_id: shopifyRefundId,
            amount: refund.totalRefundedSet.shopMoney.amount,
            reason: refund.reason,
            note: refund.note,
            created_at_shopify: new Date(refund.createdAt)
          })
          .onConflict(oc =>
            oc.column('shopify_refund_id').doUpdateSet({
              amount: refund.totalRefundedSet.shopMoney.amount
            })
          )
          .execute();
      }
    } catch (error) {
      logger.error(`❌ خطأ في مزامنة الطلب ${order.id}:`, error);
    }
  }

  // ============================================
  // المساعدات
  // ============================================
  
  private async getProductIdByVariantId(shopifyVariantId: string): Promise<string | null> {
    const variant = await database
      .selectFrom('product_variants')
      .select('product_id')
      .where('shop_id', '=', this.shopId)
      .where('shopify_variant_id', '=', shopifyVariantId)
      .executeTakeFirst();
    return variant?.product_id || null;
  }

  private async getVariantIdByShopifyId(shopifyVariantId: string): Promise<string | null> {
    const variant = await database
      .selectFrom('product_variants')
      .select('id')
      .where('shop_id', '=', this.shopId)
      .where('shopify_variant_id', '=', shopifyVariantId)
      .executeTakeFirst();
    return variant?.id || null;
  }

  private async getLastSyncTime(): Promise<string | null> {
    const lastSync = await database
      .selectFrom('sync_jobs')
      .select('completed_at')
      .where('shop_id', '=', this.shopId)
      .where('status', '=', 'completed')
      .orderBy('completed_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return lastSync?.completed_at?.toISOString() || null;
  }

  private async createSyncJob(jobId: string, type: string, status: string): Promise<void> {
    await database
      .insertInto('sync_jobs')
      .values({
        id: jobId,
        shop_id: this.shopId,
        job_type: type as any,
        status: status as any,
        started_at: new Date()
      })
      .execute();
  }

  private async updateSyncJob(jobId: string, status: string, itemsProcessed: number, duration: number, errorMessage?: string): Promise<void> {
    await database
      .updateTable('sync_jobs')
      .set({
        status: status as any,
        items_processed: itemsProcessed,
        completed_at: new Date(),
        error_message: errorMessage || null
      })
      .where('id', '=', jobId)
      .execute();
  }
}
