import { KeyOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Card, Empty, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import type { AdminUserDto } from '@sku-table/shared'
import { APP_COPY } from '../constants/app'
import { adminUsersService } from '../services/adminUsersService'
import './AdminUsersPage.css'

const ROLE_LABELS: Record<string, string> = {
  leader: '组长',
  customer: '客服',
}

export function AdminUsersPage() {
  const { message, modal } = AntdApp.useApp()
  const [users, setUsers] = useState<AdminUserDto[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null)
  const [resetForm] = Form.useForm<{ newPassword: string }>()
  const [isSaving, setIsSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      setUsers(await adminUsersService.listUsers())
    } catch {
      message.error('账号列表加载失败。')
    } finally {
      setLoadingUsers(false)
    }
  }, [message])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  function confirmToggleActive(user: AdminUserDto) {
    const next = !user.isActive
    modal.confirm({
      title: next ? `启用账号「${user.email}」？` : `停用账号「${user.email}」？`,
      content: next
        ? '启用后该账号可恢复登录。'
        : '停用后该账号将无法登录，所有店铺访问立即失效；成员关系保留，可随时重新启用。',
      okText: next ? '启用' : '停用',
      okButtonProps: { danger: !next },
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminUsersService.setActive(user.id, { isActive: next })
          message.success(next ? '账号已启用。' : '账号已停用。')
          await loadUsers()
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
          message.error(apiMessage || '账号状态更新失败。')
        }
      },
    })
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    const values = await resetForm.validateFields()
    setIsSaving(true)
    try {
      await adminUsersService.resetPassword(resetTarget.id, values.newPassword)
      message.success(`已重置「${resetTarget.email}」的密码。`)
      setResetTarget(null)
      resetForm.resetFields()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '密码重置失败。')
    } finally {
      setIsSaving(false)
    }
  }

  const columns: ColumnsType<AdminUserDto> = [
    {
      title: '账号',
      dataIndex: 'email',
      key: 'email',
      width: 240,
      render: (email: string, record) => (
        <div>
          <Typography.Text>{email}</Typography.Text>
          {record.displayName && <div className="admin-user-display-name">{record.displayName}</div>}
        </div>
      ),
    },
    {
      title: '所属店铺与角色',
      key: 'memberships',
      render: (_, record) => (
        record.memberships.length > 0
          ? (
            <Space size={[4, 4]} wrap>
              {record.memberships.map((membership) => (
                <Tag key={membership.shopId} color="blue">
                  {membership.shopName}
                  {membership.roles.length > 0 && ` · ${membership.roles.map((role) => ROLE_LABELS[role] ?? role).join(' / ')}`}
                </Tag>
              ))}
            </Space>
          )
          : <Typography.Text type="secondary">未分配店铺</Typography.Text>
      ),
    },
    {
      title: '账号状态',
      key: 'isActive',
      width: 110,
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => confirmToggleActive(record)}
          aria-label="账号启用状态"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right' as const,
      render: (_, record) => (
        <Button type="text" icon={<KeyOutlined />} onClick={() => { setResetTarget(record); resetForm.resetFields() }}>
          重置密码
        </Button>
      ),
    },
  ]

  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">ACCOUNTS</Typography.Text>
          <Typography.Title level={1}>{APP_COPY.accountManagement}</Typography.Title>
          <Typography.Paragraph type="secondary">查看全部组长/客服账号，重置密码、停用或启用账号。</Typography.Paragraph>
        </div>
      </div>

      <Card bordered={false}>
        <div className="table-wrap">
          <Table
            rowKey={(record) => record.id}
            columns={columns}
            dataSource={users}
            loading={loadingUsers}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有非管理员账号" /> }}
            scroll={{ x: 760 }}
            pagination={false}
          />
        </div>
      </Card>

      <Modal
        title={resetTarget ? `重置密码：${resetTarget.email}` : '重置密码'}
        open={resetTarget !== null}
        onCancel={() => setResetTarget(null)}
        onOk={() => void handleResetPassword()}
        confirmLoading={isSaving}
        okText="重置"
        cancelText="取消"
      >
        <Form form={resetForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, min: 8, message: '新密码至少需要 8 个字符' }]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
