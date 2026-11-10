/**
 * TAYARIWEB QUIZ RUNNER MODULE
 * Handles: Timer, question navigation, option selection, progress tracking,
 *          auto-submit warning, and quiz completion
 * Dependencies: quiz_config.js (must be loaded before), quiz_results.js (loaded after)
 */

'use strict';

const QuizRunner = (function() {
    // ==================== CONFIGURATION ====================
    const CONFIG = Object.freeze({
        AUTO_SUBMIT_WARNING: 60,
        TIMER_WARNING: 180,
        AD_INTERVALS: [10, 20, 30],
        PASSING_PERCENTAGE: 60,
        NEGATIVE_PENALTY: 0.25,
        CIRCUMFERENCE: 2 * Math.PI * 45,
        SAVE_INTERVAL: 10000
    });

    // ==================== STATE ====================
    let questions = [];
    let currentIndex = 0;
    let answers = new Map();
    let timeRemaining = 0;
    let timerInterval = null;
    let warningShown = false;
    let startTime = null;
    let isSubmitting = false;
    let quizConfig = {};
    let listenersAttached = false;

    // ==================== DOM REFERENCES ====================
    const DOM = {
        get: (id) => document.getElementById(id),
        query: (sel, ctx = document) => ctx.querySelector(sel),
        queryAll: (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel))
    };

    // ==================== UTILITIES ====================
    const Utils = {
        escapeHtml: (text) => {
            if (!text || typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        formatTime: (seconds) => {
            if (seconds < 0) seconds = 0;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        },

        saveState: () => {
            try {
                sessionStorage.setItem('tayari_quiz_active', JSON.stringify({
                    questions: questions,
                    answers: Array.from(answers.entries()),
                    currentIndex,
                    timeRemaining,
                    startTime,
                    config: quizConfig,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('State save failed:', e);
            }
        },

        clearState: () => {
            try {
                sessionStorage.removeItem('tayari_quiz_active');
            } catch (e) {
                console.warn('State clear failed:', e);
            }
        },

        announce: (message, priority = 'polite') => {
            let announcer = document.getElementById('sr-announcer');
            if (!announcer) {
                announcer = document.createElement('div');
                announcer.id = 'sr-announcer';
                announcer.className = 'sr-only';
                announcer.setAttribute('aria-live', priority);
                announcer.setAttribute('aria-atomic', 'true');
                document.body.appendChild(announcer);
            }
            announcer.setAttribute('aria-live', priority);
            announcer.textContent = message;
            setTimeout(() => announcer.textContent = '', 1000);
        }
    };

    // ==================== TIMER ====================
    function startTimer() {
        // Clear any existing timer first
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        updateTimerDisplay();

        timerInterval = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();

            if (timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING && !warningShown) {
                warningShown = true;
                showAutoSubmitWarning();
            }

            if (timeRemaining <= 0) {
                finishQuiz();
                return;
            }

            if (timeRemaining % 10 === 0) Utils.saveState();
        }, 1000);
    }

    function updateTimerDisplay() {
        const display = Utils.formatTime(timeRemaining);
        const timerEl = DOM.get('timerDisplay');
        const timerContainer = DOM.get('quizTimer');

        if (timerEl) timerEl.textContent = display;

        if (timerContainer) {
            timerContainer.classList.remove('warning', 'danger');
            if (timeRemaining <= 0) {
                // No class — quiz ending
            } else if (timeRemaining <= CONFIG.AUTO_SUBMIT_WARNING) {
                timerContainer.classList.add('danger');
            } else if (timeRemaining <= CONFIG.TIMER_WARNING) {
                timerContainer.classList.add('warning');
            }
        }
    }

    function showAutoSubmitWarning() {
        const warning = DOM.get('autoSubmitWarning');
        if (!warning) return;

        warning.classList.remove('hidden');
        warning.style.display = 'flex';

        let seconds = CONFIG.AUTO_SUBMIT_WARNING;
        const span = DOM.get('countdownWarning');
        if (span) span.textContent = seconds;

        const countdown = setInterval(() => {
            seconds--;
            if (span) span.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(countdown);
                warning.classList.add('hidden');
                warning.style.display = 'none';
            }
        }, 1000);

        Utils.announce('Warning: 60 seconds remaining. Quiz will auto-submit.', 'assertive');
    }

    // ==================== QUESTION RENDERING ====================
    function renderQuestion() {
        const q = questions[currentIndex];
        if (!q) {
            console.error('No question at index', currentIndex);
            return;
        }

        const isLast = currentIndex === questions.length - 1;

        // Update header info
        const progressEl = DOM.get('quizProgress');
        if (progressEl) {
            progressEl.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
        }

        const titleEl = DOM.get('activeQuizTitle');
        if (titleEl) {
            titleEl.textContent = `${quizConfig.mainCategory?.toUpperCase() || 'Custom'} Quiz`;
        }

        // Render question text
        const questionText = DOM.get('questionText');
        if (questionText) {
            questionText.textContent = q.text || 'Question text unavailable';
        }

        // Render options
        const optionsList = DOM.get('optionsList');
        if (optionsList) {
            const hasAnswer = answers.has(q.id);
            const selectedIndex = answers.get(q.id);

            optionsList.innerHTML = (q.options || []).map((opt, idx) => `
                <label class="option ${hasAnswer && selectedIndex === idx ? 'selected' : ''}" 
                       id="opt-${idx}" 
                       data-index="${idx}" 
                       tabindex="${hasAnswer ? '-1' : '0'}" 
                       role="radio" 
                       aria-checked="${selectedIndex === idx}">
                    <input type="radio" name="answer" value="${idx}" ${selectedIndex === idx ? 'checked' : ''} tabindex="-1">
                    <span class="option-text">${Utils.escapeHtml(opt)}</span>
                </label>
            `).join('');

            // Attach option listeners
            optionsList.querySelectorAll('.option').forEach(opt => {
                opt.addEventListener('click', () => {
                    if (!opt.classList.contains('disabled')) {
                        selectOption(parseInt(opt.dataset.index));
                    }
                });
                opt.addEventListener('keydown', (e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        if (!opt.classList.contains('disabled')) {
                            selectOption(parseInt(opt.dataset.index));
                        }
                    }
                });
            });
        }

        // Clear explanation
        const explanationContainer = DOM.get('explanationContainer');
        if (explanationContainer) explanationContainer.innerHTML = '';

        updateNavigationButtons(isLast);
        updateProgressBar();

        // Handle mid-quiz ad
        const midQuizAd = DOM.get('midQuizAdSection');
        if (midQuizAd) {
            const showAd = CONFIG.AD_INTERVALS.includes(currentIndex + 1);
            midQuizAd.classList.toggle('hidden', !showAd);
            midQuizAd.style.display = showAd ? 'block' : 'none';
        }

        Utils.announce(`Question ${currentIndex + 1} of ${questions.length}`, 'polite');
    }

    function updateNavigationButtons(isLast) {
        const prevBtn = DOM.get('prevBtn');
        const checkBtn = DOM.get('checkBtn');
        const nextBtn = DOM.get('nextBtn');
        const finishBtn = DOM.get('finishBtn');

        if (prevBtn) prevBtn.disabled = currentIndex === 0;

        // Hide all action buttons first
        [checkBtn, nextBtn, finishBtn].forEach(btn => {
            if (btn) {
                btn.classList.add('hidden');
                btn.style.display = 'none';
                btn.disabled = false;
            }
        });

        const q = questions[currentIndex];
        if (!q) return;

        const hasAnswer = answers.has(q.id);

        // Show appropriate buttons based on quiz type
        if (quizConfig.quizType === 'exam') {
            if (isLast) {
                if (finishBtn) {
                    finishBtn.classList.remove('hidden');
                    finishBtn.style.display = 'inline-flex';
                    finishBtn.disabled = !hasAnswer;
                }
            } else {
                if (nextBtn) {
                    nextBtn.classList.remove('hidden');
                    nextBtn.style.display = 'inline-flex';
                    nextBtn.disabled = !hasAnswer;
                }
            }
        } else if (quizConfig.quizType === 'exam_review') {
            if (checkBtn) {
                checkBtn.classList.remove('hidden');
                checkBtn.style.display = 'inline-flex';
                checkBtn.textContent = 'Check Answer (Optional)';
            }
            if (isLast) {
                if (finishBtn) {
                    finishBtn.classList.remove('hidden');
                    finishBtn.style.display = 'inline-flex';
                }
            } else {
                if (nextBtn) {
                    nextBtn.classList.remove('hidden');
                    nextBtn.style.display = 'inline-flex';
                    nextBtn.disabled = !hasAnswer;
                }
            }
        } else {
            // Practice mode
            if (checkBtn) {
                checkBtn.classList.remove('hidden');
                checkBtn.style.display = 'inline-flex';
                checkBtn.textContent = 'Check Answer';
            }
            if (isLast) {
                if (finishBtn) {
                    finishBtn.classList.remove('hidden');
                    finishBtn.style.display = 'inline-flex';
                }
            } else {
                if (nextBtn) {
                    nextBtn.classList.remove('hidden');
                    nextBtn.style.display = 'inline-flex';
                    nextBtn.disabled = !hasAnswer;
                }
            }
        }
    }

    function updateProgressBar() {
        const fill = DOM.get('progressFill');
        const text = DOM.get('progressText');
        const total = questions.length || 1;
        const percent = Math.round(((currentIndex + 1) / total) * 100);

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `${percent}% Complete`;

        // Update aria-valuenow for accessibility
        const progressBar = DOM.get('quizProgressBar') || DOM.query('.quiz-progress-bar');
        if (progressBar) {
            progressBar.setAttribute('aria-valuenow', percent);
        }
    }

    // ==================== OPTION SELECTION ====================
    function selectOption(index) {
        const q = questions[currentIndex];
        if (!q) return;

        // Prevent re-selection if already answered in practice mode with explanation shown
        const explanationContainer = DOM.get('explanationContainer');
        if (explanationContainer && explanationContainer.innerHTML.trim() !== '') {
            return;
        }

        answers.set(q.id, index);

        // Update visual state — scope to optionsList only
        const optionsList = DOM.get('optionsList');
        if (optionsList) {
            optionsList.querySelectorAll('.option').forEach((opt, idx) => {
                const isSelected = idx === index;
                opt.classList.toggle('selected', isSelected);
                opt.setAttribute('aria-checked', isSelected.toString());
                const radio = opt.querySelector('input[type="radio"]');
                if (radio) radio.checked = isSelected;
            });
        }

        const isLast = currentIndex === questions.length - 1;

        if (quizConfig.quizType === 'exam') {
            const btn = isLast ? DOM.get('finishBtn') : DOM.get('nextBtn');
            if (btn) btn.disabled = false;
        } else if (quizConfig.quizType === 'exam_review') {
            if (!isLast) {
                const nextBtn = DOM.get('nextBtn');
                if (nextBtn) nextBtn.disabled = false;
            }
        }

        Utils.saveState();
    }

    // ==================== CHECK ANSWER ====================
    function checkAnswer() {
        const q = questions[currentIndex];
        if (!q) return;

        if (!answers.has(q.id)) {
            // Show validation using config module if available, else fallback
            if (window.QuizConfig && typeof window.QuizConfig.showValidation === 'function') {
                window.QuizConfig.showValidation('Please select an answer', 'warning');
            } else {
                // Fallback: use browser alert or custom toast
                alert('Please select an answer');
            }
            return;
        }

        const userAnswer = answers.get(q.id);
        const isCorrect = userAnswer === q.correct;

        // Disable all options and show correct/wrong — scope to optionsList
        const optionsList = DOM.get('optionsList');
        if (optionsList) {
            optionsList.querySelectorAll('.option').forEach((opt, idx) => {
                opt.classList.add('disabled');
                opt.removeAttribute('tabindex');
                if (idx === q.correct) opt.classList.add('correct');
                else if (idx === userAnswer && !isCorrect) opt.classList.add('wrong');
            });
        }

        // Show explanation if available
        if (q.explanation && (quizConfig.quizType === 'practice' || quizConfig.quizType === 'exam_review')) {
            const container = DOM.get('explanationContainer');
            if (container) {
                container.innerHTML = `
                    <div class="explanation-box ${isCorrect ? 'correct' : 'wrong'}">
                        <div class="explanation-header">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                ${isCorrect 
                                    ? '<path d="M4 8l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
                                    : '<path d="M5 5l6 6M11 5L5 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
                                }
                            </svg>
                            <span class="explanation-title">${isCorrect ? 'Correct!' : 'Incorrect'}</span>
                        </div>
                        <div class="explanation-content">
                            <strong>Explanation:</strong> ${Utils.escapeHtml(q.explanation)}
                        </div>
                    </div>
                `;
            }
        }

        // Hide check button
        const checkBtn = DOM.get('checkBtn');
        if (checkBtn) {
            checkBtn.classList.add('hidden');
            checkBtn.style.display = 'none';
        }

        const isLast = currentIndex === questions.length - 1;

        if (isLast) {
            const finishBtn = DOM.get('finishBtn');
            if (finishBtn) {
                finishBtn.classList.remove('hidden');
                finishBtn.style.display = 'inline-flex';
            }
        } else {
            const nextBtn = DOM.get('nextBtn');
            if (nextBtn) {
                nextBtn.classList.remove('hidden');
                nextBtn.style.display = 'inline-flex';
                nextBtn.disabled = false;
                nextBtn.focus();
            }
        }

        Utils.announce(
            isCorrect 
                ? `Correct! ${q.explanation || ''}` 
                : `Incorrect. The correct answer is: ${q.options[q.correct] || ''}`,
            'polite'
        );
    }

    // ==================== NAVIGATION ====================
    function prevQuestion() {
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
        }
    }

    function nextQuestion() {
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion();
        }
    }

    function confirmFinish() {
        const unanswered = questions.length - answers.size;
        if (unanswered > 0) {
            const confirmed = confirm(
                `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to finish?`
            );
            if (!confirmed) return;
        }
        finishQuiz();
    }

    // ==================== QUIZ COMPLETION ====================
    function finishQuiz() {
        // Prevent double submission
        if (isSubmitting) return;
        isSubmitting = true;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        const endTime = Date.now();

        // Hide quiz interface, show results
        const quizInterface = DOM.get('quizInterface');
        const resultsSection = DOM.get('resultsSection');

        if (quizInterface) {
            quizInterface.classList.add('hidden');
            quizInterface.style.display = 'none';
        }
        if (resultsSection) {
            resultsSection.classList.remove('hidden');
            resultsSection.style.display = 'block';
        }

        // Calculate and pass to results module
        const results = calculateResults(endTime);
        
        if (window.QuizResults && typeof window.QuizResults.display === 'function') {
            window.QuizResults.display(results);
        } else {
            console.error('QuizResults module not available');
            // Fallback: show basic alert
            alert(`Quiz complete! Score: ${results.finalPercentage}%`);
        }

        Utils.clearState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function calculateResults(endTime) {
        let correct = 0, wrong = 0, skipped = 0;

        questions.forEach(q => {
            const answer = answers.get(q.id);
            if (answer === undefined || answer === null) skipped++;
            else if (answer === q.correct) correct++;
            else wrong++;
        });

        const total = questions.length || 1; // Prevent division by zero
        const percentage = Math.round((correct / total) * 100);

        let score = correct;
        if (quizConfig.negativeMarking) {
            score = Math.max(0, correct - (wrong * CONFIG.NEGATIVE_PENALTY));
        }

        const finalPercentage = Math.round((score / total) * 100);
        const passed = finalPercentage >= CONFIG.PASSING_PERCENTAGE;

        return {
            correct,
            wrong,
            skipped,
            total,
            percentage,
            finalPercentage,
            passed,
            score,
            timeUsed: quizConfig.timeLimit > 0 && startTime ? Math.floor((endTime - startTime) / 1000) : 0,
            timeLimit: quizConfig.timeLimit,
            questions: questions.map(q => ({
                ...q,
                userAnswer: answers.get(q.id),
                status: answers.get(q.id) === undefined || answers.get(q.id) === null ? 'skipped' : 
                        answers.get(q.id) === q.correct ? 'correct' : 'wrong'
            }))
        };
    }

    // ==================== KEYBOARD HANDLERS ====================
    function handleKeyboard(e) {
        const quizInterface = DOM.get('quizInterface');
        if (!quizInterface || quizInterface.classList.contains('hidden')) return;

        // Number keys 1-4 for options
        if (e.key >= '1' && e.key <= '4' && !e.ctrlKey && !e.altKey) {
            const index = parseInt(e.key) - 1;
            const optionsList = DOM.get('optionsList');
            if (!optionsList) return;
            const options = optionsList.querySelectorAll('.option:not(.disabled)');
            if (options[index]) {
                e.preventDefault();
                selectOption(index);
            }
        }

        // Arrow keys for navigation
        if (e.key === 'ArrowLeft' && !e.ctrlKey) {
            e.preventDefault();
            const prevBtn = DOM.get('prevBtn');
            if (prevBtn && !prevBtn.disabled) prevQuestion();
        }

        if (e.key === 'ArrowRight' && !e.ctrlKey) {
            e.preventDefault();
            const nextBtn = DOM.get('nextBtn');
            const finishBtn = DOM.get('finishBtn');
            if (nextBtn && !nextBtn.classList.contains('hidden') && !nextBtn.disabled) {
                nextQuestion();
            } else if (finishBtn && !finishBtn.classList.contains('hidden')) {
                confirmFinish();
            }
        }

        // Space/Enter for check answer
        if ((e.key === ' ' || e.key === 'Enter') && !e.ctrlKey) {
            const checkBtn = DOM.get('checkBtn');
            if (checkBtn && !checkBtn.classList.contains('hidden')) {
                e.preventDefault();
                checkAnswer();
            }
        }

        // Escape to finish
        if (e.key === 'Escape') {
            const finishBtn = DOM.get('finishBtn');
            if (finishBtn && !finishBtn.classList.contains('hidden')) {
                confirmFinish();
            }
        }
    }

    // ==================== BEFORE UNLOAD ====================
    function handleBeforeUnload(e) {
        if (timerInterval && timeRemaining > 0) {
            e.preventDefault();
            e.returnValue = 'You have a quiz in progress. Are you sure you want to leave?';
            Utils.saveState();
            return e.returnValue;
        }
    }

    // ==================== CLEANUP ====================
    function cleanup() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        document.removeEventListener('keydown', handleKeyboard);
        window.removeEventListener('beforeunload', handleBeforeUnload);

        const prevBtn = DOM.get('prevBtn');
        const nextBtn = DOM.get('nextBtn');
        const checkBtn = DOM.get('checkBtn');
        const finishBtn = DOM.get('finishBtn');

        // Note: We can't easily remove anonymous listeners, so we use the listenersAttached flag
        // to prevent duplicate attachment. For a full cleanup, we'd need named functions.
    }

    // ==================== EVENT LISTENERS ====================
    function attachListeners() {
        if (listenersAttached) return; // Prevent duplicate attachment
        listenersAttached = true;

        const prevBtn = DOM.get('prevBtn');
        const nextBtn = DOM.get('nextBtn');
        const checkBtn = DOM.get('checkBtn');
        const finishBtn = DOM.get('finishBtn');

        if (prevBtn) prevBtn.addEventListener('click', prevQuestion);
        if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
        if (checkBtn) checkBtn.addEventListener('click', checkAnswer);
        if (finishBtn) finishBtn.addEventListener('click', confirmFinish);

        document.addEventListener('keydown', handleKeyboard);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // ==================== PUBLIC API ====================
    function init(quizQuestions, config) {
        // Validate inputs
        if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) {
            console.error('QuizRunner.init: Invalid or empty questions array');
            if (window.QuizConfig && typeof window.QuizConfig.showValidation === 'function') {
                window.QuizConfig.showValidation('Failed to load quiz questions. Please try again.', 'error');
            }
            return;
        }

        if (!config || typeof config !== 'object') {
            console.error('QuizRunner.init: Invalid config object');
            return;
        }

        // Cleanup any existing state
        cleanup();

        // Reset state
        questions = quizQuestions;
        quizConfig = config;
        currentIndex = 0;
        answers = new Map();
        timeRemaining = (config.timeLimit || 0) * 60;
        warningShown = false;
        startTime = Date.now();
        isSubmitting = false;
        listenersAttached = false;

        renderQuestion();

        if (config.timeLimit > 0) {
            startTimer();
        }

        // Update mode badge
        const modeBadge = DOM.get('quizModeBadge');
        if (modeBadge) {
            const names = { exam: 'Exam Mode', exam_review: 'Exam + Review', practice: 'Practice Mode' };
            modeBadge.textContent = names[config.quizType] || config.quizType;
        }

        attachListeners();
    }

    // Expose to global
    window.QuizRunner = Object.freeze({ 
        init,
        cleanup
    });

    return window.QuizRunner;
})();