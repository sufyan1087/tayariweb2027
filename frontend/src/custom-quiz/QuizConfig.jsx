import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  apiRequest,
  debounce,
  saveToSession,
  loadFromSession,
  announce,
} from '../shared/api'

const CONFIG = {
  MIN_SEARCH_LENGTH: 2,
  MAX_TOPICS: 10,
  STORAGE_KEY: 'tayari_quiz_config',
}

const QUIZ_API_URLS = window.QUIZ_API_URLS || {}
const CATEGORY_DATA = window.CATEGORY_DATA || []

const DIFFICULTY_MAP = {
  balanced: { label: 'Balanced', easy: 33, medium: 33, hard: 34 },
  easy_focus: { label: 'Easy Focus', easy: 50, medium: 30, hard: 20 },
  medium_focus: { label: 'Medium Focus', easy: 25, medium: 50, hard: 25 },
  hard_focus: { label: 'Hard Focus', easy: 20, medium: 30, hard: 50 },
  exam_standard: { label: 'Exam Standard', easy: 25, medium: 50, hard: 25 },
}

const QUIZ_MODES = [
  {
    type: 'practice',
    title: 'Practice Mode',
    desc: 'See answers immediately with detailed explanations',
    features: ['Instant Feedback', 'Explanations'],
    isExam: false,
  },
  {
    type: 'exam',
    title: 'Exam Mode',
    desc: 'Strict simulation. No feedback until final results.',
    features: ['Real Exam Feel', 'No Hints'],
    isDefault: true,
    isExam: true,
  },
  {
    type: 'exam_review',
    title: 'Exam + Review',
    desc: 'Exam conditions with optional answer verification',
    features: ['Flexible Check', 'Timed'],
    isExam: false,
  },
]

export default function QuizConfig({ onQuizGenerated }) {
  const [mainCategory, setMainCategory] = useState('')
  const [subCategories, setSubCategories] = useState([])
  const [topics, setTopics] = useState([])
  const [questionCount, setQuestionCount] = useState(50)
  const [timeLimit, setTimeLimit] = useState(45)
  const [difficulty, setDifficulty] = useState('balanced')
  const [quizType, setQuizType] = useState('exam')
  const [negativeMarking, setNegativeMarking] = useState(false)
  const [randomOrder, setRandomOrder] = useState(true)
  const [availableCount, setAvailableCount] = useState(0)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [validationMessage, setValidationMessage] = useState(null)
  const [topicSearchQuery, setTopicSearchQuery] = useState('')
  const [topicSuggestions, setTopicSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const topicInputRef = useRef(null)
  const debounceTimerRef = useRef(null)
  const suggestionsRef = useRef(null)
  // Track latest search query to ignore stale responses
  const latestSearchRef = useRef('')

  // Load saved config on mount
  useEffect(() => {
    const saved = loadFromSession(CONFIG.STORAGE_KEY)
    if (saved) {
      setMainCategory(saved.mainCategory || '')
      setSubCategories(saved.subCategories || [])
      setTopics(saved.topics || [])
      setQuestionCount(saved.questionCount || 50)
      setTimeLimit(saved.timeLimit || 45)
      setDifficulty(saved.difficulty || 'balanced')
      setQuizType(saved.quizType || 'exam')
      setNegativeMarking(saved.negativeMarking || false)
      setRandomOrder(saved.randomOrder !== false)
    }
  }, [])

  // Save config to session whenever it changes
  useEffect(() => {
    saveToSession(CONFIG.STORAGE_KEY, {
      mainCategory,
      subCategories,
      topics,
      questionCount,
      timeLimit,
      difficulty,
      quizType,
      negativeMarking,
      randomOrder,
    })
  }, [
    mainCategory, subCategories, topics, questionCount,
    timeLimit, difficulty, quizType, negativeMarking, randomOrder,
  ])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
          topicInputRef.current && !topicInputRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-hide validation message after 5s
  useEffect(() => {
    if (validationMessage) {
      const timer = setTimeout(() => setValidationMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [validationMessage])

  const checkAvailability = useCallback(async () => {
    if (!mainCategory) {
      setAvailableCount(0)
      return
    }

    setIsCheckingAvailability(true)
    try {
      const result = await apiRequest(QUIZ_API_URLS.checkAvailability || '', {
        method: 'POST',
        body: JSON.stringify({ mainCategory, subCategories }),
      })
      setAvailableCount(result.available_count || 0)
    } catch (err) {
      console.error('Availability check failed:', err)
      setAvailableCount(0)
    } finally {
      setIsCheckingAvailability(false)
    }
  }, [mainCategory, subCategories])

  useEffect(() => {
    checkAvailability()
  }, [checkAvailability])

  // Memoized topic search with stale-response guard
  const searchTopics = useMemo(() =>
    debounce(async (query) => {
      if (query.length < CONFIG.MIN_SEARCH_LENGTH) {
        setTopicSuggestions([])
        setShowSuggestions(false)
        return
      }

      try {
        const result = await apiRequest(
          `${QUIZ_API_URLS.topics || ''}?q=${encodeURIComponent(query)}`,
          { method: 'GET' }
        )

        // Ignore stale responses
        if (query !== latestSearchRef.current) return

        if (result.topics?.length) {
          setTopicSuggestions(result.topics)
          setShowSuggestions(true)
        } else {
          setTopicSuggestions([])
          setShowSuggestions(false)
        }
      } catch (err) {
        console.error('Topic search failed:', err)
        setTopicSuggestions([])
        setShowSuggestions(false)
      }
    }, 300),
    []
  )

  const handleTopicSearch = useCallback((e) => {
    const value = e.target.value
    setTopicSearchQuery(value)
    latestSearchRef.current = value.toLowerCase().trim()
    searchTopics(value.toLowerCase().trim())
  }, [searchTopics])

  const addTopic = useCallback((topic) => {
    const normalizedTopic = topic.trim().toLowerCase()
    if (!normalizedTopic) return

    setTopics(prev => {
      const exists = prev.some((t) => t.toLowerCase() === normalizedTopic)
      if (exists) return prev

      if (prev.length >= CONFIG.MAX_TOPICS) {
        setValidationMessage({
          text: `Maximum ${CONFIG.MAX_TOPICS} topics allowed`,
          type: 'warning',
        })
        return prev
      }

      return [...prev, topic.trim()]
    })
    setTopicSearchQuery('')
    setTopicSuggestions([])
    setShowSuggestions(false)
    topicInputRef.current?.focus()
  }, [])

  const removeTopic = useCallback((topic) => {
    setTopics(prev => prev.filter((t) => t !== topic))
  }, [])

  const selectedCategory = useMemo(() =>
    CATEGORY_DATA.find((c) => c.slug === mainCategory),
    [mainCategory]
  )
  const subcategoryList = selectedCategory?.subcategories || []

  const handleMainCategoryChange = useCallback((e) => {
    const newCategory = e.target.value
    setMainCategory(newCategory)
    setSubCategories([])
    setTopics([])
    setAvailableCount(0)
  }, [])

  const toggleSubCategory = useCallback((value) => {
    setSubCategories(prev =>
      prev.includes(value)
        ? prev.filter((s) => s !== value)
        : [...prev, value]
    )
  }, [])

  const isExamMode = quizType === 'exam' || quizType === 'exam_review'

  const getTimePerQuestion = useCallback(() => {
    if (timeLimit === 0) return 'Unlimited'
    const seconds = Math.round((timeLimit * 60) / questionCount)
    return `${seconds} seconds`
  }, [timeLimit, questionCount])

  const getTimeEstimateClass = useCallback(() => {
    if (timeLimit === 0) return 'unlimited'
    const seconds = Math.round((timeLimit * 60) / questionCount)
    if (seconds < 30) return 'urgent'
    if (seconds < 45) return 'warning'
    return ''
  }, [timeLimit, questionCount])

  const startBtnState = useMemo(() => {
    if (!mainCategory) {
      return {
        enabled: false,
        reason: 'default',
        text: 'Select a category to enable quiz generation',
      }
    }
    if (availableCount === 0) {
      return {
        enabled: false,
        reason: 'insufficient',
        text: 'No questions available for selected categories',
      }
    }
    if (availableCount < questionCount) {
      return {
        enabled: true,
        reason: 'limited',
        text: `Only ${availableCount} questions available. Click to start with ${Math.min(availableCount, questionCount)} questions.`,
      }
    }
    return {
      enabled: true,
      reason: 'ready',
      text: 'Ready to generate your quiz!',
    }
  }, [mainCategory, availableCount, questionCount])

  /**
 * Attempts to generate a quiz. If the backend returns 'insufficient_questions',
 * automatically retries with the backend's reported available count.
 */
  async function generateQuizWithRetry(payload) {
    try {
      return await apiRequest(QUIZ_API_URLS.generate || '', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } catch (error) {
      // Check if this is an insufficient_questions error from the backend
      if (error.status === 400 && error.data?.error === 'insufficient_questions') {
        const backendAvailable = error.data.available_count

        if (backendAvailable && backendAvailable > 0 && backendAvailable < payload.questionCount) {
          console.warn(
            `[QuizGenerator] Backend reports ${backendAvailable} questions available ` +
            `(requested ${payload.questionCount}). Retrying with capped count.`
          )

          const retryPayload = {
            ...payload,
            questionCount: backendAvailable,
          }

          return await apiRequest(QUIZ_API_URLS.generate || '', {
            method: 'POST',
            body: JSON.stringify(retryPayload),
          })
        }
      }

      throw error
    }
  }

  const startQuiz = useCallback(async () => {
    if (!mainCategory) {
      setValidationMessage({
        text: 'Please select a main category',
        type: 'error',
      })
      return
    }

    if (availableCount === 0) {
      setValidationMessage({
        text: 'No questions available for your selection. Please try different categories.',
        type: 'error',
      })
      return
    }

    let finalQuestionCount =
      availableCount < questionCount ? availableCount : questionCount

    if (availableCount < questionCount) {
      const proceed = window.confirm(
        `Only ${availableCount} questions available (you requested ${questionCount}).\n\n` +
          `Quiz will start with ${finalQuestionCount} questions instead.\n\n` +
          `Do you want to continue?`
      )
      if (!proceed) return
    }

    setIsGenerating(true)

    try {
      const result = await generateQuizWithRetry({
        mainCategory,
        subCategories,
        topics,
        questionCount: finalQuestionCount,
        timeLimit,
        difficulty,
        quizType,
        negativeMarking,
        randomOrder,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate quiz')
      }

      if (!result.questions?.length) {
        throw new Error('Invalid quiz data received')
      }

      onQuizGenerated(result, {
        timeLimit,
        quizType,
        negativeMarking,
        mainCategory,
        questionCount: result.questions?.length || finalQuestionCount,
      })
    } catch (error) {
      console.error('Quiz generation failed:', error)
      setValidationMessage({
        text: error.message || 'Failed to start quiz. Please try again.',
        type: 'error',
      })
    } finally {
      // FIXED: Always reset generating state
      setIsGenerating(false)
    }
  }, [mainCategory, subCategories, topics, questionCount, timeLimit, difficulty, quizType, negativeMarking, randomOrder, availableCount, onQuizGenerated])

  const currentDiff = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.balanced

  return (
    <div className="quiz-config-wrapper">
      {validationMessage && (
        <div
          className={`validation-toast ${validationMessage.type} show`}
          role="alert"
        >
          {validationMessage.text}
        </div>
      )}

      <section className="generator-section" aria-label="Quiz Configuration">
        <fieldset className="form-section" id="section1">
          <legend className="section-header">
            <span className="section-num">1</span>
            <h2>Select Categories</h2>
          </legend>

          <div className="form-group">
            <label htmlFor="mainCategory" className="form-label">
              Main Category <span className="required">*</span>
            </label>
            <select
              id="mainCategory"
              className="form-select"
              value={mainCategory}
              onChange={handleMainCategoryChange}
            >
              <option value="">Choose a category...</option>
              {CATEGORY_DATA.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.name} ({cat.total_questions || 0} questions)
                </option>
              ))}
            </select>
            <p className="field-hint">
              Select your exam type to see available subcategories
            </p>
          </div>

          {mainCategory && (
            <div className="form-group">
              <span className="group-label">
                Sub Categories <small className="hint">(Select multiple)</small>
              </span>

              {subcategoryList.length === 0 ? (
                <div className="empty-subcategories">
                  <p>
                    <strong>
                      No subcategories available for{' '}
                      {selectedCategory?.name || 'this category'}
                    </strong>
                  </p>
                  <p>
                    You can still generate a quiz with all questions from this
                    main category.
                  </p>
                </div>
              ) : (
                <div className="checkbox-grid">
                  {subcategoryList.map((sub, idx) => (
                    <label
                      key={idx}
                      className={`checkbox-item ${
                        subCategories.includes(sub.name) ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={sub.name}
                        checked={subCategories.includes(sub.name)}
                        onChange={() => toggleSubCategory(sub.name)}
                      />
                      <span className="checkbox-label">
                        {sub.name}{' '}
                        <small className="question-count">
                          ({sub.question_count || 0})
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="selection-count">
                {subCategories.length} selected
              </div>
            </div>
          )}

          {mainCategory && (
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">
                Specific Topics{' '}
                <small className="hint">(Optional - Max 10)</small>
              </label>
              <div className="tag-input">
                <input
                  type="text"
                  ref={topicInputRef}
                  placeholder="Search and add topics..."
                  autoComplete="off"
                  value={topicSearchQuery}
                  onChange={handleTopicSearch}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const value = e.target.value.trim()
                      if (value) addTopic(value)
                    }
                  }}
                />
                <div className="tag-list">
                  {topics.map((t) => (
                    <span key={t} className="tag">
                      {t}
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => removeTopic(t)}
                        aria-label={`Remove topic ${t}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {showSuggestions && topicSuggestions.length > 0 && (
                <div className="suggestions" ref={suggestionsRef}>
                  {topicSuggestions.map((t, i) => (
                    <div
                      key={i}
                      className="suggestion-item"
                      onClick={() => addTopic(t)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTopic(t) }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              )}
              <p className="field-hint">
                Type to search topics, press Enter to add
              </p>
            </div>
          )}

          {mainCategory && (
            <div className="availability-status">
              {availableCount < questionCount && availableCount > 0 && (
                <div className="availability-warning">
                  <span className="warning-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </span>
                  <div className="warning-content">
                    <strong>Limited Questions Available</strong>
                    <p>
                      Only <strong>{availableCount}</strong> questions available
                      for your selection, but you requested{' '}
                      <strong>{questionCount}</strong>. Quiz will start with{' '}
                      {Math.min(availableCount, questionCount)} questions.
                    </p>
                  </div>
                </div>
              )}
              {availableCount >= questionCount && availableCount > 0 && (
                <div className="available-questions">
                  <span className="available-count">{availableCount}</span>
                  <span className="available-label">questions available</span>
                </div>
              )}
              {availableCount === 0 && !isCheckingAvailability && (
                <div className="availability-warning">
                  <span className="warning-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </span>
                  <div className="warning-content">
                    <strong>No Questions Available</strong>
                    <p>No questions found for selected categories.</p>
                  </div>
                </div>
              )}
              {isCheckingAvailability && (
                <div className="subcategory-loading">
                  <span
                    className="loading-spinner"
                    aria-hidden="true"
                  ></span>
                  <span>Checking question availability...</span>
                </div>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="form-section" id="section2">
          <legend className="section-header">
            <span className="section-num">2</span>
            <h2>Configure Quiz</h2>
          </legend>

          <div className="config-grid">
            <div className="config-item">
              <label className="config-label">Number of Questions</label>
              <select
                className="form-select"
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(parseInt(e.target.value) || 50)
                }
              >
                <option value="10">10 questions</option>
                <option value="25">25 questions</option>
                <option value="50">50 questions</option>
                <option value="75">75 questions</option>
                <option value="100">100 questions</option>
                <option value="150">150 questions</option>
                <option value="200">200 questions</option>
              </select>
              <p className="field-hint">
                Recommended: 50 for CSS/PMS, 100 for comprehensive practice
              </p>
            </div>

            <div className="config-item">
              <label className="config-label">Time Limit</label>
              <select
                className="form-select"
                value={timeLimit}
                onChange={(e) =>
                  setTimeLimit(parseInt(e.target.value) || 45)
                }
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
                <option value="0">No limit</option>
              </select>
              <div
                className={`time-estimate ${getTimeEstimateClass()}`}
              >
                <span className="estimate-icon" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <span>
                  {timeLimit === 0
                    ? 'No time limit'
                    : `~ ${getTimePerQuestion()} per question`}
                </span>
              </div>
            </div>

            <div className="config-item">
              <label className="config-label">Difficulty Distribution</label>
              <select
                className="form-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="balanced">Balanced (33/33/34)</option>
                <option value="easy_focus">Easy Focus (50/30/20)</option>
                <option value="medium_focus">Medium Focus (25/50/25)</option>
                <option value="hard_focus">Hard Focus (20/30/50)</option>
                <option value="exam_standard">Exam Standard (25/50/25)</option>
              </select>
              <p className="field-hint">
                Balanced distribution recommended for most students
              </p>
            </div>
          </div>

          <div className="form-group">
            <span className="group-label">
              Quiz Mode{' '}
              <span className="recommended-badge">Exam Default</span>
            </span>
            <div className="quiz-type-grid">
              {QUIZ_MODES.map((mode) => (
                <div
                  key={mode.type}
                  className={`type-card ${
                    quizType === mode.type ? 'active' : ''
                  } ${mode.isExam ? 'exam-mode' : ''}`}
                  onClick={() => setQuizType(mode.type)}
                  role="radio"
                  aria-checked={quizType === mode.type}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setQuizType(mode.type)
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="quizType"
                    value={mode.type}
                    checked={quizType === mode.type}
                    onChange={() => setQuizType(mode.type)}
                    className="sr-only"
                  />
                  <span className="type-icon" aria-hidden="true">
                    {mode.type === 'practice' ? (
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    ) : mode.type === 'exam' ? (
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ) : (
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                  </span>
                  <span className="type-title">{mode.title}</span>
                  <span className="type-desc">{mode.desc}</span>
                  <div className="type-features">
                    {mode.features.map((f, i) => (
                      <span
                        key={i}
                        className={`feature-tag ${
                          mode.isExam &&
                          (f === 'Real Exam Feel' || f === 'No Hints')
                            ? 'highlight'
                            : ''
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  {mode.isDefault && (
                    <span className="default-indicator">Default</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={`form-group ${isExamMode ? '' : 'hidden'}`}>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={negativeMarking}
                onChange={(e) => setNegativeMarking(e.target.checked)}
              />
              <span className="toggle-switch" aria-hidden="true"></span>
              <span className="toggle-text">
                Enable Negative Marking
                <span className="toggle-hint">(-0.25 per wrong answer)</span>
              </span>
            </label>
          </div>

          <div className="form-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={randomOrder}
                onChange={(e) => setRandomOrder(e.target.checked)}
              />
              <span className="toggle-switch" aria-hidden="true"></span>
              <span className="toggle-text">
                Randomize Question Order
                <span className="toggle-hint">(Recommended for practice)</span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section" id="section3">
          <legend className="section-header">
            <span className="section-num">3</span>
            <h2>Review & Start</h2>
          </legend>

          <div className="summary-card">
            <div className="summary-header">
              <span className="summary-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
              <span>Quiz Configuration</span>
            </div>
            <div className="summary-grid">
              <div className="summary-row">
                <span className="summary-label">Category:</span>
                <span className="summary-value">
                  {selectedCategory?.name || 'Not selected'}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Sub-categories:</span>
                <span className="summary-value">
                  {subCategories.length} selected
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Questions:</span>
                <span className="summary-value">{questionCount}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Time Limit:</span>
                <span className="summary-value">
                  {timeLimit === 0
                    ? 'No limit'
                    : `${timeLimit} minutes`}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Difficulty:</span>
                <span className="summary-value">
                  {currentDiff.label}
                  <span className="diff-pill easy">
                    {currentDiff.easy}%
                  </span>
                  <span className="diff-pill medium">
                    {currentDiff.medium}%
                  </span>
                  <span className="diff-pill hard">
                    {currentDiff.hard}%
                  </span>
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Mode:</span>
                <span
                  className={`summary-value ${
                    quizType === 'exam' ? 'mode-exam' : ''
                  }`}
                >
                  {quizType === 'practice'
                    ? 'Practice Mode'
                    : quizType === 'exam'
                    ? 'Exam Mode'
                    : 'Exam + Review'}
                </span>
              </div>
              {negativeMarking && (
                <div className="summary-row">
                  <span className="summary-label">Scoring:</span>
                  <span className="summary-value negative">
                    -0.25 per wrong answer
                  </span>
                </div>
              )}
              <div className="summary-row">
                <span className="summary-label">Est. Time/Q:</span>
                <span className="summary-value">
                  {getTimePerQuestion()}
                </span>
              </div>
            </div>
          </div>

          <div className="start-action">
            <button
              type="button"
              className="btn btn-primary btn-large btn-start"
              disabled={!startBtnState.enabled || isGenerating}
              onClick={startQuiz}
            >
              {isGenerating ? (
                <span className="btn-loader" aria-label="Generating quiz">
                  <span className="loader-dot"></span>
                  <span className="loader-dot"></span>
                  <span className="loader-dot"></span>
                </span>
              ) : (
                <>
                  <span>Generate Quiz</span>
                  <span className="btn-icon" aria-hidden="true">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </>
              )}
            </button>
            <p className={`start-hint ${startBtnState.reason}`}>
              {startBtnState.text}
            </p>
          </div>
        </fieldset>
      </section>
    </div>
  )
}