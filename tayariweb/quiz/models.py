from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse
import secrets
import re  # ADD THIS LINE
import string  


class Quiz(models.Model):
    QUIZ_TYPES = [
        ('simple', 'Simple (No Negative Marking)'),
        ('negative', 'Negative Marking'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]
    
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=100)
    difficulty = models.CharField(max_length=20, choices=[
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
    ], default='medium')
    
    quiz_type = models.CharField(max_length=20, choices=QUIZ_TYPES, default='simple')
    time_limit_minutes = models.PositiveIntegerField(default=10, help_text="Time limit in minutes")
    total_questions_to_show = models.PositiveIntegerField(default=10, help_text="Number of questions to show from pool")
    passing_percentage = models.PositiveIntegerField(default=70, help_text="Passing score percentage")
    
    marks_per_correct = models.DecimalField(max_digits=3, decimal_places=1, default=1.0)
    marks_per_wrong = models.DecimalField(max_digits=3, decimal_places=1, default=0.0, help_text="Negative marks (e.g., 0.25)")
    
    custom_instructions = models.TextField(blank=True, help_text="Custom instructions (overrides default)")
    rules = models.JSONField(default=list, help_text="List of rules as strings")
    
    token = models.CharField(max_length=32, unique=True, editable=False, null=True, blank=True)
    slug = models.SlugField(unique=True, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    
    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(24)[:32]
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.title)[:50]
        super().save(*args, **kwargs)
    
    def get_absolute_url(self):
        return reverse('quiz:quiz_instructions', kwargs={'slug': self.slug})
    
    def get_start_url(self):
        return reverse('quiz:quiz_start', kwargs={'slug': self.slug})
    
    @property
    def time_limit_seconds(self):
        return self.time_limit_minutes * 60
    
    @property
    def default_instructions(self):
        if self.custom_instructions:
            return self.custom_instructions
        return f"This quiz contains {self.total_questions_to_show} questions. You have {self.time_limit_minutes} minutes to complete it."
    
    @property
    def default_rules(self):
        if self.rules:
            return self.rules
        rules = [
            f"Total questions: {self.total_questions_to_show}",
            f"Time limit: {self.time_limit_minutes} minutes",
            f"Passing score: {self.passing_percentage}%",
        ]
        if self.quiz_type == 'negative':
            rules.append(f"Negative marking: -{self.marks_per_wrong} for wrong answers")
        return rules
    
    def __str__(self):
        return self.title
    token = models.CharField(
        max_length=20, 
        unique=True, 
        blank=True, 
        db_index=True,
        help_text="Unique token for embedding quiz in articles"
    )
    
    # Auto-generate token on save if empty
    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self.generate_unique_token()
        super().save(*args, **kwargs)
    
    def generate_unique_token(self):
        """Generate unique 8-character token"""
        while True:
            # Generate 8-char alphanumeric token (e.g., 'a3k9m2p1')
            token = ''.join(secrets.choice(
                string.ascii_lowercase + string.digits
            ) for _ in range(8))
            
            if not Quiz.objects.filter(token=token).exists():
                return token
    
    def __str__(self):
        return f"{self.title} ({self.token})"
class Article(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
    ]
    
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    excerpt = models.TextField(max_length=500, blank=True, help_text="Short description for SEO")
    
    # Content with quiz tokens
    content = models.TextField(help_text="Paste quiz token like {{quiz:abc123}} where you want quiz to appear")
    
    # Optional: Direct quiz relation (if you want to track which quizzes are used)
    # This is optional - tokens in content work independently
    featured_quiz = models.ForeignKey(
        Quiz, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='featured_articles'
    )
    
    featured_image = models.ImageField(upload_to='articles/', blank=True, null=True)
    category = models.ForeignKey('Category', on_delete=models.SET_NULL, null=True, blank=True)
    
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # SEO fields
    meta_title = models.CharField(max_length=60, blank=True, help_text="SEO title (optional)")
    meta_description = models.CharField(max_length=160, blank=True, help_text="SEO description (optional)")
    
    def get_absolute_url(self):
        return reverse('quiz:article_detail', kwargs={'slug': self.slug})
    
    def extract_quiz_tokens(self):
        """Extract all quiz tokens from content"""
        pattern = r'\{\{quiz:([a-zA-Z0-9]+)\}\}'
        return re.findall(pattern, self.content)
    
    def get_first_quiz(self):
        """Get first quiz from content tokens (for validation)"""
        tokens = self.extract_quiz_tokens()
        if tokens:
            try:
                return Quiz.objects.get(token=tokens[0], is_published=True)
            except Quiz.DoesNotExist:
                return None
        return None
    
    def __str__(self):
        return self.title
    
    class Meta:
        ordering = ['-published_at', '-created_at']
        
class Question(models.Model):
    QUESTION_TYPES = [
        ('mcq', 'Multiple Choice'),
        ('true_false', 'True/False'),
        ('short_answer', 'Short Answer'),
    ]
    
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES, default='mcq')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    option_a = models.CharField(max_length=255, blank=True)
    option_b = models.CharField(max_length=255, blank=True)
    option_c = models.CharField(max_length=255, blank=True)
    option_d = models.CharField(max_length=255, blank=True)
    correct_option = models.CharField(max_length=1, choices=[
        ('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')
    ], blank=True, null=True)
    
    correct_boolean = models.BooleanField(null=True, blank=True)
    correct_text = models.CharField(max_length=255, blank=True)
    explanation = models.TextField(blank=True, help_text="Explanation shown after revealing answer")
    
    class Meta:
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"Q{self.order}: {self.question_text[:50]}..."
    
    @property
    def options_list(self):
        if self.question_type == 'mcq':
            return [
                {'key': 'a', 'text': self.option_a},
                {'key': 'b', 'text': self.option_b},
                {'key': 'c', 'text': self.option_c},
                {'key': 'd', 'text': self.option_d},
            ]
        elif self.question_type == 'true_false':
            return [
                {'key': 'true', 'text': 'True'},
                {'key': 'false', 'text': 'False'},
            ]
        return []


class QuizAttempt(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='quiz_attempts', null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    correct_answers = models.PositiveIntegerField(default=0)
    wrong_answers = models.PositiveIntegerField(default=0)
    time_taken_seconds = models.PositiveIntegerField(default=0)
    is_completed = models.BooleanField(default=False)
    answers_data = models.JSONField(default=dict)
    
    class Meta:
        pass
    
    def calculate_score(self):
        questions = self.quiz.questions.filter(is_active=True)[:self.quiz.total_questions_to_show]
        correct = 0
        wrong = 0
        
        for q in questions:
            user_answer = self.answers_data.get(str(q.id))
            is_correct = False
            
            if q.question_type == 'mcq' and user_answer == q.correct_option:
                is_correct = True
            elif q.question_type == 'true_false' and user_answer == str(q.correct_boolean).lower():
                is_correct = True
            elif q.question_type == 'short_answer' and user_answer and user_answer.lower() == q.correct_text.lower():
                is_correct = True
            
            if is_correct:
                correct += 1
            elif user_answer:
                wrong += 1
        
        self.correct_answers = correct
        self.wrong_answers = wrong
        
        if self.quiz.quiz_type == 'negative':
            self.score = (correct * float(self.quiz.marks_per_correct)) - (wrong * float(self.quiz.marks_per_wrong))
        else:
            self.score = correct * float(self.quiz.marks_per_correct)
        
        self.save()
        return self.score
    
    def __str__(self):
        username = self.user.username if self.user else 'Anonymous'
        return f"{username} - {self.quiz.title} - {self.score}"


class QuizComment(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='comments')
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    guest_name = models.CharField(max_length=50, blank=True, null=True)
    guest_session_id = models.CharField(max_length=100, blank=True, null=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_edited = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        name = self.user.username if self.user else self.guest_name
        return f"{name} on {self.quiz.title}"
    
    @property
    def is_reply(self):
        return self.parent is not None
    
    @property
    def display_name(self):
        if self.user:
            return self.user.username
        return self.guest_name or 'Anonymous'
    
    @property
    def is_guest(self):
        return self.user is None
    
class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=10, default="📚", help_text="Emoji icon")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['name']
    
    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)
    
    def get_absolute_url(self):
        return reverse('quiz:category_detail', kwargs={'slug': self.slug})
    
    @property
    def quiz_count(self):
        return Quiz.objects.filter(category=self.name, status='active').count()
    
    def __str__(self):
        return self.name