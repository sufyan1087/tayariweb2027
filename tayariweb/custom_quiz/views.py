# views.py - CUSTOM QUIZ REACT BACKEND
import json
import random
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.db.models import Count, Q
from .models import QuizCategory, QuizSubCategory, Question, QuizPageContent


class QuizGeneratorView(TemplateView):
    """Single entry point for React custom quiz app"""
    template_name = 'custom_quiz/custom_quiz_config.html'  # FIXED template name
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        page_key = self.kwargs.get('page_key', 'generator')
        category_slug = self.kwargs.get('slug')
        
        page_content = None
        selected_category_ids = []
        
        try:
            if category_slug:
                category = QuizCategory.objects.get(slug=category_slug, is_active=True)
                page_content = QuizPageContent.objects.filter(
                    categories=category,
                    is_active=True
                ).first()
                selected_category_ids = [category.id]
            else:
                page_content = QuizPageContent.objects.get(page_key=page_key, is_active=True)
                selected_category_ids = list(page_content.categories.values_list('id', flat=True))
        except (QuizPageContent.DoesNotExist, QuizCategory.DoesNotExist):
            page_content = QuizPageContent.objects.filter(is_active=True).first()
            if page_content:
                selected_category_ids = list(page_content.categories.values_list('id', flat=True))
        
        if not page_content:
            page_content = QuizPageContent()
        
        # Filter categories
        if selected_category_ids:
            categories = QuizCategory.objects.filter(
                id__in=selected_category_ids,
                is_active=True
            ).prefetch_related('subcategories')
        else:
            categories = QuizCategory.objects.filter(
                is_active=True
            ).prefetch_related('subcategories')
        
        # Build category data for React
        category_data = []
        for cat in categories:
            subcategories_data = []
            for sub in cat.subcategories.filter(is_active=True):
                question_count = Question.objects.filter(
                    subcategory=sub, 
                    is_active=True
                ).count()
                
                subcategories_data.append({
                    'name': sub.name,
                    'slug': sub.slug,
                    'question_count': question_count
                })
            
            if subcategories_data:
                total_questions = sum(s['question_count'] for s in subcategories_data)
                category_data.append({
                    'id': cat.id,
                    'name': cat.name,
                    'slug': cat.slug,
                    'description': cat.description,
                    'icon': cat.icon,
                    'total_questions': total_questions,
                    'subcategories': subcategories_data
                })
        
        context['categories'] = category_data
        context['categories_json'] = json.dumps(category_data)
        context['page_content'] = page_content
        context['total_questions_available'] = Question.objects.filter(is_active=True).count()
        context['quizzes_taken_today'] = "8,320"
        
        # SEO
        context['meta_title'] = getattr(page_content, 'meta_title', None) or getattr(page_content, 'heading', 'Custom Quiz Generator')
        context['meta_description'] = getattr(page_content, 'meta_description', '')
        context['meta_keywords'] = getattr(page_content, 'meta_keywords', '')
        context['canonical_url'] = getattr(page_content, 'canonical_url', '')
        
        return context


@method_decorator(csrf_exempt, name='dispatch')
class GenerateQuizAPI(View):
    """Generate quiz based on user preferences"""
    
    DIFFICULTY_PRESETS = {
        'balanced': {'easy': 33, 'medium': 33, 'hard': 34},
        'easy_focus': {'easy': 50, 'medium': 30, 'hard': 20},
        'medium_focus': {'easy': 25, 'medium': 50, 'hard': 25},
        'hard_focus': {'easy': 20, 'medium': 30, 'hard': 50},
        'exam_standard': {'easy': 25, 'medium': 50, 'hard': 25},
    }
    
    def post(self, request):
        try:
            body = request.body.decode('utf-8') if isinstance(request.body, bytes) else request.body
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            return JsonResponse({
                'success': False,
                'error': 'invalid_json',
                'message': f'Invalid JSON: {str(e)}'
            }, status=400)

        difficulty_raw = data.get('difficulty', 'balanced')
        if isinstance(difficulty_raw, str):
            difficulty = self.DIFFICULTY_PRESETS.get(difficulty_raw, self.DIFFICULTY_PRESETS['balanced'])
        elif isinstance(difficulty_raw, dict):
            difficulty = difficulty_raw
        else:
            difficulty = self.DIFFICULTY_PRESETS['balanced']

        config = {
            'main_category': data.get('mainCategory'),
            'sub_categories': data.get('subCategories', []),
            'topics': data.get('topics', []),
            'question_count': min(int(data.get('questionCount', 20)), 200),
            'time_limit': int(data.get('timeLimit', 10)),
            'difficulty': difficulty,
            'quiz_type': data.get('quizType', 'practice'),
            'negative_marking': data.get('negativeMarking', False),
            'random_order': data.get('randomOrder', True)
        }
        
        # Build query
        questions_query = Question.objects.filter(is_active=True)
        
        if config['main_category']:
            questions_query = questions_query.filter(
                subcategory__category__slug=config['main_category']
            )
        
        if config['sub_categories']:
            questions_query = questions_query.filter(
                subcategory__name__in=config['sub_categories']
            )
        
        if config['topics']:
            tag_filter = Q()
            for topic in config['topics']:
                tag_filter |= Q(tags__icontains=topic)
            questions_query = questions_query.filter(tag_filter)
        
        available_count = questions_query.count()
        requested_count = config['question_count']
        
        if available_count == 0:
            return JsonResponse({
                'success': False,
                'error': 'no_questions',
                'message': 'No questions found for your selection',
                'available_count': 0,
                'requested_count': requested_count
            }, status=400)
        
        if available_count < requested_count:
            return JsonResponse({
                'success': False,
                'error': 'insufficient_questions',
                'message': f'Only {available_count} questions available',
                'available_count': available_count,
                'requested_count': requested_count,
                'suggestion': 'Select more categories or reduce question count'
            }, status=400)
        
        # FIXED: Proper difficulty distribution sampling
        total = requested_count
        diff = config['difficulty']
        
        easy_target = max(0, int(total * diff['easy'] / 100))
        medium_target = max(0, int(total * diff['medium'] / 100))
        hard_target = max(0, total - easy_target - medium_target)
        
        easy_pool = list(questions_query.filter(difficulty='easy'))
        medium_pool = list(questions_query.filter(difficulty='medium'))
        hard_pool = list(questions_query.filter(difficulty='hard'))
        
        selected = []
        
        if easy_pool and easy_target > 0:
            selected.extend(random.sample(easy_pool, min(easy_target, len(easy_pool))))
        if medium_pool and medium_target > 0:
            selected.extend(random.sample(medium_pool, min(medium_target, len(medium_pool))))
        if hard_pool and hard_target > 0:
            selected.extend(random.sample(hard_pool, min(hard_target, len(hard_pool))))
        
        # Fill remaining from any available questions
        if len(selected) < total:
            existing_ids = [q.id for q in selected]
            remaining = list(questions_query.exclude(id__in=existing_ids)[:total - len(selected)])
            selected.extend(remaining)
        
        if config['random_order']:
            random.shuffle(selected)
        
        selected = selected[:total]
        
        # Build response
        questions_data = []
        for q in selected:
            questions_data.append({
                'id': q.id,
                'text': q.question_text,
                'options': q.get_options(),
                'correct': q.correct_answer,
                'explanation': q.explanation,
                'difficulty': q.difficulty,
                'subcategory': q.subcategory.name,
                'category': q.subcategory.category.name
            })
        
        return JsonResponse({
            'success': True,
            'quiz_id': f"quiz_{random.randint(10000, 99999)}",
            'questions': questions_data,
            'config': config,
            'total_available': available_count
        })


@method_decorator(csrf_exempt, name='dispatch')
class CheckAvailabilityAPI(View):
    def post(self, request):
        data = json.loads(request.body)
        main_category = data.get('mainCategory')
        sub_categories = data.get('subCategories', [])
        
        query = Question.objects.filter(is_active=True)
        
        if main_category:
            query = query.filter(subcategory__category__slug=main_category)
        if sub_categories:
            query = query.filter(subcategory__name__in=sub_categories)
        
        count = query.count()
        
        breakdown = list(query.values('subcategory__name').annotate(
            count=Count('id')
        ).order_by('-count'))
        
        return JsonResponse({
            'available_count': count,
            'breakdown': breakdown
        })


@method_decorator(csrf_exempt, name='dispatch')
class GetTopicsAPI(View):
    def get(self, request):
        query = request.GET.get('q', '').lower()
        if len(query) < 2:
            return JsonResponse({'topics': []})
        
        questions = Question.objects.filter(tags__icontains=query, is_active=True)[:10]
        topics = set()
        for q in questions:
            for tag in q.tags.split(','):
                tag_clean = tag.strip()
                if query in tag_clean.lower():
                    topics.add(tag_clean)
        
        return JsonResponse({'topics': list(topics)[:8]})