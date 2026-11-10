import React from 'react'
import ReactDOM from 'react-dom/client'
import QuizApp from './QuizApp'

const rootElement = document.getElementById('quiz-root')

if (!rootElement) {
  console.error('ERROR: #quiz-root not found')
} else {
  try {
    // Get questions from script tag (no length limit, no escaping issues)
    const scriptTag = document.getElementById('quiz-data')
    let questions = []
    
    if (scriptTag) {
      const jsonText = scriptTag.textContent.trim()
      console.log('JSON length:', jsonText.length)
      console.log('JSON first 200 chars:', jsonText.substring(0, 200))
      questions = JSON.parse(jsonText)
      console.log('Parsed questions count:', questions.length)
    } else {
      console.warn('No quiz-data script tag found')
    }

    const quizData = {
      id: parseInt(rootElement.dataset.quizId) || 0,
      title: rootElement.dataset.title || 'Quiz',
      description: rootElement.dataset.description || '',
      category: rootElement.dataset.category || '',
      difficulty: rootElement.dataset.difficulty || 'medium',
      updatedAt: new Date().toLocaleDateString(),
      questions: questions,
      config: {
        timeLimit: parseInt(rootElement.dataset.timeLimit) || 3600,
        attemptId: rootElement.dataset.attemptId !== 'null' ? rootElement.dataset.attemptId : null,
        quizType: rootElement.dataset.quizType || 'simple',
        marksPerCorrect: parseFloat(rootElement.dataset.marksCorrect) || 1,
        marksPerWrong: parseFloat(rootElement.dataset.marksWrong) || 0,
        passingPercentage: parseFloat(rootElement.dataset.passing) || 60,
        totalQuestions: parseInt(rootElement.dataset.totalQuestions) || questions.length,
      }
    }

    console.log('Mounting React with', questions.length, 'questions')
    
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <QuizApp data={quizData} />
      </React.StrictMode>
    )
    
  } catch (err) {
    console.error('React mount failed:', err)
    rootElement.innerHTML = `
      <div style="padding:2rem;color:#dc2626;background:#fee2e2;border-radius:8px;margin:2rem;">
        <h3>Error Loading Quiz</h3>
        <p>${err.message}</p>
      </div>
    `
  }
}