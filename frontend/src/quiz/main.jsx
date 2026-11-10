import React from 'react'
import ReactDOM from 'react-dom/client'
import QuizApp from './QuizApp'  // ← NOT CustomQuizApp!

const mountPoint = document.getElementById('quiz-root')

if (!mountPoint) {
  console.error('[TayariWeb Quiz] Mount point #quiz-root not found.')
} else {
  const root = ReactDOM.createRoot(mountPoint)
  root.render(
    <React.StrictMode>
      <QuizApp />
    </React.StrictMode>
  )
}