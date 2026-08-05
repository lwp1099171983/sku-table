import type { UserRole } from '@sku-table/shared'
import { bigint, boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').$type<UserRole>().notNull().default('operator'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('app_users_email_unique').on(table.email),
  index('app_users_active_email_idx').on(table.isActive, table.email),
])

export type AppUserRow = typeof appUsers.$inferSelect

export const employeeWorkBatches = pgTable('employee_work_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeName: text('employee_name').notNull(),
  employeeId: uuid('employee_id').references(() => appUsers.id, { onDelete: 'set null' }),
  workDate: date('work_date').notNull(),
  fileName: text('file_name').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  totalRows: integer('total_rows').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('employee_work_batches_employee_date_idx').on(table.employeeName, table.workDate),
  index('employee_work_batches_work_date_idx').on(table.workDate),
  index('employee_work_batches_uploaded_by_idx').on(table.uploadedBy),
])

export type EmployeeWorkBatchRow = typeof employeeWorkBatches.$inferSelect

export const employeeWorkItems = pgTable('employee_work_items', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  batchId: uuid('batch_id').notNull().references(() => employeeWorkBatches.id, { onDelete: 'cascade' }),
  seq: text('seq'),
  sku: text('sku'),
  platform: text('platform'),
  name: text('name').notNull(),
  url: text('url'),
  spec: text('spec'),
  price: numeric('price', { precision: 14, scale: 2 }),
}, (table) => [
  index('employee_work_items_batch_id_idx').on(table.batchId),
  index('employee_work_items_sku_idx').on(table.sku),
])

export type EmployeeWorkItemRow = typeof employeeWorkItems.$inferSelect

export const ozonStatisticsBatches = pgTable('ozon_statistics_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: text('file_name').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  totalRows: integer('total_rows').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('ozon_statistics_batches_uploaded_by_idx').on(table.uploadedBy),
  index('ozon_statistics_batches_created_at_idx').on(table.createdAt),
])

export type OzonStatisticsBatchRow = typeof ozonStatisticsBatches.$inferSelect

export const ozonProductPricing = pgTable('ozon_product_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').references(() => ozonStatisticsBatches.id, { onDelete: 'restrict' }),
  store: text('store'),
  productName: text('product_name').notNull(),
  supplierSku: text('supplier_sku'),
  purchasePrice: numeric('purchase_price', { precision: 14, scale: 2 }),
  weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
  localSku: text('local_sku'),
  nameAbbreviation: text('name_abbreviation'),
  skuPrefix: text('sku_prefix'),
  sellingPrice: numeric('selling_price', { precision: 14, scale: 2 }),
  actualMarginRate: numeric('actual_margin_rate', { precision: 7, scale: 4 }),
  breakevenSellingPrice: numeric('breakeven_selling_price', { precision: 14, scale: 2 }),
  priceCheck: boolean('price_check').notNull().default(false),
  weightCheck: boolean('weight_check').notNull().default(false),
  breakevenProfit: numeric('breakeven_profit', { precision: 14, scale: 2 }),
  breakevenMarginRate: numeric('breakeven_margin_rate', { precision: 7, scale: 4 }),
  price1: numeric('price_1', { precision: 14, scale: 2 }),
  shippingFee: numeric('shipping_fee', { precision: 14, scale: 2 }),
  commissionRate: numeric('commission_rate', { precision: 7, scale: 4 }),
  returnRate: numeric('return_rate', { precision: 7, scale: 4 }),
  sourceUrl: text('source_url'),
  createdBy: uuid('created_by').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('ozon_product_pricing_store_idx').on(table.store),
  index('ozon_product_pricing_supplier_sku_idx').on(table.supplierSku),
  index('ozon_product_pricing_local_sku_idx').on(table.localSku),
  index('ozon_product_pricing_created_by_idx').on(table.createdBy),
])

export type OzonProductPricingRow = typeof ozonProductPricing.$inferSelect
