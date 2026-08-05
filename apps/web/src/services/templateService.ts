const TEMPLATE_DIRECTORY = '/templates'

export const templateFiles = {
  employeeWork: `${TEMPLATE_DIRECTORY}/employee-work-template.xlsx`,
  pricing: `${TEMPLATE_DIRECTORY}/pricing-template.xlsx`,
} as const

export function downloadTemplate(path: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = path
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
