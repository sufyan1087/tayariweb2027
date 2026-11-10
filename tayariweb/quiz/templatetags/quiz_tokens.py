import re
import json
from django import template
from django.template.loader import render_to_string
from django.utils.safestring import mark_safe
from quiz.models import Quiz

register = template.Library()

QUIZ_TOKEN_REGEX = r'\[\[quiz:([a-zA-Z0-9]+)\]\]'

@register.filter
def render_quiz_tokens(content):
    if not content:
        return content
    
    def replace_token(match):
        token = match.group(1)
        try:
            quiz = Quiz.objects.get(token=token, status='active')
            
            questions = []
            for q in quiz.questions.filter(is_active=True).order_by('order', 'id'):
                questions.append({
                    'id': str(q.id),
                    'question': q.question_text,
                    'options': [
                        {'key': 'a', 'text': q.option_a},
                        {'key': 'b', 'text': q.option_b},
                        {'key': 'c', 'text': q.option_c},
                        {'key': 'd', 'text': q.option_d},
                    ],
                    'correct': q.correct_option,
                    'explanation': q.explanation or ''
                })
            
            return render_to_string('quiz/includes/quiz_embed.html', {
                'quiz': quiz,
                'token': token,
                'questions_json': json.dumps(questions),
                'total_questions': len(questions),
                'time_limit_seconds': quiz.time_limit_minutes * 60,
            })
            
        except Quiz.DoesNotExist:
            return f'<div class="quiz-error">Quiz not found: {token}</div>'
    
    return mark_safe(re.sub(QUIZ_TOKEN_REGEX, replace_token, content))