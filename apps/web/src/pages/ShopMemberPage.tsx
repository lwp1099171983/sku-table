import { DeleteOutlined, PlusOutlined, ShopOutlined, UserAddOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, AutoComplete, Button, Card, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Switch, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Shop, ShopMemberDto } from '@sku-table/shared'
import { APP_LABELS } from '../constants/app'
import { useAuth } from '../layouts/AuthContext'
import { adminUsersService } from '../services/adminUsersService'
import { shopsService } from '../services/shopsService'
import './ShopMemberPage.css'

const ROLE_OPTIONS = [
  { value: 'leader', label: '组长' },
  { value: 'customer', label: '客服' },
]

const DELETE_PERMISSION_OPTIONS = [
  { value: 'allow', label: '允许' },
  { value: 'deny', label: '拒绝' },
  { value: 'off', label: '未开通' },
]

interface AddMemberFormValues {
  email: string
  displayName?: string
  password?: string
  roles: string[]
}

export function ShopMemberPage() {
  const { shops, currentShop, switchShop, isAdmin, refreshShops } = useAuth()
  const { message } = AntdApp.useApp()
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null)
  const [members, setMembers] = useState<ShopMemberDto[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [isCreateShopModalOpen, setIsCreateShopModalOpen] = useState(false)
  const [createShopForm] = Form.useForm<{ name: string }>()
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [addMemberForm] = Form.useForm<AddMemberFormValues>()
  const [isSaving, setIsSaving] = useState(false)
  const [accountOptions, setAccountOptions] = useState<Array<{ value: string; label: string }>>([])

  // 进入页面时拉取最新店铺列表（台账导入等操作可能在别的页面自动创建了店铺）
  useEffect(() => {
    void refreshShops()
  }, [refreshShops])

  // 默认选中第一个店铺（管理员可切换任意店铺）
  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? null,
    [selectedShopId, shops],
  )

  useEffect(() => {
    if (!selectedShopId && shops.length > 0) {
      setSelectedShopId(shops[0].id)
    }
  }, [selectedShopId, shops])

  const loadMembers = useCallback(async (shopId: string) => {
    setLoadingMembers(true)
    try {
      setMembers(await shopsService.listMembers(shopId))
    } catch {
      message.error('成员列表加载失败。')
    } finally {
      setLoadingMembers(false)
    }
  }, [message])

  useEffect(() => {
    if (selectedShopId) {
      void loadMembers(selectedShopId)
    }
  }, [selectedShopId, loadMembers])

  const loadAccountOptions = useCallback(async () => {
    try {
      const users = await adminUsersService.listUsers()
      setAccountOptions(users.map((user) => ({
        value: user.email,
        label: user.displayName ? `${user.email}（${user.displayName}）${user.isActive ? '' : '，已停用'}` : `${user.email}${user.isActive ? '' : '，已停用'}`,
      })))
    } catch {
      // 账号列表加载失败时仍允许手动输入新邮箱
    }
  }, [])

  function openAddMemberModal() {
    setIsAddMemberModalOpen(true)
    void loadAccountOptions()
  }

  // 监听邮箱输入，判断是否为已有账号（用于隐藏密码字段）
  const watchedEmail = Form.useWatch('email', addMemberForm)
  const isExistingAccount = accountOptions.some(
    (option) => option.value.toLowerCase() === (watchedEmail ?? '').trim().toLowerCase(),
  )

  // 管理员看全部店铺；非管理员无权限进入此页（路由已拦截，兜底）
  if (!isAdmin) {
    return <Empty description="只有管理员可以管理店铺与成员" />
  }

  async function handleCreateShop() {
    const values = await createShopForm.validateFields()
    setIsSaving(true)
    try {
      const { shop } = await shopsService.createShop({ name: values.name.trim() })
      message.success(`店铺「${shop.name}」已创建。`)
      setIsCreateShopModalOpen(false)
      createShopForm.resetFields()
      // 刷新上下文中的店铺列表并选中新店铺
      await switchShop(currentShop?.id ?? null)
      setSelectedShopId(shop.id)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '店铺创建失败。')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteShop(shop: Shop) {
    try {
      await shopsService.deleteShop(shop.id)
      message.success(`店铺「${shop.name}」已删除。`)
      if (selectedShopId === shop.id) {
        // 删除的是当前选中店铺：先切回「全部」刷新列表，再选中剩余店铺
        await switchShop(null)
        const next = shops.find((item) => item.id !== shop.id)
        setSelectedShopId(next?.id ?? null)
        if (!next) {
          setMembers([])
        }
      } else {
        // 删除的是其他店铺：保持当前店铺，刷新上下文中的店铺列表
        await switchShop(currentShop?.id ?? null)
      }
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '店铺删除失败。')
    }
  }

  async function handleAddMember() {
    const values = await addMemberForm.validateFields()
    if (!selectedShopId) return
    setIsSaving(true)
    try {
      await shopsService.addMember(selectedShopId, {
        email: values.email.trim(),
        displayName: values.displayName?.trim() || undefined,
        password: isExistingAccount ? undefined : values.password,
        roles: values.roles,
      })
      message.success('成员已添加。')
      setIsAddMemberModalOpen(false)
      addMemberForm.resetFields()
      await loadMembers(selectedShopId)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '成员添加失败。')
    } finally {
      setIsSaving(false)
    }
  }

  async function updateMember(member: ShopMemberDto, payload: { roles?: string[]; isActive?: boolean }) {
    if (!selectedShopId) return
    try {
      await shopsService.updateMember(selectedShopId, member.user.id, payload)
      await loadMembers(selectedShopId)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '成员更新失败。')
    }
  }

  async function setMemberPermission(member: ShopMemberDto, permissionCode: 'employee_work.delete' | 'ledger.delete', effect: 'allow' | 'deny' | null) {
    if (!selectedShopId) return
    try {
      await shopsService.setMemberPermission(selectedShopId, member.user.id, { permissionCode, effect })
      await loadMembers(selectedShopId)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '权限配置失败。')
    }
  }

  async function removeMember(member: ShopMemberDto) {
    if (!selectedShopId) return
    try {
      await shopsService.removeMember(selectedShopId, member.user.id)
      message.success(`已移除成员 ${member.user.email}。`)
      await loadMembers(selectedShopId)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '成员移除失败。')
    }
  }

  function getPermissionState(member: ShopMemberDto, permissionCode: string): 'allow' | 'deny' | 'off' {
    const direct = member.directPermissions.find((item) => item.permissionCode === permissionCode)
    return direct?.effect ?? 'off'
  }

  const columns: ColumnsType<ShopMemberDto> = [
    {
      title: '账号',
      dataIndex: ['user', 'email'],
      key: 'email',
      width: 220,
      render: (email: string, record) => (
        <div>
          <Typography.Text>{email}</Typography.Text>
          {record.user.displayName && <div className="member-display-name">{record.user.displayName}</div>}
        </div>
      ),
    },
    {
      title: '角色',
      key: 'roles',
      width: 200,
      render: (_, record) => (
        <Select
          mode="multiple"
          value={record.roles.filter((role) => ROLE_OPTIONS.some((option) => option.value === role))}
          options={ROLE_OPTIONS}
          placeholder="选择角色"
          className="member-role-select"
          onChange={(roles: string[]) => void updateMember(record, { roles })}
        />
      ),
    },
    {
      title: '删除员工工作',
      key: 'employeeWorkDelete',
      width: 130,
      render: (_, record) => (
        <Select
          value={getPermissionState(record, 'employee_work.delete')}
          options={DELETE_PERMISSION_OPTIONS}
          className="permission-select"
          onChange={(value: 'allow' | 'deny' | 'off') => void setMemberPermission(record, 'employee_work.delete', value === 'off' ? null : value)}
        />
      ),
    },
    {
      title: '删除台账',
      key: 'ledgerDelete',
      width: 130,
      render: (_, record) => (
        <Select
          value={getPermissionState(record, 'ledger.delete')}
          options={DELETE_PERMISSION_OPTIONS}
          className="permission-select"
          onChange={(value: 'allow' | 'deny' | 'off') => void setMemberPermission(record, 'ledger.delete', value === 'off' ? null : value)}
        />
      ),
    },
    {
      title: '启用',
      key: 'isActive',
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.isActive}
          onChange={(checked) => void updateMember(record, { isActive: checked })}
          aria-label="启用状态"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_, record) => (
        <Popconfirm
          title="确认移除该成员？"
          description="移除后该成员将无法访问此店铺数据。"
          okText="移除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => removeMember(record)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} aria-label="移除成员" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">SHOPS & MEMBERS</Typography.Text>
          <Typography.Title level={1}>{APP_LABELS.shopManagement}</Typography.Title>
          <Typography.Paragraph type="secondary">创建店铺、给组长/客服分配角色与店铺、单独开通删除权限。</Typography.Paragraph>
        </div>
        <Space className="page-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateShopModalOpen(true)}>创建店铺</Button>
        </Space>
      </div>

      <div className="shop-member-layout">
        <Card className="shop-list-card" bordered={false} title="店铺列表">
          <List
            dataSource={shops}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有店铺" /> }}
            renderItem={(shop: Shop) => (
              <List.Item
                className={shop.id === selectedShopId ? 'shop-list-item active' : 'shop-list-item'}
                onClick={() => setSelectedShopId(shop.id)}
                actions={[
                  <Popconfirm
                    key="delete-shop"
                    title={`确认删除店铺「${shop.name}」？`}
                    description="该店铺下的成员、员工、工作记录与台账将一并删除，且不可恢复。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => handleDeleteShop(shop)}
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={`删除店铺 ${shop.name}`}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <Space><ShopOutlined /><span>{shop.name}</span></Space>
              </List.Item>
            )}
          />
        </Card>

        <Card
          className="member-card"
          bordered={false}
          title={selectedShop ? `成员管理：${selectedShop.name}` : '成员管理'}
          extra={<Button type="primary" icon={<UserAddOutlined />} disabled={!selectedShopId} onClick={openAddMemberModal}>添加成员</Button>}
        >
          <div className="table-wrap">
            <Table rowKey={(record) => record.user.id} columns={columns} dataSource={members} loading={loadingMembers} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该店铺还没有成员" /> }} scroll={{ x: 900 }} pagination={false} />
          </div>
        </Card>
      </div>

      <Modal
        title="创建店铺"
        open={isCreateShopModalOpen}
        onCancel={() => setIsCreateShopModalOpen(false)}
        onOk={() => void handleCreateShop()}
        confirmLoading={isSaving}
        okText="创建"
        cancelText="取消"
      >
        <Form form={createShopForm} layout="vertical" requiredMark={false}>
          <Form.Item label="店铺名称" name="name" rules={[{ required: true, max: 100, message: '请输入店铺名称（100 字以内）' }]}>
            <Input placeholder="如：陈波、主店" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加成员"
        open={isAddMemberModalOpen}
        onCancel={() => setIsAddMemberModalOpen(false)}
        onOk={() => void handleAddMember()}
        confirmLoading={isSaving}
        okText="添加"
        cancelText="取消"
      >
        <Form form={addMemberForm} layout="vertical" requiredMark={false}>
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <AutoComplete
              options={accountOptions}
              placeholder="搜索已有账号，或输入新邮箱"
              filterOption={(inputValue, option) => String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())}
            />
          </Form.Item>
          {isExistingAccount ? (
            <Alert type="info" showIcon message="该账号已存在，将直接加入店铺，无需重复设置密码。" style={{ marginBottom: 24 }} />
          ) : (
            <>
              <Form.Item label="姓名（可选）" name="displayName">
                <Input placeholder="用于工作台展示" maxLength={100} />
              </Form.Item>
              <Form.Item label="密码（新用户必填，至少 8 位）" name="password" rules={[{ required: true, message: '新用户必须设置密码' }, { min: 8, message: '密码至少需要 8 个字符' }]}>
                <Input.Password placeholder="新用户请设置密码" autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Form.Item label="角色" name="roles" rules={[{ required: true, message: '请至少选择一个角色' }]}>
            <Select mode="multiple" options={ROLE_OPTIONS} placeholder="组长 / 客服" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
