"""
Main URL configuration for tayariweb.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('website.urls', namespace='website')),
    path('quizzes/', include('quiz.urls')), 
    path('custom-quiz/', include('custom_quiz.urls', namespace='custom_quiz')),
    path('ckeditor/', include('ckeditor_uploader.urls')), 
    path("ckeditor5/", include('django_ckeditor_5.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)