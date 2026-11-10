/**
 * TAYARIWEB QUIZ CONFIGURATION MODULE
 * Handles: Category selection, subcategory loading, topic search,
 *          quiz configuration, validation, and quiz start
 * Dependencies: quiz_runner.js (loaded after), quiz_results.js (loaded after)
 */

'use strict';

const QuizConfig = (function() {
    // ==================== CONFIGURATION ====================
    const CONFIG = Object.freeze({
        API_TIMEOUT: 10000,
        DEBOUNCE_DELAY: 300,
        MIN_SEARCH_LENGTH: 2,
        MAX_TOPICS: 10,
        STORAGE_KEY: 'tayari_quiz_config'
    });

    // ==================== STATE ====================
    let state = {
        mainCategory: '',
        subCategories: [],
        topics: [],
        questionCount: 50,
        timeLimit: 45,
        difficulty: 'balanced',
        quizType: 'exam',
        negativeMarking: false,
        randomOrder: true,
        availableCount: 0
    };

    // ==================== DOM REFERENCES ====================
    const DOM = {
        get: (id) => document.getElementById(id),
        query: (sel, ctx = document) => ctx.querySelector(sel),
        queryAll: (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel)),
        toggle: (el, show) => {
            if (!el) return;
            el.classList.toggle('hidden', !show);
            el.setAttribute('aria-hidden', (!show).toString());
        }
    };

    // ==================== UTILITIES ====================
    const Utils = {
        debounce: (fn, delay) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(null, args), delay);
            };
        },

        escapeHtml: (text) => {
            if (!text || typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        getCsrfToken: () => {
            const match = document.cookie.match(/csrftoken=([^;]+)/);
            return match ? decodeURIComponent(match[1]) : '';
        },

        saveConfig: () => {
            try {
                sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
                    config: state,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('Config save failed:', e);
            }
        },

        restoreConfig: () => {
            try {
                const saved = sessionStorage.getItem(CONFIG.STORAGE_KEY);
                if (!saved) return null;
                const parsed = JSON.parse(saved);
                if (Date.now() - parsed.timestamp > 30 * 60 * 1000) {
                    sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                    return null;
                }
                return parsed.config;
            } catch (e) {
                return null;
            }
        },

        clearConfig: () => {
            try {
                sessionStorage.removeItem(CONFIG.STORAGE_KEY);
            } catch (e) {
                console.warn('Config clear failed:', e);
            }
        },

        showValidation: (message, type = 'error', duration = 5000) => {
            const container = DOM.get('globalValidation');
            if (!container) return;

            container.className = `global-validation show ${type}`;
            container.textContent = message;
            container.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

            if (duration > 0) {
                setTimeout(() => {
                    container.classList.remove('show');
                    container.classList.add('hidden');
                }, duration);
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

    // ==================== API ====================
    const API = {
        request: async (url, options = {}) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': Utils.getCsrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                        ...options.headers
                    },
                    signal: controller.signal,
                    credentials: 'same-origin'
                });

                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return { success: true, data: await response.json() };

            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    return { success: false, error: 'Request cancelled', aborted: true };
                }
                return { success: false, error: error.message };
            }
        },

        checkAvailability: (mainCategory, subCategories) =>
            API.request(window.QUIZ_API_URLS?.checkAvailability || '', {
                method: 'POST',
                body: JSON.stringify({ mainCategory, subCategories })
            }),

        searchTopics: (query) =>
            API.request(`${window.QUIZ_API_URLS?.topics || ''}?q=${encodeURIComponent(query)}`, {
                method: 'GET'
            }),

        generateQuiz: (config) =>
            API.request(window.QUIZ_API_URLS?.generate || '', {
                method: 'POST',
                body: JSON.stringify(config)
            })
    };

    // ==================== CATEGORY HANDLING ====================
    function loadSubCategories() {
        const mainCatSelect = DOM.get('mainCategory');
        if (!mainCatSelect) return;

        const slug = mainCatSelect.value;
        state.mainCategory = slug;
        state.subCategories = [];

        const subGroup = DOM.get('subCategoryGroup');
        const subGrid = DOM.get('subCategoryGrid');
        const topicGroup = DOM.get('topicGroup');
        const emptyState = DOM.get('subCategoryEmpty');
        const loading = DOM.get('subCategoryLoading');

        // Reset
        if (subGrid) subGrid.innerHTML = '';
        DOM.toggle(subGroup, false);
        DOM.toggle(topicGroup, false);
        if (emptyState) DOM.toggle(emptyState, false);

        if (!slug) {
            updateSummary();
            setStartButtonState(false, 'default');
            return;
        }

        if (loading) DOM.toggle(loading, true);

        // Validate data
        if (!window.CATEGORY_DATA || !Array.isArray(window.CATEGORY_DATA)) {
            console.error('CATEGORY_DATA not available');
            Utils.showValidation('Error: Category data not loaded', 'error');
            if (loading) DOM.toggle(loading, false);
            return;
        }

        const category = window.CATEGORY_DATA.find(c => c && c.slug === slug);
        if (!category) {
            console.error('Category not found:', slug);
            Utils.showValidation('Error: Category not found', 'error');
            if (loading) DOM.toggle(loading, false);
            return;
        }

        if (loading) DOM.toggle(loading, false);

        const subs = category.subcategories || [];

        if (subs.length === 0) {
            if (emptyState) {
                DOM.toggle(emptyState, true);
                const p = emptyState.querySelector('p');
                if (p) p.innerHTML = `<strong>No subcategories available for ${Utils.escapeHtml(category.name)}</strong>`;
            }
            DOM.toggle(subGroup, true);
            DOM.toggle(topicGroup, true);
            checkAvailability();
            updateSummary();
            return;
        }

        // Render subcategories
        if (subGrid) {
            subGrid.innerHTML = subs.map((sub, idx) => {
                if (!sub || typeof sub !== 'object') return '';
                const name = sub.name || 'Unknown';
                const count = sub.question_count || 0;
                return `
                    <div class="checkbox-item" data-value="${Utils.escapeHtml(name)}" data-count="${count}" id="subcat-${idx}" tabindex="0" role="checkbox" aria-checked="false">
                        <input type="checkbox" value="${Utils.escapeHtml(name)}" id="subcat-input-${idx}" tabindex="-1" aria-labelledby="subcat-label-${idx}">
                        <label for="subcat-input-${idx}" class="checkbox-label" id="subcat-label-${idx}">
                            ${Utils.escapeHtml(name)} <small class="question-count">(${count} questions)</small>
                        </label>
                    </div>
                `;
            }).join('');

            // Event delegation — ONLY trigger on checkbox input, not on label wrapper
            subGrid.addEventListener('change', (e) => {
                const checkbox = e.target.closest('input[type="checkbox"]');
                if (checkbox) {
                    const item = checkbox.closest('.checkbox-item');
                    if (item) {
                        toggleSubCategory(item, checkbox.checked);
                    }
                }
            });

            // Keyboard support for the wrapper div
            subGrid.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    const item = e.target.closest('.checkbox-item');
                    if (item) {
                        e.preventDefault();
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            toggleSubCategory(item, checkbox.checked);
                        }
                    }
                }
            });
        }

        DOM.toggle(subGroup, true);
        DOM.toggle(topicGroup, true);
        if (emptyState) DOM.toggle(emptyState, false);

        if (subGroup) subGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        checkAvailability();
        updateSummary();
    }

    function toggleSubCategory(element, isChecked) {
        if (!element) return;

        const value = element.dataset.value;
        if (!value) {
            console.error('No data-value on checkbox item');
            return;
        }

        // Update visual state
        element.classList.toggle('selected', isChecked);
        element.setAttribute('aria-checked', isChecked.toString());

        // Update state array
        if (isChecked) {
            if (!state.subCategories.includes(value)) {
                state.subCategories.push(value);
            }
        } else {
            state.subCategories = state.subCategories.filter(s => s !== value);
        }

        // Update count display
        const countEl = DOM.get('subCategoryCount');
        if (countEl) {
            const count = state.subCategories.length;
            countEl.textContent = `${count} selected`;
            countEl.classList.toggle('has-selection', count > 0);
        }

        checkAvailability();
        updateSummary();
    }

    // ==================== TOPIC HANDLING ====================
    const handleTopicSearch = Utils.debounce(async (e) => {
        const value = e.target.value.toLowerCase().trim();
        const suggestions = DOM.get('topicSuggestions');

        if (value.length < CONFIG.MIN_SEARCH_LENGTH) {
            DOM.toggle(suggestions, false);
            return;
        }

        const result = await API.searchTopics(value);
        if (!result.success || !result.data?.topics?.length) {
            DOM.toggle(suggestions, false);
            return;
        }

        if (suggestions) {
            suggestions.innerHTML = result.data.topics.map(t => `
                <div class="suggestion-item" data-topic="${Utils.escapeHtml(t)}" tabindex="0" role="option">${Utils.escapeHtml(t)}</div>
            `).join('');

            DOM.toggle(suggestions, true);

            suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => addTopic(item.dataset.topic));
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') addTopic(item.dataset.topic);
                });
            });
        }
    }, CONFIG.DEBOUNCE_DELAY);

    function addTopic(topic) {
        if (!topic || state.topics.includes(topic)) return;

        if (state.topics.length >= CONFIG.MAX_TOPICS) {
            Utils.showValidation(`Maximum ${CONFIG.MAX_TOPICS} topics allowed`, 'warning');
            return;
        }

        state.topics.push(topic);
        renderTopics();

        const input = DOM.get('topicSearch');
        if (input) {
            input.value = '';
            input.focus();
        }

        DOM.toggle(DOM.get('topicSuggestions'), false);
        updateSummary();
    }

    function removeTopic(topic) {
        state.topics = state.topics.filter(t => t !== topic);
        renderTopics();
        updateSummary();
    }

    function renderTopics() {
        const container = DOM.get('topicTags');
        if (!container) return;

        container.innerHTML = state.topics.map(t => `
            <span class="tag" data-topic="${Utils.escapeHtml(t)}">
                ${Utils.escapeHtml(t)}
                <button type="button" class="tag-remove" aria-label="Remove ${Utils.escapeHtml(t)}" data-topic="${Utils.escapeHtml(t)}">×</button>
            </span>
        `).join('');

        container.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', () => removeTopic(btn.dataset.topic));
        });
    }

    // ==================== AVAILABILITY ====================
    async function checkAvailability() {
        if (!state.mainCategory) return;

        const result = await API.checkAvailability(state.mainCategory, state.subCategories);
        if (result.aborted) return;

        if (result.success) {
            state.availableCount = result.data.available_count || 0;
            updateAvailabilityUI();
        } else {
            state.availableCount = 0;
            updateAvailabilityUI(true);
        }
    }

    function updateAvailabilityUI(isError = false) {
        const countEl = DOM.get('availableCount');
        const container = DOM.get('availableQuestions');
        const warningEl = DOM.get('availabilityWarning');
        const messageEl = DOM.get('availabilityMessage');

        const available = state.availableCount;
        const requested = state.questionCount;
        const isSufficient = available >= requested && available > 0;

        if (countEl) countEl.textContent = isError ? '?' : available;
        DOM.toggle(container, true);

        if (isError) {
            DOM.toggle(warningEl, true);
            if (messageEl) messageEl.textContent = 'Unable to check availability. Please try again.';
            setStartButtonState(false, 'error');
        } else if (!isSufficient && available > 0) {
            DOM.toggle(warningEl, true);
            if (messageEl) {
                messageEl.innerHTML = `
                    Only <strong>${available}</strong> questions available for your selection, but you requested <strong>${requested}</strong>.<<br>
                    <strong>Quiz will start with ${Math.min(available, requested)} questions.</strong>
                `;
            }
            setStartButtonState(true, 'limited', available);
        } else if (available === 0) {
            DOM.toggle(warningEl, true);
            if (messageEl) messageEl.textContent = 'No questions available for selected categories.';
            setStartButtonState(false, 'insufficient');
        } else {
            DOM.toggle(warningEl, false);
            setStartButtonState(true);
        }
    }

    function setStartButtonState(enabled, reason = '', availableCount = null) {
        const startBtn = DOM.get('startQuizBtn');
        const startHint = DOM.get('startHint');

        if (!startBtn) return;

        startBtn.disabled = !enabled;

        const messages = {
            insufficient: 'No questions available for selected categories',
            error: 'Unable to verify question availability',
            limited: availableCount > 0 ? `Only ${availableCount} questions available. Click to start with ${Math.min(availableCount, state.questionCount)} questions.` : '',
            default: 'Select a category to enable quiz generation'
        };

        if (startHint) {
            if (enabled && reason === 'limited' && availableCount > 0) {
                startHint.textContent = messages.limited;
                startHint.style.color = '#d97706';
            } else if (enabled) {
                startHint.textContent = 'Ready to generate your quiz!';
                startHint.style.color = '#059669';
            } else {
                startHint.textContent = messages[reason] || messages.default;
                startHint.style.color = '#6b7280';
            }
        }

        if (availableCount !== null) {
            startBtn.dataset.availableCount = availableCount;
        } else {
            delete startBtn.dataset.availableCount;
        }
    }

    // ==================== CONFIGURATION UPDATES ====================
    function updateSummary() {
        const catSelect = DOM.get('mainCategory');
        const catName = catSelect?.options[catSelect.selectedIndex]?.text?.split('(')[0].trim() || 'Not selected';

        const summaryCat = DOM.get('summaryCategories');
        if (summaryCat) {
            summaryCat.textContent = catName !== 'Not selected' && catName !== 'Choose a category...' ?
                catName + (state.subCategories.length ? ` (${state.subCategories.length} sub)` : '') : 'Not selected';
        }

        const summaryQuestions = DOM.get('summaryQuestions');
        if (summaryQuestions) summaryQuestions.textContent = state.questionCount;

        const summaryTime = DOM.get('summaryTime');
        if (summaryTime) summaryTime.textContent = state.timeLimit === 0 ? 'No limit' : `${state.timeLimit} minutes`;

        const summaryType = DOM.get('summaryType');
        const typeNames = { practice: 'Practice Mode', exam: 'Exam Mode', exam_review: 'Exam + Review' };
        if (summaryType) {
            summaryType.textContent = typeNames[state.quizType] || state.quizType;
            summaryType.className = `summary-value mode-${state.quizType}`;
        }

        const negRow = DOM.get('summaryNegativeRow');
        if (negRow) {
            negRow.style.display = state.negativeMarking ? 'flex' : 'none';
            negRow.classList.toggle('hidden', !state.negativeMarking);
        }

        const timePerQ = DOM.get('summaryTimePerQ');
        if (timePerQ) {
            if (state.timeLimit === 0) {
                timePerQ.textContent = 'Unlimited';
            } else {
                const seconds = Math.round((state.timeLimit * 60) / state.questionCount);
                timePerQ.textContent = `${seconds} seconds`;
            }
        }

        updateTimeEstimate();
    }

    function updateTimeEstimate() {
        const estimate = DOM.get('timeEstimate');
        if (!estimate) return;

        const minutes = state.timeLimit;
        const questions = state.questionCount;

        if (minutes === 0) {
            estimate.innerHTML = `
                <svg class="estimate-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <span class="estimate-text">No time limit</span>
            `;
            estimate.className = 'time-estimate';
            return;
        }

        const secondsPerQ = Math.round((minutes * 60) / questions);
        let urgencyClass = '';
        if (secondsPerQ < 30) urgencyClass = 'urgent';
        else if (secondsPerQ < 45) urgencyClass = 'warning';

        estimate.className = `time-estimate ${urgencyClass}`;
        estimate.innerHTML = `
            <svg class="estimate-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span class="estimate-text">~ ${secondsPerQ} seconds per question</span>
        `;
    }

    function selectQuizType(type) {
        state.quizType = type;

        DOM.queryAll('.type-card').forEach(card => {
            const isActive = card.dataset.type === type;
            card.classList.toggle('active', isActive);
            card.setAttribute('aria-checked', isActive.toString());
            card.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        const radio = document.querySelector(`input[name="quizType"][value="${type}"]`);
        if (radio) radio.checked = true;

        const negRow = DOM.get('negativeMarkingRow');
        const isExamMode = type === 'exam' || type === 'exam_review';

        if (negRow) {
            negRow.style.display = isExamMode ? 'block' : 'none';
            negRow.classList.toggle('hidden', !isExamMode);
        }

        if (!isExamMode) {
            state.negativeMarking = false;
            const negCheckbox = DOM.get('negativeMarking');
            if (negCheckbox) negCheckbox.checked = false;
        }

        updateSummary();
    }

    // ==================== QUIZ START ====================
    async function startQuiz() {
        if (!state.mainCategory) {
            Utils.showValidation('Please select a main category', 'error');
            DOM.get('mainCategory')?.focus();
            return;
        }

        const startBtn = DOM.get('startQuizBtn');
        const available = parseInt(startBtn?.dataset?.availableCount) || state.availableCount;
        const requested = state.questionCount;

        if (available === 0) {
            Utils.showValidation('No questions available for your selection. Please try different categories.', 'error');
            return;
        }

        if (available < requested) {
            const proceed = confirm(
                `Only ${available} questions available (you requested ${requested}).\n\n` +
                `Quiz will start with ${available} questions instead.\n\n` +
                `Do you want to continue?`
            );
            if (!proceed) return;
            state.questionCount = available;
            Utils.showValidation(`Starting quiz with ${available} questions (adjusted from ${requested})`, 'warning', 5000);
        }

        // Show loading state
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.setAttribute('aria-busy', 'true');
            const originalText = startBtn.innerHTML;
            startBtn.innerHTML = `
                <span class="btn-loader" aria-hidden="true">
                    <span class="loader-dot"></span>
                    <span class="loader-dot"></span>
                    <span class="loader-dot"></span>
                </span>
                <span class="sr-only">Loading...</span>
            `;
        }

        try {
            const result = await API.generateQuiz({
                mainCategory: state.mainCategory,
                subCategories: state.subCategories,
                topics: state.topics,
                questionCount: state.questionCount,
                timeLimit: state.timeLimit,
                difficulty: state.difficulty,
                quizType: state.quizType,
                negativeMarking: state.negativeMarking,
                randomOrder: state.randomOrder
            });

            if (!result.success) throw new Error(result.error || 'Failed to generate quiz');

            const data = result.data;
            if (!data.questions?.length) throw new Error('Invalid quiz data received');

            // Hide config, show quiz interface
            const genSection = DOM.get('generatorSection');
            const contentArea = DOM.get('contentArea');
            const sidebar = DOM.query('.quiz-sidebar');
            const quizInterface = DOM.get('quizInterface');

            if (genSection) {
                genSection.classList.add('hidden');
                genSection.style.display = 'none';
            }
            if (contentArea) {
                contentArea.classList.add('hidden');
                contentArea.style.display = 'none';
            }
            if (sidebar) {
                sidebar.classList.add('hidden');
                sidebar.style.display = 'none';
            }

            if (quizInterface) {
                quizInterface.classList.remove('hidden');
                quizInterface.style.display = 'block';
                quizInterface.setAttribute('tabindex', '-1');
                quizInterface.focus();
            }

            // Initialize runner
            if (window.QuizRunner && typeof window.QuizRunner.init === 'function') {
                window.QuizRunner.init(data.questions, {
                    timeLimit: state.timeLimit,
                    quizType: state.quizType,
                    negativeMarking: state.negativeMarking,
                    mainCategory: state.mainCategory
                });
            } else {
                throw new Error('QuizRunner module not loaded. Please refresh the page.');
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
            Utils.announce(`Quiz started. Question 1 of ${data.questions.length}`, 'assertive');

        } catch (error) {
            console.error('Quiz generation failed:', error);
            Utils.showValidation(error.message || 'Failed to start quiz. Please try again.', 'error');
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.setAttribute('aria-busy', 'false');
                startBtn.innerHTML = `
                    <span class="btn-text">Generate Quiz</span>
                    <svg class="btn-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                `;
            }
        }
    }

    // ==================== EVENT LISTENERS ====================
    function attachListeners() {
        // Main category change
        const mainCat = DOM.get('mainCategory');
        if (mainCat) {
            mainCat.addEventListener('change', loadSubCategories);
        }

        // Question count
        const questionCount = DOM.get('questionCount');
        if (questionCount) {
            questionCount.addEventListener('change', (e) => {
                state.questionCount = parseInt(e.target.value) || 50;
                checkAvailability();
                updateSummary();
            });
        }

        // Time limit
        const timeLimit = DOM.get('timeLimit');
        if (timeLimit) {
            timeLimit.addEventListener('change', (e) => {
                state.timeLimit = parseInt(e.target.value) || 45;
                updateSummary();
            });
        }

        // Difficulty
        const difficulty = DOM.get('difficulty');
        if (difficulty) {
            difficulty.addEventListener('change', (e) => {
                state.difficulty = e.target.value;
                updateSummary();
            });
        }

        // Topic search
        const topicInput = DOM.get('topicSearch');
        if (topicInput) {
            topicInput.addEventListener('input', handleTopicSearch);
            topicInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = e.target.value.trim();
                    if (value) addTopic(value);
                }
            });
        }

        // Quiz type cards
        const quizTypeGrid = DOM.get('quizTypeGrid');
        if (quizTypeGrid) {
            quizTypeGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.type-card');
                if (card) selectQuizType(card.dataset.type);
            });
        }

        // Negative marking toggle
        const negMarking = DOM.get('negativeMarking');
        if (negMarking) {
            negMarking.addEventListener('change', (e) => {
                state.negativeMarking = e.target.checked;
                updateSummary();
            });
        }

        // Random order toggle
        const randomOrder = DOM.get('randomOrder');
        if (randomOrder) {
            randomOrder.addEventListener('change', (e) => {
                state.randomOrder = e.target.checked;
            });
        }

        // Start quiz button — FIX: declare startBtn with const
        const startBtn = DOM.get('startQuizBtn');
        if (startBtn) {
            startBtn.addEventListener('click', startQuiz);
        }

        // Quick select from sidebar
        DOM.queryAll('.category-link').forEach(link => {
            link.addEventListener('click', () => {
                const slug = link.dataset.slug;
                if (slug && mainCat) {
                    mainCat.value = slug;
                    loadSubCategories();
                    DOM.get('section1')?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // Form submission prevention
        DOM.queryAll('form').forEach(form => {
            form.addEventListener('submit', (e) => e.preventDefault());
        });

        // Keyboard shortcut: Ctrl+Enter to start
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                const quizInterface = DOM.get('quizInterface');
                if (quizInterface && quizInterface.classList.contains('hidden')) {
                    e.preventDefault();
                    startQuiz();
                }
            }
        });
    }

    // ==================== INITIALIZATION ====================
    function init() {
        // Validate environment
        if (!window.CATEGORY_DATA || !Array.isArray(window.CATEGORY_DATA)) {
            console.error('CATEGORY_DATA not found');
            Utils.showValidation('Error: Quiz configuration failed to load. Please refresh.', 'error', 0);
            return;
        }

        // Restore previous config
        const saved = Utils.restoreConfig();
        if (saved) {
            Object.assign(state, saved);
            if (saved.mainCategory) {
                const mainCat = DOM.get('mainCategory');
                if (mainCat) mainCat.value = saved.mainCategory;
            }
        }

        // Set defaults
        selectQuizType(state.quizType);
        updateSummary();

        attachListeners();

        Utils.announce('Quiz generator ready. Select a category to begin.', 'polite');
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return Object.freeze({
        getState: () => ({ ...state }),
        clearConfig: Utils.clearConfig,
        showValidation: Utils.showValidation
    });
})();