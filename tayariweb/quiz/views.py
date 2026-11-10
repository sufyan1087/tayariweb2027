from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.contrib.admin.views.decorators import staff_member_required
from django.views.decorators.http import require_http_methods, require_POST
from django.utils import timezone
from django.core.cache import cache
from django.core.serializers.json import DjangoJSONEncoder
from decimal import Decimal
from django.urls import reverse
import json
import uuid
from django.utils.safestring import mark_safe
from io import BytesIO
import pandas as pd

from .models import Quiz, Question, QuizAttempt, QuizComment, Category, Article
from .import_utils import import_questions_from_excel


# ==================== ARTICLE WITH EMBEDDED QUIZ ====================

def article_detail(request, slug):
    """
    Display article with embedded quiz token(s).
    URL: /article/<slug>/
    Template: quiz/article_detail.html
    """
    article = get_object_or_404(Article, slug=slug, status='published')
    
    context = {
        'article': article,
    }
    
    return render(request, 'quiz/article_detail.html', context)


# ==================== QUIZ EMBED API ====================

def quiz_embed_api(request, token):
    """
    API endpoint to fetch quiz data for token-based embedding.
    Guest users - no authentication required.
    """
    quiz = get_object_or_404(Quiz, token=token, is_published=True)
    
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
            'correct': q.correct_answer.lower(),
            'explanation': q.explanation or ''
        })
    
    data = {
        'id': quiz.id,
        'title': quiz.title,
        'time_limit': quiz.time_limit_minutes * 60,
        'quiz_type': quiz.quiz_type,
        'marks_per_correct': float(quiz.marks_per_correct),
        'marks_per_wrong': float(quiz.marks_per_wrong),
        'passing_percentage': quiz.passing_percentage,
        'total_questions': len(questions),
        'questions': questions
    }
    
    return JsonResponse(data)


# ==================== EXISTING QUIZ VIEWS ====================

def quiz_list(request):
    """Show all active quizzes"""
    quizzes = Quiz.objects.filter(status='active')
    return render(request, 'quiz/quiz_list.html', {'quizzes': quizzes})


def quiz_full(request, slug):
    """
    Unified quiz page - Content + Quiz with right sidebar
    Template: quiz/quiz_full.html
    """
    quiz = get_object_or_404(Quiz, slug=slug, status='active')
    
    # Get or create attempt
    session_attempts = request.session.get('quiz_attempts', {})
    attempt_id = session_attempts.get(str(quiz.id))
    attempt = None
    
    if attempt_id:
        attempt = QuizAttempt.objects.filter(
            id=attempt_id, quiz=quiz, is_completed=False
        ).first()
    
    # Get random questions
    questions = list(
        quiz.questions.filter(is_active=True)
        .order_by('?')[:quiz.total_questions_to_show]
    )
    
    # Build questions data for JS
    questions_data = []
    for q in questions:
        q_data = {
            'id': q.id,
            'question': q.question_text,
            'question_type': q.question_type,
            'options': [
                {'key': 'a', 'text': q.option_a},
                {'key': 'b', 'text': q.option_b},
                {'key': 'c', 'text': q.option_c},
                {'key': 'd', 'text': q.option_d},
            ] if q.question_type == 'mcq' else (
                [{'key': 'true', 'text': 'True'}, {'key': 'false', 'text': 'False'}] 
                if q.question_type == 'true_false' else []
            ),
            'correct': q.correct_option,
            'correct_boolean': str(q.correct_boolean).lower() if q.correct_boolean is not None else None,
            'explanation': q.explanation or '',
        }
        questions_data.append(q_data)
    
    # CONVERT TO JSON HERE - This was missing!
    questions_json = json.dumps(questions_data, cls=DjangoJSONEncoder)
    
    # Get popular quizzes
    general_quizzes = Quiz.objects.filter(
        status='active'
    ).exclude(id=quiz.id).order_by('-updated_at')[:5]
    
    # Get related categories
    related_categories = Category.objects.filter(
        is_active=True
    ).exclude(name=quiz.category)[:8]
    
    # Get related quizzes
    related_quizzes = Quiz.objects.filter(
        category=quiz.category, status='active'
    ).exclude(id=quiz.id)[:4]
    
    context = {
        'quiz': quiz,
        'questions_json': questions_json,
        'total_questions': len(questions_data),
        'time_limit_seconds': quiz.time_limit_seconds,
        'attempt_id': attempt.id if attempt else None,
        'general_quizzes': general_quizzes,
        'related_categories': related_categories,
        'related_quizzes': related_quizzes,
    }
    
    return render(request, 'quiz/quiz_full.html', context)
# ==================== API ENDPOINTS ====================

@require_http_methods(["POST"])
def create_attempt_api(request, quiz_id):
    """Create new quiz attempt"""
    quiz = get_object_or_404(Quiz, id=quiz_id, status='active')
    
    if 'quiz_attempts' not in request.session:
        request.session['quiz_attempts'] = {}
    
    session_attempts = request.session['quiz_attempts']
    
    if str(quiz.id) in session_attempts:
        old_attempt_id = session_attempts[str(quiz.id)]
        QuizAttempt.objects.filter(id=old_attempt_id, is_completed=False).delete()
    
    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        user=None,
        answers_data={}
    )
    
    session_attempts[str(quiz.id)] = attempt.id
    request.session['quiz_attempts'] = session_attempts
    request.session.modified = True
    
    return JsonResponse({
        'status': 'success',
        'attempt_id': attempt.id
    })


@require_http_methods(["POST"])
def save_answer_api(request):
    """Save answer during quiz"""
    try:
        data = json.loads(request.body)
        attempt_id = data.get('attempt_id')
        question_id = data.get('question_id')
        answer = data.get('answer')
        
        attempt = get_object_or_404(QuizAttempt, id=attempt_id)
        
        session_attempts = request.session.get('quiz_attempts', {})
        if str(attempt.quiz.id) not in session_attempts or session_attempts[str(attempt.quiz.id)] != attempt.id:
            return JsonResponse({'error': 'Invalid attempt'}, status=403)
        
        attempt.answers_data[str(question_id)] = answer
        attempt.save()
        
        return JsonResponse({'status': 'saved'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@require_http_methods(["POST"])
def submit_quiz_api(request):
    """Submit quiz"""
    try:
        data = json.loads(request.body)
        attempt_id = data.get('attempt_id')
        
        attempt = get_object_or_404(QuizAttempt, id=attempt_id)
        
        session_attempts = request.session.get('quiz_attempts', {})
        if str(attempt.quiz.id) not in session_attempts or session_attempts[str(attempt.quiz.id)] != attempt.id:
            return JsonResponse({'error': 'Invalid attempt'}, status=403)
        
        attempt.is_completed = True
        attempt.completed_at = timezone.now()
        attempt.time_taken_seconds = int((attempt.completed_at - attempt.started_at).total_seconds())
        attempt.calculate_score()
        
        if str(attempt.quiz.id) in session_attempts:
            del session_attempts[str(attempt.quiz.id)]
            request.session['quiz_attempts'] = session_attempts
        
        return JsonResponse({
            'status': 'submitted',
            'redirect_url': f'/quizzes/{attempt.quiz.slug}/?mode=results&attempt={attempt.id}',
            'attempt_id': attempt.id
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@require_http_methods(["GET", "POST"])
def quiz_feedback_api(request, quiz_id):
    """Get or submit quiz feedback"""
    quiz = get_object_or_404(Quiz, id=quiz_id)
    
    if request.method == "GET":
        likes = cache.get(f'quiz_{quiz_id}_likes', 0)
        dislikes = cache.get(f'quiz_{quiz_id}_dislikes', 0)
        return JsonResponse({'likes': likes, 'dislikes': dislikes})
    
    try:
        data = json.loads(request.body)
        feedback_type = data.get('type')
        
        if feedback_type == 'like':
            cache.set(f'quiz_{quiz_id}_likes', cache.get(f'quiz_{quiz_id}_likes', 0) + 1)
        elif feedback_type == 'dislike':
            cache.set(f'quiz_{quiz_id}_dislikes', cache.get(f'quiz_{quiz_id}_dislikes', 0) + 1)
        
        likes = cache.get(f'quiz_{quiz_id}_likes', 0)
        dislikes = cache.get(f'quiz_{quiz_id}_dislikes', 0)
        
        return JsonResponse({'likes': likes, 'dislikes': dislikes, 'status': 'success'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


def get_comments(request, attempt_id):
    """Get all comments for the quiz"""
    attempt = get_object_or_404(QuizAttempt, id=attempt_id)
    quiz = attempt.quiz
    
    comments = QuizComment.objects.filter(quiz=quiz, parent=None)
    guest_session_id = request.session.get('guest_session_id')
    
    comments_data = []
    for comment in comments:
        is_owner = comment.is_guest and comment.guest_session_id == guest_session_id
        
        comment_data = {
            'id': comment.id,
            'text': comment.text,
            'user': comment.display_name,
            'is_guest': True,
            'created_at': comment.created_at.isoformat(),
            'updated_at': comment.updated_at.isoformat(),
            'is_edited': comment.is_edited,
            'is_owner': is_owner,
            'replies': []
        }
        
        for reply in comment.replies.all():
            reply_is_owner = reply.is_guest and reply.guest_session_id == guest_session_id
            
            comment_data['replies'].append({
                'id': reply.id,
                'text': reply.text,
                'user': reply.display_name,
                'is_guest': True,
                'created_at': reply.created_at.isoformat(),
                'updated_at': reply.updated_at.isoformat(),
                'is_edited': reply.is_edited,
                'is_owner': reply_is_owner,
            })
        
        comments_data.append(comment_data)
    
    return JsonResponse({'comments': comments_data})


@require_POST
def add_comment(request, attempt_id):
    """Add a new comment"""
    attempt = get_object_or_404(QuizAttempt, id=attempt_id)
    quiz = attempt.quiz
    text = request.POST.get('text', '').strip()
    parent_id = request.POST.get('parent_id')
    guest_name = request.POST.get('guest_name', '').strip()
    
    if not text:
        return JsonResponse({'error': 'Comment cannot be empty'}, status=400)
    
    if not guest_name:
        return JsonResponse({'error': 'Please enter your name to comment'}, status=400)
    
    session_id = request.session.get('guest_session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        request.session['guest_session_id'] = session_id
    
    comment_data = {
        'quiz': quiz,
        'attempt': attempt,
        'user': None,
        'guest_name': guest_name[:50],
        'guest_session_id': session_id,
        'text': text
    }
    
    if parent_id:
        parent = get_object_or_404(QuizComment, id=parent_id)
        comment_data['parent'] = parent
    
    comment = QuizComment.objects.create(**comment_data)
    
    return JsonResponse({
        'status': 'success',
        'comment': {
            'id': comment.id,
            'text': comment.text,
            'user': comment.display_name,
            'is_guest': True,
            'created_at': comment.created_at.isoformat(),
            'is_owner': True,
            'parent_id': parent_id
        }
    })


@require_POST
def edit_comment(request, comment_id):
    """Edit existing comment"""
    comment = get_object_or_404(QuizComment, id=comment_id)
    text = request.POST.get('text', '').strip()
    
    if not text:
        return JsonResponse({'error': 'Comment cannot be empty'}, status=400)
    
    session_id = request.session.get('guest_session_id')
    is_owner = comment.is_guest and comment.guest_session_id == session_id
    
    if not is_owner:
        return JsonResponse({'error': 'You can only edit your own comments'}, status=403)
    
    comment.text = text
    comment.is_edited = True
    comment.save()
    
    return JsonResponse({
        'status': 'success',
        'text': comment.text,
        'updated_at': comment.updated_at.strftime('%b %d, %Y at %H:%M')
    })


@require_POST
def delete_comment(request, comment_id):
    """Delete comment"""
    comment = get_object_or_404(QuizComment, id=comment_id)
    
    session_id = request.session.get('guest_session_id')
    is_owner = comment.is_guest and comment.guest_session_id == session_id
    
    if not is_owner:
        return JsonResponse({'error': 'You can only delete your own comments'}, status=403)
    
    comment.delete()
    return JsonResponse({'status': 'success'})