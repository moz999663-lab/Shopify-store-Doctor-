import { shopifyApp } from '@shopify/shopify-app-express';
import axios, { AxiosInstance } from 'axios';
import { logger } from '../infrastructure/logger';

export class ShopifyService {
  private client: AxiosInstance;
  private shopifyDomain: string;
  private accessToken: string;

  constructor(shopifyDomain: string, accessToken: string) {
    this.shopifyDomain = shopifyDomain;
    this.accessToken = accessToken;
    
    this.client = axios.create({
      baseURL: `https://${shopifyDomain}/admin/api/2024-01`,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
  }

  // ============================================
  // المنتجات
  // ============================================
  
  async getProducts(limit: number = 250, after?: string) {
    try {
      logger.info(`📦 جلب المنتجات من Shopify (limit: ${limit})`);
      
      const query = `
        query GetProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                id
                title
                handle
                description
                vendor
                productType
                tags
                status
                createdAt
                updatedAt
                variants(first: 100) {
                  edges {
                    node {
                      id
                      sku
                      barcode
                      title
                      price
                      compareAtPrice
                      weight
                      weightUnit
                      requiresShipping
                      taxable
                      createdAt
                      updatedAt
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await this.client.post('/graphql.json', {
        query,
        variables: {
          first: limit,
          after: after || null
        }
      });

      if (response.data.errors) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.products;
    } catch (error) {
      logger.error('❌ خطأ في جلب المنتجات:', error);
      throw error;
    }
  }

  // ============================================
  // الطلبات
  // ============================================
  
  async getOrders(limit: number = 250, after?: string, startDate?: Date) {
    try {
      logger.info(`📋 جلب الطلبات من Shopify (limit: ${limit})`);
      
      const dateFilter = startDate ? `createdAt > "${startDate.toISOString()}"` : '';
      
      const query = `
        query GetOrders($first: Int!, $after: String, $query: String) {
          orders(first: $first, after: $after, query: $query) {
            edges {
              node {
                id
                name
                orderNumber
                email
                phone
                customer {
                  id
                }
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                  }
                }
                totalDiscountsSet {
                  shopMoney {
                    amount
                  }
                }
                totalShippingPriceSet {
                  shopMoney {
                    amount
                  }
                }
                financialStatus
                fulfillmentStatus
                createdAt
                updatedAt
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variant {
                        id
                        sku
                      }
                      discountedTotalSet {
                        shopMoney {
                          amount
                        }
                      }
                      requiresShipping
                    }
                  }
                }
                refunds(first: 10) {
                  edges {
                    node {
                      id
                      totalRefundedSet {
                        shopMoney {
                          amount
                        }
                      }
                      reason
                      note
                      createdAt
                    }
                  }
                }
                discountCodes
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await this.client.post('/graphql.json', {
        query,
        variables: {
          first: limit,
          after: after || null,
          query: dateFilter
        }
      });

      if (response.data.errors) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.orders;
    } catch (error) {
      logger.error('❌ خطأ في جلب الطلبات:', error);
      throw error;
    }
  }

  // ============================================
  // الخصومات
  // ============================================
  
  async getDiscounts(limit: number = 250) {
    try {
      logger.info(`💰 جلب الخصومات من Shopify`);
      
      const query = `
        query GetDiscounts($first: Int!) {
          discountNodes(first: $first) {
            edges {
              node {
                id
                discount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.client.post('/graphql.json', {
        query,
        variables: {
          first: limit
        }
      });

      if (response.data.errors) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.discountNodes;
    } catch (error) {
      logger.error('❌ خطأ في جلب الخصومات:', error);
      throw error;
    }
  }

  // ============================================
  // بيانات المتجر
  // ============================================
  
  async getShopInfo() {
    try {
      logger.info('🏪 جلب معلومات المتجر');
      
      const query = `
        query GetShopInfo {
          shop {
            id
            name
            url
            email
            primaryDomain {
              url
            }
            currencyCode
            timezone
            plan {
              displayName
            }
          }
        }
      `;

      const response = await this.client.post('/graphql.json', { query });

      if (response.data.errors) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data.shop;
    } catch (error) {
      logger.error('❌ خطأ في جلب معلومات المتجر:', error);
      throw error;
    }
  }
}
