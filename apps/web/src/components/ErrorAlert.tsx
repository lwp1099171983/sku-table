import { Alert } from 'antd'

interface ErrorAlertProps {
  message: string
  className?: string
}

export function ErrorAlert({ message, className }: ErrorAlertProps) {
  return <Alert type="error" showIcon message={message} className={className} />
}
