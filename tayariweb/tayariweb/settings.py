from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-change-this-in-production'

DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Local apps
    'website.apps.WebsiteConfig',
    'quiz.apps.QuizConfig',
    'custom_quiz',
    'ckeditor',
    'ckeditor_uploader',
    'django_ckeditor_5',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'tayariweb.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'tayariweb.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

import os
from pathlib import Path

# BASE_DIR should be project root (where manage.py is)
BASE_DIR = Path(__file__).resolve().parent.parent

# Static files
STATIC_URL = '/static/'

# Where Django looks for static files during development
STATICFILES_DIRS = [
    BASE_DIR / 'static',  # ← Correct: project root / static
]

# Where collectstatic copies files for production
STATIC_ROOT = BASE_DIR / 'staticfiles'

# CKEditor Configuration
CKEDITOR_UPLOAD_PATH = "uploads/"
CKEDITOR_IMAGE_BACKEND = "pillow"

CKEDITOR_CONFIGS = {
    'default': {
        'toolbar': 'full',
        'height': 300,
        'width': '100%',
    },
    'basic': {
        'toolbar': [
            ['Bold', 'Italic', 'Underline'],
            ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent'],
            ['Link', 'Unlink'],
            ['RemoveFormat', 'Source']
        ],
        'height': 200,
        'width': '100%',
    },
}
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# CKEditor 5 Configuration with Source Editing
CKEDITOR_5_CONFIGS = {
    'default': {
        'toolbar': [
            'heading', '|', 'bold', 'italic', 'link', 'bulletedList', 'numberedList',
            '|', 'outdent', 'indent', '|', 'imageUpload', 'blockQuote', 'insertTable',
            'mediaEmbed', 'codeBlock', '|', 'sourceEditing', '|', 'undo', 'redo'
        ],
        'height': '300px',
        'width': 'auto',
        'language': 'en',
    },
        'full': {
        'toolbar': [
            'heading', '|', 
            'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', '|',
            'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor', 'highlight', '|',
            'alignment', '|',
            'bulletedList', 'numberedList', 'todoList', '|',
            'outdent', 'indent', '|',
            'link', 'imageUpload', 'blockQuote', 'insertTable', 'mediaEmbed', 'codeBlock', 'htmlEmbed', '|',
            'sourceEditing', '|',
            'undo', 'redo', 'findAndReplace', 'selectAll'
        ],
        'height': '400px',
        'width': 'auto',
        'language': 'en',
    },
        'minimal': {
        'toolbar': ['bold', 'italic', 'link', 'bulletedList', 'numberedList', 'sourceEditing'],
        'height': '200px',
        'language': 'en',
    }
}

# Media settings for image uploads
CKEDITOR_5_FILE_STORAGE = "django.core.files.storage.FileSystemStorage"
CKEDITOR_5_UPLOAD_PATH = "/uploads/"
CKEDITOR_5_UPLOAD_FILE_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'pdf', 'doc', 'docx']

# Ensure these are set
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

STATIC_URL = '/static/'

STATICFILES_DIRS = [
    BASE_DIR / 'static',
    BASE_DIR.parent / 'static',  # ← Add this
]

STATIC_ROOT = BASE_DIR / 'staticfiles'

# Cache control for development
if DEBUG:
    from django.conf.urls.static import static
    from django.contrib.staticfiles.views import serve as staticfiles_serve
    
    # Disable caching in development
    import mimetypes
    mimetypes.add_type("text/css", ".css", True)