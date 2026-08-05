import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { ImportBatchStatus, ImportRowError, PermissionCode, UserRole } from '@sku-table/shared'

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('app_users_email_unique').on(table.email),
  index('app_users_active_email_idx').on(table.isActive, table.email),
])

export type AppUserRow = typeof appUsers.$inferSelect

export const studios = pgTable('studios', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('studios_name_unique').on(sql`lower(${table.name})`),
])

export type StudioRow = typeof studios.$inferSelect

export const studioMembers = pgTable('studio_members', {
  studioId: uuid('studio_id').notNull(),
  userId: uuid('user_id').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.studioId, table.userId] }),
])

export type StudioMemberRow = typeof studioMembers.$inferSelect

export const roles = pgTable('roles', {
  code: text('code').$type<UserRole>().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export type RoleRow = typeof roles.$inferSelect

export const permissions = pgTable('permissions', {
  code: text('code').$type<PermissionCode>().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
})

export type PermissionRow = typeof permissions.$inferSelect

export const rolePermissions = pgTable('role_permissions', {
  roleCode: text('role_code').$type<UserRole>().notNull(),
  permissionCode: text('permission_code').$type<PermissionCode>().notNull(),
}, (table) => [
  primaryKey({ columns: [table.roleCode, table.permissionCode] }),
])

export type RolePermissionRow = typeof rolePermissions.$inferSelect

export const studioMemberRoles = pgTable('studio_member_roles', {
  studioId: uuid('studio_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleCode: text('role_code').$type<UserRole>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.studioId, table.userId, table.roleCode] }),
])

export type StudioMemberRoleRow = typeof studioMemberRoles.$inferSelect

export const studioMemberPermissions = pgTable('studio_member_permissions', {
  studioId: uuid('studio_id').notNull(),
  userId: uuid('user_id').notNull(),
  permissionCode: text('permission_code').$type<PermissionCode>().notNull(),
  effect: text('effect').$type<'allow' | 'deny'>().notNull().default('allow'),
  grantedBy: uuid('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.studioId, table.userId, table.permissionCode] }),
])

export type StudioMemberPermissionRow = typeof studioMemberPermissions.$inferSelect

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  studioId: uuid('studio_id').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('employees_studio_name_unique').on(table.studioId, sql`lower(${table.name})`),
])

export type EmployeeRow = typeof employees.$inferSelect

export const employeeWorkBatches = pgTable('employee_work_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  studioId: uuid('studio_id').notNull(),
  employeeId: uuid('employee_id'),
  employeeName: text('employee_name').notNull(),
  workDate: date('work_date').notNull(),
  fileName: text('file_name').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  archivedBy: uuid('archived_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('employee_work_batches_studio_employee_date_idx').on(table.studioId, table.employeeName, table.workDate),
  index('employee_work_batches_studio_work_date_idx').on(table.studioId, table.workDate),
  index('employee_work_batches_studio_created_at_idx').on(table.studioId, table.createdAt),
  index('employee_work_batches_uploaded_by_idx').on(table.uploadedBy),
])

export type EmployeeWorkBatchRow = typeof employeeWorkBatches.$inferSelect

export const employeeWorkItems = pgTable('employee_work_items', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  batchId: uuid('batch_id').notNull(),
  studioId: uuid('studio_id').notNull(),
  seq: text('seq'),
  sku: text('sku'),
  platform: text('platform'),
  name: text('name').notNull(),
  url: text('url'),
  spec: text('spec'),
  price: numeric('price', { precision: 14, scale: 2 }),
}, (table) => [
  index('employee_work_items_studio_batch_id_idx').on(table.studioId, table.batchId, table.id),
  index('employee_work_items_studio_sku_idx').on(table.studioId, table.sku),
])

export type EmployeeWorkItemRow = typeof employeeWorkItems.$inferSelect

export const pricingBatches = pgTable('pricing_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  studioId: uuid('studio_id').notNull(),
  fileName: text('file_name').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  archivedBy: uuid('archived_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('pricing_batches_studio_created_at_idx').on(table.studioId, table.createdAt),
  index('pricing_batches_uploaded_by_idx').on(table.uploadedBy),
])

export type PricingBatchRow = typeof pricingBatches.$inferSelect

export const pricingItems = pgTable('pricing_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull(),
  studioId: uuid('studio_id').notNull(),
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
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('pricing_items_studio_store_idx').on(table.studioId, table.store),
  index('pricing_items_studio_batch_id_idx').on(table.studioId, table.batchId),
  index('pricing_items_studio_supplier_sku_idx').on(table.studioId, table.supplierSku),
  index('pricing_items_studio_created_at_idx').on(table.studioId, table.createdAt),
])

export type PricingItemRow = typeof pricingItems.$inferSelect

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  studioId: uuid('studio_id').notNull(),
  fileName: text('file_name').notNull(),
  status: text('status').$type<ImportBatchStatus>().notNull().default('pending'),
  totalRows: integer('total_rows').notNull().default(0),
  successRows: integer('success_rows').notNull().default(0),
  failedRows: integer('failed_rows').notNull().default(0),
  errorRows: jsonb('error_rows').$type<ImportRowError[]>().notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  archivedBy: uuid('archived_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('import_batches_studio_created_at_idx').on(table.studioId, table.createdAt),
])

export type ImportBatchRow = typeof importBatches.$inferSelect

export const products = pgTable('products', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  batchId: uuid('batch_id').notNull(),
  studioId: uuid('studio_id').notNull(),
  seq: text('seq'),
  sku: text('sku'),
  platform: text('platform'),
  name: text('name').notNull(),
  url: text('url'),
  spec: text('spec'),
  price: numeric('price', { precision: 14, scale: 2 }),
  internalNote: text('internal_note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('products_studio_created_at_idx').on(table.studioId, table.createdAt, table.id),
  index('products_studio_sku_idx').on(table.studioId, table.sku),
  index('products_studio_created_by_idx').on(table.studioId, table.createdBy),
])

export type ProductRow = typeof products.$inferSelect
