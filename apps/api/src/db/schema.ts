import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { PermissionCode, UserRole } from '@sku-table/shared'

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  // 全局管理员：可看全部店铺、拥有全部权限
  isAdmin: boolean('is_admin').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('app_users_email_unique').on(table.email),
  index('app_users_active_email_idx').on(table.isActive, table.email),
])

export type AppUserRow = typeof appUsers.$inferSelect

export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('shops_name_unique').on(sql`lower(${table.name})`),
])

export type ShopRow = typeof shops.$inferSelect

export const shopMembers = pgTable('shop_members', {
  shopId: uuid('shop_id').notNull(),
  userId: uuid('user_id').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.shopId, table.userId] }),
])

export type ShopMemberRow = typeof shopMembers.$inferSelect

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

export const shopMemberRoles = pgTable('shop_member_roles', {
  shopId: uuid('shop_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleCode: text('role_code').$type<UserRole>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.shopId, table.userId, table.roleCode] }),
])

export type ShopMemberRoleRow = typeof shopMemberRoles.$inferSelect

export const shopMemberPermissions = pgTable('shop_member_permissions', {
  shopId: uuid('shop_id').notNull(),
  userId: uuid('user_id').notNull(),
  permissionCode: text('permission_code').$type<PermissionCode>().notNull(),
  effect: text('effect').$type<'allow' | 'deny'>().notNull().default('allow'),
  grantedBy: uuid('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.shopId, table.userId, table.permissionCode] }),
])

export type ShopMemberPermissionRow = typeof shopMemberPermissions.$inferSelect

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('employees_shop_name_unique').on(table.shopId, sql`lower(${table.name})`),
])

export type EmployeeRow = typeof employees.$inferSelect

export const employeeWorkBatches = pgTable('employee_work_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull(),
  employeeId: uuid('employee_id'),
  employeeName: text('employee_name').notNull(),
  workDate: date('work_date').notNull(),
  fileName: text('file_name').notNull(),
  // 导入幂等键（解析后业务数据的规范化 SHA-256），同店铺+同指纹只允许一个批次
  idempotencyKey: text('idempotency_key'),
  uploadedBy: uuid('uploaded_by').notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  archivedBy: uuid('archived_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('employee_work_batches_shop_idempotency_unique').on(table.shopId, table.idempotencyKey),
  index('employee_work_batches_shop_employee_date_idx').on(table.shopId, table.employeeName, table.workDate),
  index('employee_work_batches_shop_work_date_idx').on(table.shopId, table.workDate),
  index('employee_work_batches_shop_created_at_idx').on(table.shopId, table.createdAt),
  index('employee_work_batches_uploaded_by_idx').on(table.uploadedBy),
])

export type EmployeeWorkBatchRow = typeof employeeWorkBatches.$inferSelect

export const employeeWorkItems = pgTable('employee_work_items', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  batchId: uuid('batch_id').notNull(),
  shopId: uuid('shop_id').notNull(),
  seq: text('seq'),
  sku: text('sku'),
  platform: text('platform'),
  name: text('name').notNull(),
  url: text('url'),
  spec: text('spec'),
  price: numeric('price', { precision: 14, scale: 2 }),
}, (table) => [
  index('employee_work_items_shop_batch_id_idx').on(table.shopId, table.batchId, table.id),
  index('employee_work_items_shop_sku_idx').on(table.shopId, table.sku),
])

export type EmployeeWorkItemRow = typeof employeeWorkItems.$inferSelect

export const ledgerBatches = pgTable('ledger_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull(),
  fileName: text('file_name').notNull(),
  // 导入幂等键（解析后业务数据的规范化 SHA-256），同店铺+同指纹只允许一个批次
  idempotencyKey: text('idempotency_key'),
  uploadedBy: uuid('uploaded_by').notNull(),
  totalRows: integer('total_rows').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('ledger_batches_shop_idempotency_unique').on(table.shopId, table.idempotencyKey),
  index('ledger_batches_shop_created_at_idx').on(table.shopId, table.createdAt),
])

export type LedgerBatchRow = typeof ledgerBatches.$inferSelect

// 台账明细：25 个业务字段（含 SKU）+ 归属店铺/批次；在线修改重量时重算公式列
export const ledgerItems = pgTable('ledger_items', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  batchId: uuid('batch_id').notNull(),
  shopId: uuid('shop_id').notNull(),
  seq: text('seq'),
  month: text('month'),
  orderDate: text('order_date'),
  orderMonth: text('order_month'),
  orderNo: text('order_no'),
  sku: text('sku'),
  salePrice: text('sale_price'),
  quantity: text('quantity'),
  unitPrice: text('unit_price'),
  purchaseAmount: text('purchase_amount'),
  purchaseDate: text('purchase_date'),
  purchasePlatform: text('purchase_platform'),
  purchaseOrderNo: text('purchase_order_no'),
  grossProfit: text('gross_profit'),
  channelName: text('channel_name'),
  packageWeight: text('package_weight'),
  freight: text('freight'),
  commission: text('commission'),
  netProfit: text('net_profit'),
  ad22: text('ad22'),
  ad22Net: text('ad22_net'),
  ad30: text('ad30'),
  ad30Net: text('ad30_net'),
  tailFee: text('tail_fee'),
  remark: text('remark'),
}, (table) => [
  index('ledger_items_shop_batch_id_idx').on(table.shopId, table.batchId, table.id),
  index('ledger_items_shop_month_idx').on(table.shopId, table.month),
  index('ledger_items_order_month_idx').on(table.orderMonth),
  uniqueIndex('ledger_items_order_no_unique').on(table.orderNo).where(sql`${table.orderNo} is not null`),
])

export type LedgerItemRow = typeof ledgerItems.$inferSelect
