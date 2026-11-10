import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import JumpBar from './JumpBar'
import { formatTime, saveToSession, announce, sanitizeHtml } from '../shared/api'

const CONFIG = {
  AUTO_SUBMIT_WARNING: 60,
  TIMER_WARNING: 180,
  PASSING_PERCENTAGE: 60,
  NEGATIVE_PENALTY: 0.25,
  SAVE_INTERVAL: 10000,
}

const STORAGE_KEYS = {
  ACTIVE: 'tayari_quiz_active',
}

const OPT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f']

// ── Pure normalizers ────────────────────────────────────────────────────
function normalizeQuestion(q, index) {
  return {
    id: String(q.id !== undefined ? q.id : index),
    question: q.text || q.question || 'Question text unavailable',
    options: (q.options || []).map((opt, i) => ({
      key: OPT_KEYS[i] || String.fromCharCode(97 + i),
      text: opt == null ? 'Option unavailable' : typeof opt === 'string' ? opt : (opt.text || 'Option unavailable'),
    })),
    correct: typeof q.correct === 'number'
      ? (OPT_KEYS[q.correct] || String.fromCharCode(97 + q.correct))
      : String(q.correct || 'a'),
    explanation: q.explanation || '',
  }
}

function normalizeConfig(config, questionCount) {
  return {
    timeLimit: (config.timeLimit || 0) * 60,
    totalQuestions: questionCount,
    marksPerCorrect: 1,
    marksPerWrong: config.negativeMarking ? CONFIG.NEGATIVE_PENALTY : 0,
    passingPercentage: CONFIG.PASSING_PERCENTAGE,
    _customQuizType: config.quizType || 'practice',
    _mainCategory: config.mainCategory,
    _negativeMarking: Boolean(config.negativeMarking),
  }
}

// ── Isolated Timer Display (prevents full re-render every second) ─────────
const TimerDisplay = React.memo(function TimerDisplay({ timeRemaining, rawConfig }) {
  const getTimerClass = useCallback(() => {
    if (timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING) return 'danger'
    if (timeRemaining <= CONFIG.TIMER_WARNING) return 'warning'
    return ''
  }, [timeRemaining])

  if (rawConfig.timeLimit <= 0) return null

  return (
    <div
      className={`timer-box ${getTimerClass()}`}
      role="timer"
      aria-label={`Time remaining: ${formatTime(timeRemaining)}`}
    >
      <span className="timer-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </span>
      <span className={`timer-digits ${timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING ? 'warning' : ''}`}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  )
})

// ── Sidebar Data Bridge (updates sidebar DOM via data attributes) ───────
const SidebarBridge = React.memo(function SidebarBridge({ timeRemaining, answers, questionsLength, rawConfig }) {
  useEffect(() => {
    const timerWidget = document.getElementById('sidebarTimer')
    if (timerWidget) {
      const display = timerWidget.querySelector('.timer-display')
      const label = timerWidget.querySelector('.timer-label')
      if (display && label) {
        if (rawConfig.timeLimit > 0) {
          display.textContent = formatTime(timeRemaining)
          label.textContent = timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING ? 'Auto-submit soon!' : 'Remaining'
          timerWidget.classList.toggle('timer-urgent', timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING)
        } else {
          display.textContent = '--:--'
          label.textContent = 'No time limit'
          timerWidget.classList.remove('timer-urgent')
        }
      }
    }

    const progressWidget = document.getElementById('sidebarProgress')
    if (progressWidget) {
      const text = progressWidget.querySelector('.progress-text')
      const fill = progressWidget.querySelector('.progress-fill-mini')
      if (text && fill) {
        const answered = Object.keys(answers).length
        const pct = questionsLength > 0 ? (answered / questionsLength) * 100 : 0
        text.textContent = `${answered} / ${questionsLength} answered`
        fill.style.width = `${pct.toFixed(1)}%`
      }
    }
  }, [timeRemaining, answers, questionsLength, rawConfig.timeLimit])

  return null
})

// ── Component ─────────────────────────────────────────────────────────────
export default function QuizRunner({ questions: rawQuestions, config: rawConfig, onComplete, savedState }) {

  // Memoize normalization to prevent timer restart on every render
  const questions = useMemo(
    () => rawQuestions.map(normalizeQuestion),
    [rawQuestions]
  )

  const dataConfig = useMemo(
    () => normalizeConfig(rawConfig, rawQuestions.length),
    [rawConfig, rawQuestions.length]
  )

  // ── State ─────────────────────────────────────────────────────────────
  const [current, setCurrent] = useState(savedState?.currentIndex || 0)
  const [answers, setAnswers] = useState(() => {
    if (!savedState?.answers) return {}
    const obj = {}
    const entries = savedState.answers instanceof Map
      ? Array.from(savedState.answers.entries())
      : savedState.answers
    ;(entries || []).forEach(([qid, ans]) => {
      const q = questions.find(q => q.id === String(qid))
      if (q) {
        const key = typeof ans === 'number'
          ? (OPT_KEYS[ans] || String.fromCharCode(97 + ans))
          : String(ans)
        obj[q.id] = key
      }
    })
    return obj
  })
  const [revealed, setRevealed] = useState({})
  const [bookmarks, setBookmarks] = useState(new Set())
  const [timeRemaining, setTimeRemaining] = useState(() =>
    savedState?.timeRemaining !== undefined ? savedState.timeRemaining : dataConfig.timeLimit
  )
  const [warningShown, setWarningShown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Use Date.now() for stable time tracking across reloads
  const startTimeRef = useRef(savedState?.startTime || Date.now())
  const timerRef = useRef(null)
  const answersRef = useRef(answers)
  const handleSubmitRef = useRef(null)

  // Sync answersRef with state
  useEffect(() => { answersRef.current = answers }, [answers])

  // ── Derived values (memoized) ─────────────────────────────────────────
  const q = questions[current]
  const isFirst = current === 0
  const isLast = current === questions.length - 1
  const isRevealed = Boolean(revealed[q?.id])
  const hasAnswer = Boolean(answers[q?.id])
  const isExamMode = dataConfig._customQuizType === 'exam'

  // FIXED: Memoize sanitized question content to avoid repeated DOM parsing
  const safeQuestionHtml = useMemo(() => {
    if (!q) return ''
    return sanitizeHtml(q.question)
  }, [q?.question, q?.id])

  const safeExplanationHtml = useMemo(() => {
    if (!q || !q.explanation) return ''
    return sanitizeHtml(q.explanation)
  }, [q?.explanation, q?.id])

  // ── Timer effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (dataConfig.timeLimit <= 0 || isSubmitting) return

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          timerRef.current = null
          setTimeout(() => handleSubmitRef.current(true), 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataConfig.timeLimit, isSubmitting])

  // ── Auto-submit warning ───────────────────────────────────────────────
  useEffect(() => {
    if (dataConfig.timeLimit > 0 && timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING && !warningShown && !isSubmitting) {
      setWarningShown(true)
      announce('Warning: 60 seconds remaining. Quiz will auto-submit soon.', 'assertive')
    }
  }, [timeRemaining, warningShown, dataConfig.timeLimit, isSubmitting])

  // ── Periodic state save ───────────────────────────────────────────────
  useEffect(() => {
    if (isSubmitting) return
    const interval = setInterval(() => {
      const answersForSave = Object.entries(answersRef.current).map(([qid, key]) => {
        const q = questions.find(q => q.id === qid)
        const idx = q ? q.options.findIndex(o => o.key === key) : -1
        return [qid, idx >= 0 ? idx : key]
      })
      saveToSession(STORAGE_KEYS.ACTIVE, {
        questions: rawQuestions,
        answers: answersForSave,
        currentIndex: current,
        timeRemaining,
        startTime: startTimeRef.current,
        config: rawConfig,
      })
    }, CONFIG.SAVE_INTERVAL)
    return () => clearInterval(interval)
  }, [questions, rawQuestions, current, timeRemaining, rawConfig, isSubmitting])

  // ── Before-unload guard ──────────────────────────────────────────────
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (timeRemaining > 0 && !isSubmitting) {
        e.preventDefault()
        e.returnValue = 'You have a quiz in progress. Are you sure you want to leave?'
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [timeRemaining, isSubmitting])

  // ── Callbacks ─────────────────────────────────────────────────────────
  const handleSelect = useCallback((qid, answerKey) => {
    if (revealed[qid]) return
    setAnswers(prev => ({ ...prev, [String(qid)]: String(answerKey) }))
  }, [revealed])

  const handleCheck = useCallback(() => {
    if (!answers[q?.id]) {
      announce('Please select an answer first', 'polite')
      return
    }
    setRevealed(prev => ({ ...prev, [q.id]: true }))
    const isCorrect = answers[q.id] === q.correct
    const explanationText = q.explanation
      ? q.explanation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : ''
    announce(
      isCorrect
        ? `Correct! ${explanationText}`
        : `Wrong! Correct answer: ${q.correct.toUpperCase()}. ${explanationText}`,
      'polite'
    )
  }, [q, answers])

  const handleBookmark = useCallback(() => {
    const qid = questions[current]?.id
    if (!qid) return
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid)
      else next.add(qid)
      return next
    })
  }, [current, questions])

  const handlePrev = useCallback(() => setCurrent(prev => Math.max(0, prev - 1)), [])
  const handleNext = useCallback(() => setCurrent(prev => Math.min(questions.length - 1, prev + 1)), [questions.length])
  const handleJump = useCallback((index) => setCurrent(index), [])

  // ── Handle Submit ─────────────────────────────────────────────────────
  const handleSubmit = useCallback((auto = false) => {
    if (isSubmitting) return

    const currentAnswers = answersRef.current
    const unanswered = questions.length - Object.keys(currentAnswers).length

    if (!auto && unanswered > 0) {
      const confirmed = window.confirm(
        `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}.\nSubmit anyway?`
      )
      if (!confirmed) return
    }

    setIsSubmitting(true)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const endTime = Date.now()
    let correct = 0, wrong = 0, skipped = 0

    questions.forEach(q => {
      const ans = currentAnswers[q.id]
      if (!ans) skipped++
      else if (ans === q.correct) correct++
      else wrong++
    })

    const total = questions.length
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0
    let score = correct
    if (rawConfig.negativeMarking) {
      score = Math.max(0, correct - wrong * CONFIG.NEGATIVE_PENALTY)
    }
    const finalPercentage = total > 0 ? Math.round((score / total) * 100) : 0
    const passed = finalPercentage >= CONFIG.PASSING_PERCENTAGE
    const timeUsed = rawConfig.timeLimit > 0
      ? Math.round((endTime - startTimeRef.current) / 1000)
      : 0

    const resultsData = {
      correct, wrong, skipped, total,
      percentage, finalPercentage, passed, score,
      timeUsed, timeLimit: rawConfig.timeLimit,
      questions: questions.map(q => {
        const userAnswerKey = currentAnswers[q.id]
        const userAnswerIndex = userAnswerKey
          ? q.options.findIndex(o => o.key === userAnswerKey)
          : -1
        return {
          ...q,
          userAnswer: userAnswerIndex >= 0 ? userAnswerIndex : undefined,
          status: !userAnswerKey ? 'skipped' : userAnswerKey === q.correct ? 'correct' : 'wrong',
        }
      }),
    }

    setTimeout(() => onComplete(resultsData), 0)
  }, [isSubmitting, questions, rawConfig, onComplete])

  // Stable ref for timer callback
  handleSubmitRef.current = handleSubmit

  // ── Keyboard shortcuts (stable listener via refs) ────────────────────
  const stateRef = useRef({ current, isRevealed, hasAnswer, isExamMode, questions, answers })
  stateRef.current = { current, isRevealed, hasAnswer, isExamMode, questions, answers }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const { current: curIdx, isRevealed: rev, hasAnswer: hasAns, isExamMode: exam, questions: qs, answers: ansMap } = stateRef.current
      const currentQ = qs[curIdx]
      if (!currentQ) return

      if (['1', '2', '3', '4'].includes(e.key) && !rev) {
        const idx = parseInt(e.key, 10) - 1
        if (currentQ.options?.[idx]) {
          e.preventDefault()
          handleSelect(currentQ.id, currentQ.options[idx].key)
        }
      }
      if (e.key === ' ' && !rev && hasAns && !exam) {
        e.preventDefault()
        handleCheck()
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext() }
      if (e.key === 'Escape') {
        const openModal = document.querySelector('[role="dialog"], [aria-modal="true"]')
        if (openModal) return
        e.preventDefault()
        handleSubmit(false)
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // Empty deps — listener registered once, reads latest state via ref

  // ── Render helpers ───────────────────────────────────────────────────
  const getTimerClass = useCallback(() => {
    if (timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING) return 'danger'
    if (timeRemaining <= CONFIG.TIMER_WARNING) return 'warning'
    return ''
  }, [timeRemaining])

  if (!q) return null

  return (
    <div className="quiz-interface-wrapper">
      {/* Sidebar data bridge — isolated, no re-render of main UI */}
      <SidebarBridge
        timeRemaining={timeRemaining}
        answers={answers}
        questionsLength={questions.length}
        rawConfig={rawConfig}
      />

      <section className="quiz-block" id="quizBlock" aria-label="Quiz Question">

        {/* Toolbar */}
        <div className="quiz-toolbar">
          <div className="toolbar-left">
            <span className="quiz-label">
              {rawConfig.mainCategory?.toUpperCase() || 'Custom'} Quiz
            </span>
          </div>
          <div className="toolbar-right">
            <TimerDisplay timeRemaining={timeRemaining} rawConfig={rawConfig} />
            <button
              type="button"
              className="tool-btn"
              onClick={() => {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
                else document.exitFullscreen?.()
              }}
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Jump Bar */}
        <JumpBar
          total={questions.length}
          current={current}
          answers={answers}
          bookmarks={bookmarks}
          onJump={handleJump}
          questionIds={questions.map(q => q.id)}
        />

        {/* Question */}
        <div className="question-wrap">
          <div className="question-header">
            <span className="q-count" aria-label={`Question ${current + 1} of ${questions.length}`}>
              Q {current + 1} / {questions.length}
            </span>
            <div className="q-tools">
              <button
                type="button"
                className={`tool-btn ${bookmarks.has(q.id) ? 'active' : ''}`}
                onClick={handleBookmark}
                aria-label={bookmarks.has(q.id) ? 'Remove bookmark' : 'Bookmark this question'}
                aria-pressed={bookmarks.has(q.id)}
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24"
                  fill={bookmarks.has(q.id) ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* FIXED: Use memoized sanitized HTML */}
          <div
            className="question-text richtext-content"
            dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
          />

          <div className="options-wrap" role="radiogroup" aria-label="Answer options">
            {q.options?.map((opt) => {
              const classes = ['option-row']
              if (isRevealed) {
                if (opt.key === q.correct) classes.push('correct')
                else if (answers[q.id] === opt.key) classes.push('wrong')
                classes.push('disabled')
              } else if (answers[q.id] === opt.key) {
                classes.push('selected')
              }
              return (
                <label key={opt.key} className={classes.join(' ')}>
                  <input
                    type="radio"
                    name={`question-${q.id}`}
                    value={opt.key}
                    checked={answers[q.id] === opt.key}
                    disabled={isRevealed}
                    onChange={() => handleSelect(q.id, opt.key)}
                  />
                  <span className="opt-text">{opt.text}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Answer Reveal Box */}
        {isRevealed && (
          <div
            className={`reveal-box ${answers[q.id] === q.correct ? 'correct' : 'wrong'}`}
            role="status"
            aria-live="polite"
          >
            <div className="reveal-status">
              {answers[q.id] === q.correct ? (
                <>
                  <span className="status-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </span>
                  Correct!
                </>
              ) : (
                <>
                  <span className="status-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  </span>
                  Wrong! Correct: {q.correct.toUpperCase()}
                </>
              )}
            </div>
            {/* FIXED: Use memoized sanitized HTML */}
            {safeExplanationHtml && (
              <div
                className="reveal-explain richtext-content"
                dangerouslySetInnerHTML={{ __html: safeExplanationHtml }}
              />
            )}
            {!safeExplanationHtml && (
              <div className="reveal-explain">No explanation available for this question.</div>
            )}
          </div>
        )}

        {/* Control Bar */}
        <div className="control-bar">
          <button
            type="button"
            className="ctrl-btn prev"
            onClick={handlePrev}
            disabled={isFirst}
            aria-label="Previous question"
          >
            <span className="btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </span>
            Previous
          </button>

          <div className="ctrl-center">
            {!isExamMode && (
              <button
                type="button"
                className="ctrl-btn check"
                onClick={handleCheck}
                disabled={!hasAnswer || isRevealed}
                aria-label={isRevealed ? 'Answer checked' : 'Check answer'}
              >
                {isRevealed ? 'Checked ✓' : 'Check Answer'}
              </button>
            )}
          </div>

          {isLast ? (
            <button
              type="button"
              className="ctrl-btn submit"
              onClick={() => handleSubmit(false)}
              aria-label="Submit quiz"
            >
              Submit Quiz
              <span className="btn-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="ctrl-btn next"
              onClick={handleNext}
              aria-label="Next question"
            >
              Next
              <span className="btn-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </span>
            </button>
          )}
        </div>

        {/* Auto-submit warning banner */}
        {warningShown && timeRemaining > 0 && timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING && (
          <div className="auto-submit-warning" role="alert" aria-live="assertive">
            <span className="warning-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            <div className="warning-content">
              <strong>Auto-submitting in {timeRemaining}s</strong>
              <span>Complete remaining answers now</span>
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="key-help" aria-hidden="true">
          <span><kbd>1</kbd>–<kbd>4</kbd> Select</span>
          {!isExamMode && <span><kbd>Space</kbd> Check</span>}
          <span><kbd>←</kbd> <kbd>→</kbd> Navigate</span>
          <span><kbd>Esc</kbd> Submit</span>
        </div>

      </section>
    </div>
  )
}