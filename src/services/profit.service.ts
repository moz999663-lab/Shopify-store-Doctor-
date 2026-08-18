import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

export class ProfitService {
  private shopId: string;

  constructor(shopId: string) {
    this.shopId = shopId;
  }

  // ============================================
  // حساب مقاييس المبيعات اليومية
  // ============================================

  async calculateDailyMetrics(date: Date): Promise<void> {
    try {
      logger.info(`📊 حساب مقاييس يومية للمتجر ${this.shopId} في ${date.toISOString()}`);

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // جلب الطلبات في اليوم
      const orders = await database
        .selectFrom('orders')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .where('created_at_shopify', '>=', startOfDay)
        .where('created_at_shopify', '<', endOfDay)
        .execute();

      if (orders.length === 0) {
        logger.info(`↩️ لا توجد طلبات في هذا اليوم: ${date.toISOString()}`);
        return;
      }

      // حساب المقاييس
      const metrics = await this.calculateMetrics(orders);

      // حفظ المقاييس
      await this.saveMetricSnapshot(date, metrics);

      logger.info(`✅ تم حساب المقاييس اليومية بنجاح`);
    } catch (error) {
      logger.error('❌ خطأ في حساب المقاييس اليومية:', error);
      throw error;
    }
  }

  // ============================================
  // حساب مقاييس النطاق الزمني
  // ============================================

  async calculatePeriodMetrics(startDate: Date, endDate: Date, periodType: 'daily' | 'weekly' | 'monthly'): Promise<any> {
    try {
      logger.info(`📊 حساب مقاييس ${periodType} من ${startDate.toISOString()} إلى ${endDate.toISOString()}`);

      // جلب الطلبات في النطاق
      const orders = await database
        .selectFrom('orders')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .where('created_at_shopify', '>=', startDate)
        .where('created_at_shopify', '<=', endDate)
        .execute();

      if (orders.length === 0) {
        logger.info(`↩️ لا توجد طلبات في هذه الفترة`);
        return null;
      }

      // حساب المقاييس
      return await this.calculateMetrics(orders);
    } catch (error) {
      logger.error('❌ خطأ في حساب مقاييس النطاق:', error);
      throw error;
    }
  }

  // ============================================
  // الحساب الأساسي للمقاييس
  // ============================================

  private async calculateMetrics(orders: any[]): Promise<any> {
    let totalRevenue = new Decimal(0);
    let grossSales = new Decimal(0);
    let netSales = new Decimal(0);
    let totalCost = new Decimal(0);
    let totalRefunds = new Decimal(0);
    let totalDiscounts = new Decimal(0);
    let totalTax = new Decimal(0);
    let totalShipping = new Decimal(0);
    let costCoverageCount = 0;
    let variantCount = 0;

    for (const order of orders) {
      // المبيعات
      const orderGrossSales = new Decimal(order.total_price || 0);
      const orderDiscounts = new Decimal(order.total_discounts || 0);
      const orderNetSales = orderGrossSales.minus(orderDiscounts);

      grossSales = grossSales.plus(orderGrossSales);
      netSales = netSales.plus(orderNetSales);
      totalDiscounts = totalDiscounts.plus(orderDiscounts);
      totalTax = totalTax.plus(new Decimal(order.total_tax || 0));
      totalShipping = totalShipping.plus(new Decimal(order.total_shipping || 0));

      // جلب عناصر الطلب
      const lineItems = await database
        .selectFrom('order_line_items')
        .selectAll()
        .where('order_id', '=', order.id)
        .execute();

      for (const item of lineItems) {
        variantCount++;
        const quantity = item.quantity || 1;

        // حساب التكلفة
        if (item.variant_id) {
          const cost = await this.getProductCost(item.variant_id);
          if (cost) {
            totalCost = totalCost.plus(cost.multipliedBy(quantity));
            costCoverageCount++;
          }
        }
      }

      // الاسترجاعات
      const refunds = await database
        .selectFrom('refunds')
        .selectAll()
        .where('order_id', '=', order.id)
        .execute();

      for (const refund of refunds) {
        totalRefunds = totalRefunds.plus(new Decimal(refund.amount || 0));
      }
    }

    // الإيرادات الإجمالية
    totalRevenue = netSales.minus(totalRefunds);

    // حساب الربح الإجمالي
    const grossProfit = totalRevenue.minus(totalCost);

    // النسب المئوية
    const grossMarginPercent = netSales.gt(0)
      ? grossProfit.dividedBy(netSales).multipliedBy(100).toNumber()
      : 0;

    const refundRatePercent = netSales.gt(0)
      ? totalRefunds.dividedBy(netSales).multipliedBy(100).toNumber()
      : 0;

    const discountRatePercent = grossSales.gt(0)
      ? totalDiscounts.dividedBy(grossSales).multipliedBy(100).toNumber()
      : 0;

    const costCoveragePercent = variantCount > 0
      ? (costCoverageCount / variantCount) * 100
      : 0;

    const averageOrderValue = orders.length > 0
      ? netSales.dividedBy(orders.length).toNumber()
      : 0;

    return {
      // المبيعات
      total_revenue: totalRevenue.toString(),
      gross_sales: grossSales.toString(),
      net_sales: netSales.toString(),
      total_orders: orders.length,
      average_order_value: averageOrderValue.toString(),

      // التكاليف والأرباح
      total_cost: totalCost.toString(),
      gross_profit: grossProfit.toString(),
      gross_margin_percent: grossMarginPercent,

      // المشاكل
      total_refunds: totalRefunds.toString(),
      total_discounts: totalDiscounts.toString(),
      refund_rate_percent: refundRatePercent,
      discount_rate_percent: discountRatePercent,

      // جودة البيانات
      cost_coverage_percent: costCoveragePercent,

      // تفاصيل إضافية
      total_tax: totalTax.toString(),
      total_shipping: totalShipping.toString()
    };
  }

  // ============================================
  // حساب ربحية المنتجات
  // ============================================

  async calculateProductProfitability(): Promise<any[]> {
    try {
      logger.info(`📊 حساب ربحية المنتجات للمتجر ${this.shopId}`);

      // جلب المتغيرات مع بيانات المبيعات والتكاليف
      const variants = await database
        .selectFrom('product_variants')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .execute();

      const profitability = [];

      for (const variant of variants) {
        // جلب عناصر الطلب لهذا المتغير
        const sales = await database
          .selectFrom('order_line_items')
          .selectAll()
          .where('variant_id', '=', variant.id)
          .execute();

        if (sales.length === 0) continue;

        // حساب المقاييس
        const totalQuantity = sales.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalRevenue = sales.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
        const averagePrice = totalRevenue / sales.length;

        // جلب التكلفة
        const costData = await this.getProductCost(variant.id);
        const unitCost = costData ? costData.toNumber() : 0;

        // حساب الربح
        const totalCost = new Decimal(unitCost).multipliedBy(totalQuantity);
        const grossProfit = new Decimal(totalRevenue).minus(totalCost);
        const marginPercent = new Decimal(totalRevenue).gt(0)
          ? grossProfit.dividedBy(totalRevenue).multipliedBy(100).toNumber()
          : 0;

        profitability.push({
          variant_id: variant.id,
          product_id: variant.product_id,
          sku: variant.sku,
          title: variant.title,
          total_quantity: totalQuantity,
          total_revenue: totalRevenue.toString(),
          average_price: averagePrice.toString(),
          unit_cost: unitCost.toString(),
          total_cost: totalCost.toString(),
          gross_profit: grossProfit.toString(),
          margin_percent: marginPercent,
          is_profitable: grossProfit.gt(0)
        });
      }

      logger.info(`✅ تم حساب ربحية ${profitability.length} منتج`);
      return profitability.sort((a, b) => (b.margin_percent || 0) - (a.margin_percent || 0));
    } catch (error) {
      logger.error('❌ خطأ في حساب ربحية المنتجات:', error);
      throw error;
    }
  }

  // ============================================
  // تحليل تأثير الخصومات
  // ============================================

  async analyzeDiscountImpact(): Promise<any> {
    try {
      logger.info(`💰 تحليل تأثير الخصومات للمتجر ${this.shopId}`);

      // جلب جميع الخصومات
      const orders = await database
        .selectFrom('orders')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .execute();

      let totalRevenue = new Decimal(0);
      let totalDiscounts = new Decimal(0);
      let discountedOrders = 0;
      let ordersWithoutDiscount = 0;
      let discountPercentages: number[] = [];

      for (const order of orders) {
        const orderTotal = new Decimal(order.total_price || 0);
        const orderDiscount = new Decimal(order.total_discounts || 0);

        totalRevenue = totalRevenue.plus(orderTotal);
        totalDiscounts = totalDiscounts.plus(orderDiscount);

        if (orderDiscount.gt(0)) {
          discountedOrders++;
          const discountPercent = orderDiscount.dividedBy(orderTotal).multipliedBy(100).toNumber();
          discountPercentages.push(discountPercent);
        } else {
          ordersWithoutDiscount++;
        }
      }

      // حساب الإحصائيات
      const avgDiscountPercent = discountPercentages.length > 0
        ? discountPercentages.reduce((a, b) => a + b, 0) / discountPercentages.length
        : 0;

      const maxDiscountPercent = discountPercentages.length > 0
        ? Math.max(...discountPercentages)
        : 0;

      const minDiscountPercent = discountPercentages.length > 0
        ? Math.min(...discountPercentages)
        : 0;

      const discountRatePercent = orders.length > 0
        ? (discountedOrders / orders.length) * 100
        : 0;

      // الإيرادات المفقودة المحتملة
      const potentialLostRevenue = totalDiscounts;

      logger.info(`✅ تم تحليل تأثير الخصومات`);

      return {
        total_discount_amount: totalDiscounts.toString(),
        discount_rate_percent: discountRatePercent,
        discounted_orders: discountedOrders,
        orders_without_discount: ordersWithoutDiscount,
        total_orders: orders.length,
        average_discount_percent: avgDiscountPercent,
        max_discount_percent: maxDiscountPercent,
        min_discount_percent: minDiscountPercent,
        potential_lost_revenue: potentialLostRevenue.toString(),
        revenue_impact_percent: totalRevenue.gt(0)
          ? totalDiscounts.dividedBy(totalRevenue).multipliedBy(100).toNumber()
          : 0
      };
    } catch (error) {
      logger.error('❌ خطأ في تحليل الخصومات:', error);
      throw error;
    }
  }

  // ============================================
  // تحليل تأثير الاسترجاعات
  // ============================================

  async analyzeRefundImpact(): Promise<any> {
    try {
      logger.info(`💔 تحليل تأثير الاسترجاعات للمتجر ${this.shopId}`);

      // جلب جميع الاسترجاعات
      const refunds = await database
        .selectFrom('refunds')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .execute();

      if (refunds.length === 0) {
        logger.info('↩️ لا توجد استرجاعات');
        return {
          total_refund_amount: '0',
          refund_count: 0,
          refund_rate_percent: 0
        };
      }

      // حساب الاسترجاعات
      let totalRefunds = new Decimal(0);
      let refundsByReason: { [key: string]: number } = {};

      for (const refund of refunds) {
        totalRefunds = totalRefunds.plus(new Decimal(refund.amount || 0));

        const reason = refund.reason || 'unknown';
        refundsByReason[reason] = (refundsByReason[reason] || 0) + 1;
      }

      // جلب إجمالي الإيرادات
      const orders = await database
        .selectFrom('orders')
        .selectAll()
        .where('shop_id', '=', this.shopId)
        .execute();

      let totalRevenue = new Decimal(0);
      for (const order of orders) {
        totalRevenue = totalRevenue.plus(new Decimal(order.total_price || 0));
      }

      const refundRatePercent = totalRevenue.gt(0)
        ? totalRefunds.dividedBy(totalRevenue).multipliedBy(100).toNumber()
        : 0;

      logger.info(`✅ تم تحليل تأثير الاسترجاعات`);

      return {
        total_refund_amount: totalRefunds.toString(),
        refund_count: refunds.length,
        refund_rate_percent: refundRatePercent,
        refunds_by_reason: refundsByReason,
        total_revenue: totalRevenue.toString()
      };
    } catch (error) {
      logger.error('❌ خطأ في تحليل الاسترجاعات:', error);
      throw error;
    }
  }

  // ============================================
  // المساعدات
  // ============================================

  private async getProductCost(variantId: string): Promise<Decimal | null> {
    try {
      const cost = await database
        .selectFrom('product_costs')
        .select('cost_per_unit')
        .where('variant_id', '=', variantId)
        .orderBy('updated_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      return cost ? new Decimal(cost.cost_per_unit || 0) : null;
    } catch (error) {
      logger.warn(`تحذير: لا يمكن جلب تكلفة المتغير ${variantId}`);
      return null;
    }
  }

  private async saveMetricSnapshot(date: Date, metrics: any): Promise<void> {
    try {
      await database
        .insertInto('metric_snapshots')
        .values({
          id: uuidv4(),
          shop_id: this.shopId,
          date: date,
          period_type: 'daily',
          total_revenue: metrics.total_revenue,
          gross_sales: metrics.gross_sales,
          net_sales: metrics.net_sales,
          total_orders: metrics.total_orders,
          average_order_value: metrics.average_order_value,
          total_cost: metrics.total_cost,
          gross_profit: metrics.gross_profit,
          gross_margin_percent: metrics.gross_margin_percent,
          total_refunds: metrics.total_refunds,
          total_discounts: metrics.total_discounts,
          refund_rate_percent: metrics.refund_rate_percent,
          discount_rate_percent: metrics.discount_rate_percent,
          cost_coverage_percent: metrics.cost_coverage_percent
        })
        .onConflict(oc =>
          oc.columns(['shop_id', 'date']).doUpdateSet({
            total_revenue: metrics.total_revenue,
            gross_sales: metrics.gross_sales,
            net_sales: metrics.net_sales,
            total_orders: metrics.total_orders,
            average_order_value: metrics.average_order_value,
            total_cost: metrics.total_cost,
            gross_profit: metrics.gross_profit,
            gross_margin_percent: metrics.gross_margin_percent,
            total_refunds: metrics.total_refunds,
            total_discounts: metrics.total_discounts,
            refund_rate_percent: metrics.refund_rate_percent,
            discount_rate_percent: metrics.discount_rate_percent,
            cost_coverage_percent: metrics.cost_coverage_percent
          })
        )
        .execute();

      logger.info(`✅ تم حفظ لقطة المقاييس`);
    } catch (error) {
      logger.error('❌ خطأ في حفظ لقطة المقاييس:', error);
      throw error;
    }
  }
}
