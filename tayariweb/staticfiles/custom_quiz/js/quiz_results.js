/**
 * TAYARIWEB QUIZ RESULTS MODULE
 * Handles: Score display, stats animation, performance breakdown,
 *          answer review filtering, sharing, and restart
 */

'use strict';

const QuizResults = (function() {
    // ==================== CONFIGURATION ====================
    const CONFIG = Object.freeze({
        SCORE_ANIMATION_DURATION: 1500,
        CIRCUMFERENCE: 2 * Math.PI * 45
    });

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
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        },

        animateNumber: (element, start, end, duration, suffix = '') => {
            if (!element) return;
            const range = end - start;
            const startTime = performance.now();

            const update = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 4);
                element.textContent = Math.round(start + (range * easeProgress)) + suffix;

                if (progress < 1) requestAnimationFrame(update);
            };

            requestAnimationFrame(update);
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

    // ==================== DISPLAY RESULTS ====================
    function display(results) {
        if (!results || typeof results !== 'object') {
            console.error('QuizResults.display: Invalid results data');
            return;
        }

        animateScore(results.finalPercentage);
        displayBadge(results.passed, results.finalPercentage);
        displayMessage(results.finalPercentage);
        displayStats(results);
        displayPerformanceBreakdown(results);
        displayReviewList(results.questions);

        // Focus management for accessibility
        const resultsSection = DOM.get('resultsSection');
        if (resultsSection) {
            resultsSection.focus();
        }

        Utils.announce(`Quiz complete. You scored ${results.finalPercentage} percent. ${results.passed ? 'Pass' : 'Fail'}`, 'assertive');
    }

    function animateScore(percentage) {
        setTimeout(() => {
            const percentEl = DOM.get('scorePercent');
            const ringProgress = DOM.get('scoreRingProgress');

            if (percentEl) {
                Utils.animateNumber(percentEl, 0, percentage, CONFIG.SCORE_ANIMATION_DURATION, '%');
            }

            if (ringProgress) {
                const offset = CONFIG.CIRCUMFERENCE - (percentage / 100) * CONFIG.CIRCUMFERENCE;
                ringProgress.style.strokeDashoffset = offset;
            }
        }, 100);
    }

    function displayBadge(passed, percentage) {
        const badge = DOM.get('resultBadge');
        if (!badge) return;

        badge.textContent = passed ? 'Pass' : 'Fail';
        badge.className = `result-badge ${passed ? 'pass' : 'fail'}`;
        badge.setAttribute('aria-label', `Result: ${passed ? 'Pass' : 'Fail'} with ${percentage}%`);
    }

    function displayMessage(percentage) {
        const messageEl = DOM.get('resultMessage');
        if (!messageEl) return;

        const messages = {
            excellent: 'Excellent work! Outstanding performance!',
            good: 'Great job! You performed well.',
            average: 'Good effort! Keep practicing to improve.',
            needsWork: 'Keep practicing! You will do better next time.'
        };

        let msg = messages.needsWork;
        if (percentage >= 80) msg = messages.excellent;
        else if (percentage >= 70) msg = messages.good;
        else if (percentage >= 60) msg = messages.average;

        messageEl.textContent = msg;
    }

    function displayStats(results) {
        const statCorrect = DOM.get('statCorrect');
        const statWrong = DOM.get('statWrong');
        const statSkipped = DOM.get('statSkipped');
        const statTime = DOM.get('statTime');

        if (statCorrect) statCorrect.textContent = results.correct;
        if (statWrong) statWrong.textContent = results.wrong;
        if (statSkipped) statSkipped.textContent = results.skipped;

        if (statTime) {
            if (results.timeLimit > 0) {
                statTime.textContent = Utils.formatTime(results.timeUsed);
            } else {
                statTime.textContent = 'N/A';
            }
        }

        // Update filter counts
        const countAll = DOM.get('countAll');
        const countCorrect = DOM.get('countCorrect');
        const countWrong = DOM.get('countWrong');
        const countSkipped = DOM.get('countSkipped');

        if (countAll) countAll.textContent = results.total;
        if (countCorrect) countCorrect.textContent = results.correct;
        if (countWrong) countWrong.textContent = results.wrong;
        if (countSkipped) countSkipped.textContent = results.skipped;
    }

    function displayPerformanceBreakdown(results) {
        const container = DOM.get('breakdownGrid');
        if (!container) return;

        const accuracy = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
        const attempted = results.total - results.skipped;
        const completion = results.total > 0 ? Math.round((attempted / results.total) * 100) : 0;

        container.innerHTML = `
            <div class="breakdown-item">
                <span class="breakdown-value">${accuracy}%</span>
                <span class="breakdown-label">Accuracy</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-value">${completion}%</span>
                <span class="breakdown-label">Completion</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-value">${attempted}</span>
                <span class="breakdown-label">Attempted</span>
            </div>
            <div class="breakdown-item">
                <span class="breakdown-value">${results.timeLimit > 0 ? Utils.formatTime(results.timeUsed) : 'N/A'}</span>
                <span class="breakdown-label">Time Taken</span>
            </div>
        `;
    }

    // ==================== REVIEW LIST ====================
    function displayReviewList(questions) {
        const container = DOM.get('reviewList');
        if (!container) {
            console.error('Review list container not found');
            return;
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No questions to review.</p>';
            return;
        }

        const statusLabels = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped' };

        container.innerHTML = questions.map((q, idx) => {
            const status = q.status || 'skipped';
            const yourAnswer = q.userAnswer !== undefined && q.userAnswer !== null 
                ? q.options[q.userAnswer] 
                : 'Not answered';
            const correctAnswer = q.options[q.correct] || 'Unknown';

            return `
                <div class="review-item ${status}" data-status="${status}" data-index="${idx}">
                    <div class="review-head">
                        <span class="review-question-num">Q${idx + 1}</span>
                        <span class="review-badge ${status}">${statusLabels[status] || status}</span>
                    </div>
                    <div class="review-body">
                        <p class="review-question">${Utils.escapeHtml(q.text || 'Question text unavailable')}</p>
                        <p class="review-answer your-answer"><strong>Your Answer:</strong> ${Utils.escapeHtml(yourAnswer)}</p>
                        <p class="review-answer correct-answer"><strong>Correct Answer:</strong> ${Utils.escapeHtml(correctAnswer)}</p>
                        ${q.explanation ? `<div class="review-explanation"><strong>Explanation:</strong> ${Utils.escapeHtml(q.explanation)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Apply current filter (default 'all')
        filterReview('all');
    }

    function filterReview(type) {
        if (!type || typeof type !== 'string') {
            console.warn('filterReview: Invalid filter type');
            return;
        }

        // Update button states
        DOM.queryAll('.filter-btn').forEach(btn => {
            const isActive = btn.dataset.filter === type;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive.toString());
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        // Filter items
        const items = DOM.queryAll('.review-item');
        let visibleCount = 0;

        items.forEach(item => {
            const show = type === 'all' || item.dataset.status === type;
            item.style.display = show ? 'block' : 'none';
            if (show) visibleCount++;
        });

        Utils.announce(`Showing ${type} questions. ${visibleCount} items.`, 'polite');
    }

    // ==================== ACTIONS ====================
    function restartQuiz() {
        // Clear any stored quiz state
        try {
            sessionStorage.removeItem('tayari_quiz_active');
        } catch (e) {
            console.warn('Failed to clear quiz state:', e);
        }

        // Reload page to restart with same config
        window.location.reload();
    }

    function newQuiz() {
        // Clear all quiz-related storage
        try {
            sessionStorage.removeItem('tayari_quiz_active');
            sessionStorage.removeItem('tayari_quiz_config');
        } catch (e) {
            console.warn('Failed to clear quiz storage:', e);
        }

        window.location.reload();
    }

    async function shareResults() {
        const percentEl = DOM.get('scorePercent');
        const percent = percentEl ? percentEl.textContent : '0%';
        const text = `I scored ${percent} on TayariWeb Custom Quiz! Test your knowledge at`;
        const url = window.location.href;

        try {
            if (navigator.share) {
                await navigator.share({ 
                    title: 'My Quiz Results - TayariWeb', 
                    text, 
                    url 
                });
                showToast('Shared successfully!', 'success');
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(`${text} ${url}`);
                showToast('Results copied to clipboard!', 'success');
            } else {
                const copied = prompt('Copy this text:', `${text} ${url}`);
                if (copied !== null) {
                    showToast('Text selected. Copy manually.', 'info');
                }
            }
        } catch (err) {
            console.error('Share failed:', err);
            // User cancelled or share failed silently — no need for error toast
        }
    }

    function showToast(message, type = 'info') {
        // Remove existing toast
        const existing = document.getElementById('quiz-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'quiz-toast';
        toast.className = `quiz-toast show ${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        document.body.appendChild(toast);

        // Auto-remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==================== EVENT LISTENERS ====================
    function attachListeners() {
        // Results action buttons
        const restartBtn = DOM.get('restartQuizBtn');
        const newBtn = DOM.get('newQuizBtn');
        const shareBtn = DOM.get('shareResultsBtn');

        if (restartBtn) restartBtn.addEventListener('click', restartQuiz);
        if (newBtn) newBtn.addEventListener('click', newQuiz);
        if (shareBtn) shareBtn.addEventListener('click', shareResults);

        // Review filters — use event delegation on parent
        const reviewFilters = DOM.query('.review-filters');
        if (reviewFilters) {
            reviewFilters.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-btn');
                if (btn) {
                    e.preventDefault();
                    filterReview(btn.dataset.filter);
                }
            });
        }
    }

    // ==================== PUBLIC API ====================
    function init() {
        attachListeners();
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose to global
    window.QuizResults = Object.freeze({
        init,
        display,
        filterReview
    });

    return window.QuizResults;
})();