/**
 * DIRECT QUIZ - Auto-initializes on page load
 */

(function() {
    'use strict';

    console.log('📦 Quiz script loading...');

    // Check quiz data
    if (!window.quizData) {
        console.error('❌ window.quizData not found!');
        alert('Error: Quiz data not loaded. Please refresh.');
        return;
    }

    console.log('✅ Quiz data:', window.quizData);

    function DirectQuiz() {
        this.state = {
            currentQuestion: 0,
            userAnswers: {},
            revealedAnswers: {},
            bookmarks: new Set(),
            timeRemaining: window.quizData.config.timeLimit,
            hasStarted: true,
            hasFinished: false,
            attemptId: window.quizData.config.attemptId,
            feedbackGiven: false
        };
        
        this.data = window.quizData;
        this.elements = {};
        
        this.init();
    }

    DirectQuiz.prototype.init = function() {
        console.log('🚀 Initializing quiz...');
        
        this.cacheElements();
        this.createAttempt();
        this.buildJumpBar();
        this.renderQuestion();
        this.startTimer();
        this.setupKeyboard();
        this.loadFeedback();
        this.loadComments();
        
        console.log('✅ Quiz initialized');
    };

   DirectQuiz.prototype.cacheElements = function() {
    this.elements.timerDigits = document.getElementById('timerDigits');
    this.elements.jumpNumbers = document.getElementById('jumpNumbers');
    this.elements.qCount = document.getElementById('qCount');
    this.elements.questionText = document.getElementById('questionText');
    this.elements.optionsWrap = document.getElementById('optionsWrap');
    this.elements.revealBox = document.getElementById('revealBox');
    this.elements.revealStatus = document.getElementById('revealStatus');
    this.elements.revealExplain = document.getElementById('revealExplain');
    this.elements.prevBtn = document.getElementById('prevBtn');
    this.elements.nextBtn = document.getElementById('nextBtn');
    this.elements.submitBtn = document.getElementById('submitBtn');
    this.elements.checkBtn = document.getElementById('checkBtn');
    this.elements.quizBlock = document.getElementById('quizBlock');
    this.elements.resultsBlock = document.getElementById('resultsBlock');
    this.elements.midQuizAd = document.getElementById('midQuizAd');
};

    DirectQuiz.prototype.createAttempt = function() {
        var self = this;
        
        if (!this.state.attemptId || this.state.attemptId === 'null') {
            fetch('/quizzes/api/create-attempt/' + this.data.id + '/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken(),
                    'Content-Type': 'application/json'
                }
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                self.state.attemptId = data.attempt_id;
                console.log('✅ Attempt created:', data.attempt_id);
            })
            .catch(function(e) {
                self.state.attemptId = 'local_' + Date.now();
                console.warn('Local attempt:', self.state.attemptId);
            });
        }
    };

    DirectQuiz.prototype.buildJumpBar = function() {
        var total = this.data.config.totalQuestions;
        var html = '';
        
        for (var i = 0; i < total; i++) {
            html += '<div class="jump-num" id="jump' + i + '" onclick="quizApp.goTo(' + i + ')">' + (i + 1) + '</div>';
        }
        
        if (this.elements.jumpNumbers) {
            this.elements.jumpNumbers.innerHTML = html;
        }
    };

    DirectQuiz.prototype.updateJumpBar = function() {
    var total = this.data.config.totalQuestions;
    
    for (var i = 0; i < total; i++) {
        var el = document.getElementById('jump' + i);
        if (!el) continue;
        
        var q = this.data.questions[i];
        var classes = 'jump-num';
        
        if (i === this.state.currentQuestion) classes += ' current';
        if (this.state.userAnswers[q.id]) classes += ' answered';
        if (this.state.bookmarks.has(q.id)) classes += ' bookmarked';
        
        el.className = classes;
    }
};

  DirectQuiz.prototype.renderQuestion = function() {
    console.log('Rendering Q:', this.state.currentQuestion);
    
    var q = this.data.questions[this.state.currentQuestion];
    if (!q) return;
    
    var total = this.data.config.totalQuestions;
    var current = this.state.currentQuestion + 1;
    
    // Update displays
    if (this.elements.qCount) {
        this.elements.qCount.textContent = 'Question ' + current + ' of ' + total;
    }
    
    if (this.elements.bookmarkBtn) {
        this.elements.bookmarkBtn.classList.toggle('active', this.state.bookmarks.has(q.id));
    }
    
    if (this.elements.questionText) {
        this.elements.questionText.textContent = q.question;
    }
    
    // Build options
    var selected = this.state.userAnswers[q.id];
    var revealed = this.state.revealedAnswers[q.id];
    var html = '';
    
    if (q.options && q.options.length > 0) {
        for (var i = 0; i < q.options.length; i++) {
            var opt = q.options[i];
            var classes = 'option-row';
            
            if (revealed) {
                if (opt.key === q.correct) classes += ' correct';
                else if (selected === opt.key) classes += ' wrong';
                classes += ' disabled';
            } else if (selected === opt.key) {
                classes += ' selected';
            }
            
            html += 
                '<label class="' + classes + '">' +
                    '<input type="radio" name="opt" value="' + opt.key + '" ' +
                           (selected === opt.key ? 'checked ' : '') +
                           (revealed ? 'disabled ' : '') +
                           'onchange="quizApp.select(\'' + q.id + '\', \'' + opt.key + '\')">' +
                    '<span class="opt-text">' + this.escapeHtml(opt.text) + '</span>' +
                '</label>';
        }
    }
    
    if (this.elements.optionsWrap) {
        this.elements.optionsWrap.innerHTML = html;
    }
    
    // Show/hide reveal
    if (revealed) {
        this.showReveal(q);
    } else {
        this.hideReveal();
    }
    
    this.updateJumpBar();
    this.updateButtons();
    
    // Mid-quiz ad logic
    this.handleMidQuizAd(current, total);
};

// Separate function for ad logic
DirectQuiz.prototype.handleMidQuizAd = function(current, total) {
    var ad = document.getElementById('midQuizAd');
    if (!ad) return;
    
    // Show at Q10, Q20, Q30 (not at start, not at end)
    var showAt = [10, 20, 30];
    var shouldShow = showAt.includes(current) && current < total;
    
    // Check if user closed it
    var wasClosed = ad.dataset.closed === 'true';
    
    console.log('Ad check - Q:', current, 'Show:', shouldShow, 'Closed:', wasClosed);
    
    if (shouldShow && !wasClosed) {
        ad.classList.remove('hidden');
        // Update question number in ad
        var qNum = document.getElementById('adQNum');
        if (qNum) qNum.textContent = current;
    } else {
        ad.classList.add('hidden');
    }
};

// Close ad function
DirectQuiz.prototype.closeMidAd = function() {
    var ad = document.getElementById('midQuizAd');
    if (ad) {
        ad.dataset.closed = 'true';
        ad.classList.add('hidden');
    }
};

DirectQuiz.prototype.select = function(qid, answer) {
        if (this.state.revealedAnswers[qid]) return;
        
        this.state.userAnswers[qid] = answer;
        this.renderQuestion();
        
        // Save to server
        if (this.state.attemptId && !String(this.state.attemptId).startsWith('local')) {
            fetch('/quizzes/api/save-answer/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({
                    attempt_id: this.state.attemptId,
                    question_id: qid,
                    answer: answer
                })
            }).catch(function() {});
        }
    };

    DirectQuiz.prototype.checkAnswer = function() {
        var q = this.data.questions[this.state.currentQuestion];
        
        if (!this.state.userAnswers[q.id]) {
            alert('Please select an answer first');
            return;
        }
        
        this.state.revealedAnswers[q.id] = true;
        this.showReveal(q);
        this.updateButtons();
    };

    DirectQuiz.prototype.showReveal = function(q) {
        var userAns = this.state.userAnswers[q.id];
        var isCorrect = userAns === q.correct;
        
        if (this.elements.revealBox) {
            this.elements.revealBox.className = 'reveal-box ' + (isCorrect ? 'correct' : 'wrong');
            this.elements.revealBox.classList.remove('hidden');
        }
        
        if (this.elements.revealStatus) {
            this.elements.revealStatus.innerHTML = isCorrect ? 
                '✅ Correct!' : '❌ Wrong! Correct: <strong>' + q.correct.toUpperCase() + '</strong>';
        }
        
        if (this.elements.revealExplain) {
            this.elements.revealExplain.textContent = q.explanation || 'No explanation available.';
        }
        
        if (this.elements.checkBtn) {
            this.elements.checkBtn.textContent = isCorrect ? '✓ Correct' : '✗ Wrong';
            this.elements.checkBtn.disabled = true;
        }
    };

    DirectQuiz.prototype.hideReveal = function() {
        if (this.elements.revealBox) {
            this.elements.revealBox.classList.add('hidden');
        }
        if (this.elements.checkBtn) {
            this.elements.checkBtn.textContent = 'Check Answer';
            this.elements.checkBtn.disabled = false;
        }
    };

    DirectQuiz.prototype.prevQuestion = function() {
        if (this.state.currentQuestion > 0) {
            this.state.currentQuestion--;
            this.renderQuestion();
        }
    };

    DirectQuiz.prototype.nextQuestion = function() {
        if (this.state.currentQuestion < this.data.config.totalQuestions - 1) {
            this.state.currentQuestion++;
            this.renderQuestion();
        }
    };

    DirectQuiz.prototype.goTo = function(index) {
        this.state.currentQuestion = index;
        this.renderQuestion();
    };

    DirectQuiz.prototype.updateButtons = function() {
        var total = this.data.config.totalQuestions;
        var isFirst = this.state.currentQuestion === 0;
        var isLast = this.state.currentQuestion === total - 1;
        
        if (this.elements.prevBtn) this.elements.prevBtn.disabled = isFirst;
        
        if (this.elements.nextBtn && this.elements.submitBtn) {
            if (isLast) {
                this.elements.nextBtn.classList.add('hidden');
                this.elements.submitBtn.classList.remove('hidden');
            } else {
                this.elements.nextBtn.classList.remove('hidden');
                this.elements.submitBtn.classList.add('hidden');
            }
        }
    };

    DirectQuiz.prototype.toggleBookmark = function() {
    var q = this.data.questions[this.state.currentQuestion];
    var btn = document.getElementById('bookmarkBtn');
    
    if (!btn) return;
    
    if (this.state.bookmarks.has(q.id)) {
        this.state.bookmarks.delete(q.id);
        btn.classList.remove('active');
        btn.style.opacity = '0.5';
        btn.style.transform = 'scale(1)';
    } else {
        this.state.bookmarks.add(q.id);
        btn.classList.add('active');
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1.2)';
        setTimeout(function() { btn.style.transform = 'scale(1)'; }, 200);
    }
    
    this.updateJumpBar();
};

    DirectQuiz.prototype.showHint = function() {
        var q = this.data.questions[this.state.currentQuestion];
        alert('💡 Hint: Answer starts with "' + q.correct.charAt(0).toUpperCase() + '"');
    };

    DirectQuiz.prototype.toggleFullscreen = function() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };

   DirectQuiz.prototype.startTimer = function() {
    var self = this;
    
    // Update immediately
    this.updateTimerDisplay();
    
    // Update every second
    this.state.timerInterval = setInterval(function() {
        self.state.timeRemaining--;
        self.updateTimerDisplay();
        
        // Time's up
        if (self.state.timeRemaining <= 0) {
            clearInterval(self.state.timerInterval);
            self.submitQuiz(true);
        }
    }, 1000);
};

DirectQuiz.prototype.updateTimerDisplay = function() {
    if (!this.elements.timerDigits) return;
    
    var m = Math.floor(this.state.timeRemaining / 60);
    var s = this.state.timeRemaining % 60;
    
    this.elements.timerDigits.textContent = 
        (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    
    // Warning color when 60 seconds or less
    if (this.state.timeRemaining <= 60) {
        this.elements.timerDigits.classList.add('warning');
    }
};

    DirectQuiz.prototype.submitQuiz = function(auto) {
        if (this.state.hasFinished) return;
        
        var unanswered = this.data.config.totalQuestions - Object.keys(this.state.userAnswers).length;
        if (!auto && unanswered > 0 && !confirm(unanswered + ' unanswered. Submit?')) return;
        
        this.state.hasFinished = true;
        this.showResults();
    };

    // SIMPLIFIED: Flat review list, no dropdown
    DirectQuiz.prototype.showResults = function() {
        var correct = 0, wrong = 0, skipped = 0;
        
        for (var i = 0; i < this.data.questions.length; i++) {
            var q = this.data.questions[i];
            var ans = this.state.userAnswers[q.id];
            
            if (ans === q.correct) correct++;
            else if (ans) wrong++;
            else skipped++;
        }
        
        var total = this.data.config.totalQuestions;
        var pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        var passed = pct >= this.data.config.passingPercentage;
        
        // Hide quiz, show results
        if (this.elements.quizBlock) {
            this.elements.quizBlock.style.display = 'none';
        }
        if (this.elements.resultsBlock) {
            this.elements.resultsBlock.classList.remove('hidden');
        }
        
        // Update display
        var scoreBig = document.getElementById('scoreBig');
        var resultTag = document.getElementById('resultTag');
        var statCorrect = document.getElementById('statCorrect');
        var statWrong = document.getElementById('statWrong');
        var statSkipped = document.getElementById('statSkipped');
        var statTime = document.getElementById('statTime');
        
        if (scoreBig) scoreBig.textContent = pct + '%';
        
        if (resultTag) {
            resultTag.textContent = passed ? 'PASSED' : 'FAILED';
            resultTag.className = 'result-tag ' + (passed ? 'passed' : 'failed');
        }
        
        if (statCorrect) statCorrect.textContent = correct;
        if (statWrong) statWrong.textContent = wrong;
        if (statSkipped) statSkipped.textContent = skipped;
        
        if (statTime) {
            var taken = this.data.config.timeLimit - this.state.timeRemaining;
            var m = Math.floor(taken / 60);
            var s = taken % 60;
            statTime.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        }
        
        // Build FLAT review list (no dropdown)
        this.buildFlatReview();
        this.refreshAds();
        
        // Scroll to results
        if (this.elements.resultsBlock) {
            this.elements.resultsBlock.scrollIntoView({ behavior: 'smooth' });
        }
        
        // Sync with server
        if (this.state.attemptId && !String(this.state.attemptId).startsWith('local')) {
            fetch('/quizzes/api/submit/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({
                    attempt_id: this.state.attemptId,
                    answers: this.state.userAnswers,
                    time_taken: this.data.config.timeLimit - this.state.timeRemaining
                })
            }).catch(function() {});
        }
    };

    // NEW: Build flat review list (replaces renderReview)
   DirectQuiz.prototype.buildFlatReview = function() {
    var container = document.getElementById('reviewList');
    if (!container) return;
    
    var html = '';
    
    for (var i = 0; i < this.data.questions.length; i++) {
        var q = this.data.questions[i];
        var ans = this.state.userAnswers[q.id];
        var status, badgeClass, badgeText;
        
        if (ans === q.correct) {
            status = 'correct';
            badgeClass = 'correct';
            badgeText = 'Correct';
        } else if (ans) {
            status = 'wrong';
            badgeClass = 'wrong';
            badgeText = 'Wrong';
        } else {
            status = 'skipped';
            badgeClass = 'skipped';
            badgeText = 'Skipped';
        }
        
        // Find option text for display
        var userOptText = 'Not answered';
        var correctOptText = 'N/A';
        
        if (q.options && Array.isArray(q.options)) {
            var userOpt = q.options.find(function(o) { return o.key === ans; });
            var correctOpt = q.options.find(function(o) { return o.key === q.correct; });
            
            if (userOpt) userOptText = userOpt.text;
            if (correctOpt) correctOptText = correctOpt.text;
        }
        
        html += 
            '<div class="review-item ' + status + '" data-status="' + status + '">' +
                '<div class="review-head">' +
                    '<span>Q' + (i + 1) + '</span>' +
                    '<span class="review-badge ' + badgeClass + '">' + badgeText + '</span>' +
                '</div>' +
                '<div class="review-body">' +
                    '<p>' + this.escapeHtml(q.question) + '</p>' +
                    '<p><strong>Your:</strong> ' + this.escapeHtml(userOptText) + 
                    ' | <strong>Correct:</strong> ' + this.escapeHtml(correctOptText) + '</p>' +
                    (q.explanation ? '<div class="explanation"><strong>Why:</strong> ' + 
                        this.escapeHtml(q.explanation) + '</div>' : '') +
                '</div>' +
            '</div>';
    }
    
    container.innerHTML = html;
};

    DirectQuiz.prototype.filterResults = function(type) {
        // Update active button
        document.querySelectorAll('.filter-tag').forEach(function(btn) {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Filter items
        document.querySelectorAll('.review-item').forEach(function(item) {
            item.style.display = (type === 'all' || item.dataset.status === type) ? 'block' : 'none';
        });
    };

    DirectQuiz.prototype.loadFeedback = function() {
        var self = this;
        
        fetch('/quizzes/api/feedback/' + this.data.id + '/')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var likeCount = document.getElementById('likeCount');
                var dislikeCount = document.getElementById('dislikeCount');
                if (likeCount) likeCount.textContent = data.likes;
                if (dislikeCount) dislikeCount.textContent = data.dislikes;
            })
            .catch(function() {});
    };

    DirectQuiz.prototype.giveFeedback = function(type) {
        if (this.state.feedbackGiven) return;
        
        var self = this;
        
        fetch('/quizzes/api/feedback/' + this.data.id + '/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': this.getCsrfToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: type })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var likeCount = document.getElementById('likeCount');
            var dislikeCount = document.getElementById('dislikeCount');
            if (likeCount) likeCount.textContent = data.likes;
            if (dislikeCount) dislikeCount.textContent = data.dislikes;
            
            var btn = document.getElementById(type + 'Btn');
            if (btn) btn.classList.add('active');
            
            var thanks = document.getElementById('fbThanks');
            if (thanks) thanks.classList.remove('hidden');
            
            self.state.feedbackGiven = true;
        })
        .catch(function() {
            alert('Failed to submit feedback');
        });
    };

    DirectQuiz.prototype.postComment = function(e) {
        e.preventDefault();
        
        var name = document.getElementById('commentName');
        var body = document.getElementById('commentBody');
        
        if (!name || !body) return;
        
        var self = this;
        
        fetch('/quizzes/api/comment/' + this.state.attemptId + '/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': this.getCsrfToken(),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                guest_name: name.value.trim(),
                text: body.value.trim()
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.status === 'success') {
                body.value = '';
                self.loadComments();
            }
        })
        .catch(function() {
            alert('Failed to post comment');
        });
    };

    DirectQuiz.prototype.loadComments = function() {
        if (!this.state.attemptId) return;
        
        var self = this;
        
        fetch('/quizzes/api/comments/' + this.state.attemptId + '/')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var container = document.getElementById('commentsList');
                if (!container) return;
                
                container.innerHTML = data.comments.map(function(c) {
                    return 
                        '<div class="comment-item" style="padding:1rem;background:var(--bg);border-radius:6px;margin-bottom:0.75rem;">' +
                            '<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">' +
                                '<strong>' + self.escapeHtml(c.user) + '</strong>' +
                                '<span style="color:var(--text-light);font-size:0.875rem;">' + c.created_at + '</span>' +
                            '</div>' +
                            '<p>' + self.escapeHtml(c.text) + '</p>' +
                        '</div>';
                }).join('');
            })
            .catch(function() {});
    };

    DirectQuiz.prototype.setupKeyboard = function() {
        var self = this;
        
        document.addEventListener('keydown', function(e) {
            if (!self.state.hasStarted || self.state.hasFinished) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            var q = self.data.questions[self.state.currentQuestion];
            
            if (['1','2','3','4'].includes(e.key) && !self.state.revealedAnswers[q.id]) {
                var idx = parseInt(e.key) - 1;
                if (q.options && q.options[idx]) {
                    self.select(q.id, q.options[idx].key);
                }
            }
            
            if (e.key === ' ' && !self.state.revealedAnswers[q.id]) {
                e.preventDefault();
                self.checkAnswer();
            }
            
            if (e.key === 'ArrowRight') self.nextQuestion();
            if (e.key === 'ArrowLeft') self.prevQuestion();
        });
    };

    DirectQuiz.prototype.refreshAds = function() {
        if (typeof adsbygoogle !== 'undefined') {
            try {
                (adsbygoogle = window.adsbygoogle || []).push({});
            } catch (e) {}
        }
    };

    DirectQuiz.prototype.getCsrfToken = function() {
        var name = 'csrftoken';
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    };

    DirectQuiz.prototype.escapeHtml = function(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Initialize
    window.quizApp = new DirectQuiz();
    console.log('✅ quizApp ready');

})();