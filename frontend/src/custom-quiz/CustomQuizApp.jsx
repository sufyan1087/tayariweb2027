import React, { useState, useCallback, useEffect, useRef } from 'react'
import QuizConfig from './QuizConfig'
import QuizRunner from './QuizRunner'
import QuizResults from './QuizResults'
import { loadFromSession, saveToSession, clearSession, announce } from '../shared/api'

const PHASES = {
  CONFIG: 'config',
  RUNNING: 'running',
  RESULTS: 'results',
}

const STORAGE_KEYS = {
  CONFIG: 'tayari_quiz_config',
  ACTIVE: 'tayari_quiz_active',
  PHASE: 'tayari_quiz_phase',
  GENERATED_DATA: 'tayari_quiz_generated',
}

function getPhase() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.PHASE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.phase) {
      return parsed.phase
    }
    return null
  } catch {
    return null
  }
}

function savePhase(phaseValue) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.PHASE, JSON.stringify({
      phase: phaseValue,
      _timestamp: Date.now(),
    }))
  } catch (e) {
    console.error('[TayariWeb] Failed to save phase:', e)
  }
}

// Related quiz links for sidebar
const RELATED_LINKS = [
  { href: '/custom-quiz/css/', label: 'CSS General Science' },
  { href: '/custom-quiz/pms/', label: 'PMS Current Affairs' },
  { href: '/custom-quiz/issb/', label: 'ISSB Intelligence Test' },
  { href: '/custom-quiz/general/', label: 'General Knowledge' },
]

export default function CustomQuizApp({
  pageContext = 'config',
  takePath = '/custom-quiz/',
  configPath = '/custom-quiz/',
  educationalContent = ''
}) {
  const isTakePage = pageContext === 'take'

  const [phase, setPhase] = useState(() => {
    const savedPhase = getPhase()
    if (savedPhase && Object.values(PHASES).includes(savedPhase)) {
      return savedPhase
    }
    return isTakePage ? PHASES.RUNNING : PHASES.CONFIG
  })

  const [quizData, setQuizData] = useState(null)
  const [quizConfig, setQuizConfig] = useState(null)
  const [results, setResults] = useState(null)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [resumeData, setResumeData] = useState(null)
  const resumeCheckedRef = useRef(false)

  const clearAllSession = useCallback(() => {
    clearSession(STORAGE_KEYS.ACTIVE)
    clearSession(STORAGE_KEYS.CONFIG)
    clearSession(STORAGE_KEYS.GENERATED_DATA)
    clearSession('tayari_quiz_results')
    sessionStorage.removeItem(STORAGE_KEYS.PHASE)
  }, [])

  // On mount: try to restore session
  useEffect(() => {
    if (resumeCheckedRef.current) return
    resumeCheckedRef.current = true

    try {
      const savedPhase = getPhase()
      const savedGenerated = loadFromSession(STORAGE_KEYS.GENERATED_DATA)
      const savedActive = loadFromSession(STORAGE_KEYS.ACTIVE, 60 * 60 * 1000)

      // If on take page and we have active quiz data, load it
      if (isTakePage && savedActive && savedActive.questions?.length > 0) {
        setQuizData(savedActive)
        setQuizConfig(savedActive.config)
        const targetPhase = savedPhase === PHASES.RESULTS ? PHASES.RESULTS : PHASES.RUNNING
        setPhase(targetPhase)

        if (targetPhase === PHASES.RESULTS) {
          const savedResults = loadFromSession('tayari_quiz_results')
          if (savedResults) setResults(savedResults)
        }
        return
      }

      // If on take page and we have generated data but no active session
      if (isTakePage && savedGenerated && savedGenerated.questions?.length > 0) {
        setQuizData(savedGenerated)
        setQuizConfig(savedGenerated.config)
        const targetPhase = savedPhase === PHASES.RESULTS ? PHASES.RESULTS : PHASES.RUNNING
        setPhase(targetPhase)

        if (targetPhase === PHASES.RESULTS) {
          const savedResults = loadFromSession('tayari_quiz_results')
          if (savedResults) setResults(savedResults)
        }
        return
      }

      // If on config page and user has unfinished quiz, offer resume
      if (!isTakePage && savedActive && savedActive.questions?.length > 0 && savedPhase === PHASES.RUNNING) {
        setResumeData(savedActive)
        setShowResumeDialog(true)
      }
    } catch (err) {
      console.error('[TayariWeb] Session restore failed:', err)
      clearAllSession()
    }
  }, [isTakePage, clearAllSession])

  // ── CENTRALIZED: Single data-phase attribute drives ALL layout visibility ──────
  useEffect(() => {
    const wrapper = document.getElementById('quiz-page-wrapper')
    if (wrapper) {
      wrapper.setAttribute('data-phase', phase)
    }
  }, [phase])

  // ── Populate sidebar widgets for results phase ────────────────────────────────
  useEffect(() => {
    if (phase !== PHASES.RESULTS) return

    const relatedList = document.getElementById('relatedList')
    if (relatedList) {
      relatedList.innerHTML = ''
      RELATED_LINKS.forEach(({ href, label }) => {
        const a = document.createElement('a')
        a.href = href
        a.className = 'related-link'
        a.textContent = label
        relatedList.appendChild(a)
      })
    }

    const ltAttempts = document.getElementById('ltAttempts')
    const ltAvg = document.getElementById('ltAvg')
    if (ltAttempts) ltAttempts.textContent = '12'
    if (ltAvg) ltAvg.textContent = '68%'
  }, [phase])

  const handleResumeConfirm = useCallback(() => {
    if (resumeData) {
      setQuizData(resumeData)
      setQuizConfig(resumeData.config)
      setPhase(PHASES.RUNNING)
      announce('Resuming previous quiz session', 'polite')
    }
    setShowResumeDialog(false)
  }, [resumeData])

  const handleResumeDecline = useCallback(() => {
    clearAllSession()
    setShowResumeDialog(false)
    setResumeData(null)
  }, [clearAllSession])

  const handleQuizGenerated = useCallback((data, config) => {
    const generatedData = {
      questions: data.questions || [],
      config: config,
      generatedAt: Date.now(),
    }

    saveToSession(STORAGE_KEYS.GENERATED_DATA, generatedData)
    savePhase(PHASES.RUNNING)

    setQuizData(generatedData)
    setQuizConfig(config)
    setPhase(PHASES.RUNNING)
  }, [])

  const handleQuizComplete = useCallback((quizResults) => {
    setResults(quizResults)
    setPhase(PHASES.RESULTS)
    savePhase(PHASES.RESULTS)
    clearSession(STORAGE_KEYS.ACTIVE)
    clearSession(STORAGE_KEYS.CONFIG)
    saveToSession('tayari_quiz_results', quizResults)
    announce(
      `Quiz complete. You scored ${quizResults.finalPercentage} percent. ${quizResults.passed ? 'Pass' : 'Fail'}`,
      'assertive'
    )
  }, [])

  const handleRestart = useCallback(() => {
    clearAllSession()
    saveToSession(STORAGE_KEYS.GENERATED_DATA, quizData)
    savePhase(PHASES.RUNNING)
    window.location.reload()
  }, [clearAllSession, quizData])

  const handleNewQuiz = useCallback(() => {
    clearAllSession()
    window.location.href = configPath
  }, [clearAllSession, configPath])

  const showConfig = phase === PHASES.CONFIG
  const showRunning = phase === PHASES.RUNNING && quizData
  const showResults = phase === PHASES.RESULTS && results

  // If on take page but no quiz data loaded, show "no active quiz" state
  if (isTakePage && !quizData && phase === PHASES.RUNNING) {
    return (
      <div className="no-quiz-state">
        <h2>No Active Quiz</h2>
        <p>
          You don&apos;t have an active quiz session. Configure a new quiz to start practicing.
        </p>
        <a
          href={configPath}
          className="btn btn-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <line x1="12" y1="5" x2="12" y2="19"/>
          </svg>
          Create New Quiz
        </a>
      </div>
    )
  }

  return (
    <>
      {showResumeDialog && (
        <div className="resume-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-title">
          <div className="resume-dialog">
            <h3 id="resume-title">Resume Previous Quiz?</h3>
            <p>You have an unfinished quiz. Would you like to resume where you left off?</p>
            <div className="resume-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={handleResumeDecline}>
                Start New
              </button>
              <button type="button" className="btn btn-primary" onClick={handleResumeConfirm}>
                Resume Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <QuizConfig onQuizGenerated={handleQuizGenerated} />
      )}

      {showRunning && (
        <QuizRunner
          questions={quizData.questions}
          config={quizConfig}
          onComplete={handleQuizComplete}
          savedState={quizData}
        />
      )}

      {showResults && (
        <QuizResults
          results={results}
          onRestart={handleRestart}
          onNewQuiz={handleNewQuiz}
        />
      )}
    </>
  )
}