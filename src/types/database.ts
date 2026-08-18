import { Generated, ColumnType } from 'kysely';

export interface Database {
  // جداول متعددة المستأجرين
  shops: ShopsTable;
  users: UsersTable;
  
  // جداول بيانات Shopify
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  orders: OrdersTable;
  order_line_items: OrderLineItemsTable;
  refunds: RefundsTable;
  discounts: DiscountsTable;
  
  // جداول تكاليف المنتجات
  product_costs: ProductCostsTable;
  
  // جداول المقاييس والتشخيصات
  metric_snapshots: MetricSnapshotsTable;
  diagnostics: DiagnosticsTable;
  recommendations: RecommendationsTable;
  
  // جداول المزامنة
  sync_jobs: SyncJobsTable;
}

// ============================================
// Core Tables
// ============================================

export interface ShopsTable {
  id: Generated<string>;
  shopify_store_id: string; // من Shopify
  shop_name: string;
  shop_url: string;
  access_token: string; // مشفر
  scopes: string; // JSON array
  installed_at: ColumnType<Date, string, never>;
  is_active: boolean;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

export interface UsersTable {
  id: Generated<string>;
  shop_id: string; // Foreign key
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'analyst';
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

// ============================================
// Shopify Data Tables
// ============================================

export interface ProductsTable {
  id: Generated<string>;
  shop_id: string;
  shopify_product_id: string;
  title: string;
  handle: string;
  description: string | null;
  vendor: string | null;
  product_type: string | null;
  tags: string | null; // JSON
  status: 'active' | 'archived' | 'draft';
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
  synced_at: ColumnType<Date, string | undefined, never>;
}

export interface ProductVariantsTable {
  id: Generated<string>;
  shop_id: string;
  product_id: string; // Foreign key
  shopify_variant_id: string;
  sku: string | null;
  barcode: string | null;
  title: string;
  price: string; // Decimal as string
  compare_at_price: string | null;
  weight: number | null;
  weight_unit: string | null;
  requires_shipping: boolean;
  taxable: boolean;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

export interface OrdersTable {
  id: Generated<string>;
  shop_id: string;
  shopify_order_id: string;
  order_number: string;
  customer_id: string | null;
  email: string | null;
  total_price: string; // Decimal
  subtotal_price: string; // Decimal
  total_tax: string; // Decimal
  total_discounts: string; // Decimal
  total_shipping: string; // Decimal
  currency: string; // ISO 4217
  financial_status: string;
  fulfillment_status: string | null;
  created_at_shopify: ColumnType<Date, string, never>;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
  synced_at: ColumnType<Date, string | undefined, never>;
}

export interface OrderLineItemsTable {
  id: Generated<string>;
  shop_id: string;
  order_id: string; // Foreign key
  shopify_line_item_id: string;
  product_id: string | null;
  variant_id: string | null;
  title: string;
  quantity: number;
  price: string; // Decimal
  total_discount: string; // Decimal
  requires_shipping: boolean;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

export interface RefundsTable {
  id: Generated<string>;
  shop_id: string;
  order_id: string; // Foreign key
  shopify_refund_id: string;
  amount: string; // Decimal
  reason: string | null;
  note: string | null;
  created_at_shopify: ColumnType<Date, string, never>;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

export interface DiscountsTable {
  id: Generated<string>;
  shop_id: string;
  order_id: string; // Foreign key
  line_item_id: string | null;
  code: string | null;
  amount: string; // Decimal
  type: 'order' | 'line_item' | 'shipping';
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

// ============================================
// Cost Management
// ============================================

export interface ProductCostsTable {
  id: Generated<string>;
  shop_id: string;
  variant_id: string; // Foreign key
  cost_per_unit: string; // Decimal
  currency: string; // ISO 4217
  source: 'shopify' | 'manual' | 'import' | 'integration';
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

// ============================================
// Metrics & Analytics
// ============================================

export interface MetricSnapshotsTable {
  id: Generated<string>;
  shop_id: string;
  date: ColumnType<Date, string, never>; // Daily snapshot
  period_type: 'daily' | 'weekly' | 'monthly';
  
  // Revenue metrics
  total_revenue: string; // Decimal
  gross_sales: string; // Before discounts
  net_sales: string; // After discounts
  total_orders: number;
  average_order_value: string; // Decimal
  
  // Cost & Profit
  total_cost: string | null; // Decimal (null if cost data incomplete)
  gross_profit: string | null; // Decimal
  gross_margin_percent: number | null; // Percentage
  
  // Issues
  total_refunds: string; // Decimal
  total_discounts: string; // Decimal
  refund_rate_percent: number; // Percentage
  discount_rate_percent: number; // Percentage
  
  // Data quality
  cost_coverage_percent: number; // % of variants with cost data
  
  created_at: ColumnType<Date, string, never>;
}

export interface DiagnosticsTable {
  id: Generated<string>;
  shop_id: string;
  type: 'product' | 'store' | 'category';
  entity_id: string; // product_id, shop_id, or category
  entity_name: string;
  
  finding_type: 'critical' | 'warning' | 'opportunity' | 'info';
  title: string;
  description: string;
  
  // Diagnostic details
  observed_metric: string; // What was observed
  observed_value: string; // The value
  expected_value: string | null; // What was expected
  comparison_period: string; // e.g., "previous_7_days"
  
  // Financial impact
  financial_impact_value: string | null; // Decimal
  financial_impact_currency: string;
  financial_impact_type: 'loss' | 'opportunity';
  
  // Confidence
  confidence_score: number; // 0-100
  confidence_label: 'high' | 'medium' | 'low';
  
  // Priority
  priority_score: number; // 0-100, used for sorting
  
  // Evidence
  evidence: string; // JSON object with supporting data
  
  // Status
  status: 'active' | 'resolved' | 'dismissed';
  
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
  resolved_at: ColumnType<Date | null, string | null, never>;
}

export interface RecommendationsTable {
  id: Generated<string>;
  shop_id: string;
  diagnostic_id: string; // Foreign key
  
  title: string;
  description: string;
  action_steps: string; // JSON array
  
  // Expected impact
  expected_impact: string | null; // Decimal
  expected_impact_currency: string;
  expected_impact_type: 'increase' | 'decrease' | 'stabilize';
  
  // Assumptions
  assumptions: string; // JSON array
  
  // Status
  status: 'pending' | 'implemented' | 'dismissed';
  
  created_at: ColumnType<Date, string, never>;
  updated_at: ColumnType<Date, string | undefined, never>;
}

// ============================================
// Sync Management
// ============================================

export interface SyncJobsTable {
  id: Generated<string>;
  shop_id: string;
  
  job_type: 'full_sync' | 'incremental_sync' | 'cost_import' | 'webhook_process';
  status: 'pending' | 'running' | 'completed' | 'failed';
  
  // Results
  items_processed: number | null;
  items_created: number | null;
  items_updated: number | null;
  error_message: string | null;
  
  started_at: ColumnType<Date | null, string | null, never>;
  completed_at: ColumnType<Date | null, string | null, never>;
  created_at: ColumnType<Date, string, never>;
}
