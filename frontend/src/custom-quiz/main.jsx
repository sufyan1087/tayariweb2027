import React from 'react'
import ReactDOM from 'react-dom/client'
import CustomQuizApp from './CustomQuizApp'

const mountPoint = document.getElementById('custom-quiz-root')

if (!mountPoint) {
  console.error('[TayariWeb Custom Quiz] Mount point #custom-quiz-root not found. Ensure the Django template includes <div id="custom-quiz-root"></div>')
} else {
  const pageContext = mountPoint.dataset.page || 'config'
  const takePath = mountPoint.dataset.takePath || '/custom-quiz/'
  const configPath = mountPoint.dataset.configPath || '/custom-quiz/'
  const educationalContent = mountPoint.dataset.educationalContent || ''

  if (!window.CATEGORY_DATA || !Array.isArray(window.CATEGORY_DATA)) {
    console.warn('[TayariWeb Custom Quiz] CATEGORY_DATA not initialized. Quiz config may not function correctly.')
  }

  if (!window.QUIZ_API_URLS || !window.QUIZ_API_URLS.generate) {
    console.warn('[TayariWeb Custom Quiz] QUIZ_API_URLS not initialized. API calls will fail.')
  }

  const root = ReactDOM.createRoot(mountPoint)

  const app = (
    <CustomQuizApp
      pageContext={pageContext}
      takePath={takePath}
      configPath={configPath}
      educationalContent={educationalContent}
    />
  )

  // Use StrictMode only in development to catch bugs
  // Remove for production to avoid double mount/render
  root.render(
    import.meta.env?.DEV ? (
      <React.StrictMode>{app}</React.StrictMode>
    ) : (
      app
    )
  )
}