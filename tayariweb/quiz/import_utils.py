import pandas as pd
from django.core.exceptions import ValidationError
from .models import Question
import io


def import_questions_from_excel(quiz, excel_file):
    """
    Import questions from Excel file
    Expected columns: question_text, question_type, option_a, option_b, option_c, option_d, 
                      correct_option, correct_boolean, correct_text, explanation, order
    """
    try:
        # Handle different file types (UploadedFile, BytesIO, or file path)
        if isinstance(excel_file, io.BytesIO):
            # It's a BytesIO object (from admin)
            df = pd.read_excel(excel_file)
        elif hasattr(excel_file, 'read'):
            # It's an uploaded file - read into memory
            file_content = excel_file.read()
            df = pd.read_excel(io.BytesIO(file_content))
        else:
            # It's a file path
            df = pd.read_excel(excel_file)
        
        print(f"DEBUG IMPORT: Columns found: {list(df.columns)}")
        print(f"DEBUG IMPORT: Total rows: {len(df)}")
        print(f"DEBUG IMPORT: First few rows:\n{df.head()}")
        
    except Exception as e:
        raise ValidationError(f"Error reading Excel file: {str(e)}")
    
    # Strip whitespace from column names and convert to lowercase for matching
    df.columns = df.columns.str.strip().str.lower()
    
    print(f"DEBUG IMPORT: Normalized columns: {list(df.columns)}")
    
    required_columns = ['question_text', 'question_type']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValidationError(f"Missing required columns: {', '.join(missing_columns)}. Found: {list(df.columns)}")
    
    questions_created = 0
    errors = []
    
    # Drop completely empty rows
    df = df.dropna(how='all')
    
    print(f"DEBUG IMPORT: Processing {len(df)} rows after dropping empty ones")
    
    for index, row in df.iterrows():
        try:
            # Skip if question_text is empty/NaN
            if pd.isna(row.get('question_text')) or str(row.get('question_text')).strip() == '':
                errors.append(f"Row {index + 2}: Empty question_text")
                continue
            
            # Validate question type
            q_type = str(row.get('question_type', 'mcq')).lower().strip()
            if q_type not in ['mcq', 'true_false', 'short_answer']:
                errors.append(f"Row {index + 2}: Invalid question type '{q_type}'")
                continue
            
            # Create question data
            question_data = {
                'quiz': quiz,
                'question_text': str(row.get('question_text')).strip(),
                'question_type': q_type,
                'order': int(row.get('order', index + 1)) if pd.notna(row.get('order')) else index + 1,
                'is_active': True,
            }
            
            # Add explanation if present
            if 'explanation' in df.columns and pd.notna(row.get('explanation')):
                question_data['explanation'] = str(row.get('explanation')).strip()
            
            # Handle MCQ fields
            if q_type == 'mcq':
                question_data.update({
                    'option_a': str(row.get('option_a', '')).strip() if pd.notna(row.get('option_a')) else '',
                    'option_b': str(row.get('option_b', '')).strip() if pd.notna(row.get('option_b')) else '',
                    'option_c': str(row.get('option_c', '')).strip() if pd.notna(row.get('option_c')) else '',
                    'option_d': str(row.get('option_d', '')).strip() if pd.notna(row.get('option_d')) else '',
                    'correct_option': str(row.get('correct_option', '')).lower().strip() if pd.notna(row.get('correct_option')) else '',
                })
                
                # Validate correct_option
                if question_data['correct_option'] not in ['a', 'b', 'c', 'd']:
                    errors.append(f"Row {index + 2}: Invalid correct_option '{question_data['correct_option']}' for MCQ. Must be a, b, c, or d.")
                    continue
            
            # Handle True/False fields
            elif q_type == 'true_false':
                correct_val = str(row.get('correct_boolean', '')).lower().strip()
                if correct_val in ['true', '1', 'yes', 't']:
                    question_data['correct_boolean'] = True
                elif correct_val in ['false', '0', 'no', 'f']:
                    question_data['correct_boolean'] = False
                else:
                    errors.append(f"Row {index + 2}: Invalid correct_boolean '{correct_val}' for True/False. Use: true/false, yes/no, 1/0, or t/f")
                    continue
            
            # Handle Short Answer fields
            elif q_type == 'short_answer':
                if pd.notna(row.get('correct_text')):
                    question_data['correct_text'] = str(row.get('correct_text')).strip()
                else:
                    errors.append(f"Row {index + 2}: correct_text required for Short Answer")
                    continue
            
            # DEBUG: Print what we're about to create
            print(f"DEBUG IMPORT: Creating question {questions_created + 1}: {question_data['question_text'][:50]}...")
            
            # Create the question
            Question.objects.create(**question_data)
            questions_created += 1
            print(f"DEBUG IMPORT: ✓ Created successfully!")
            
        except Exception as e:
            errors.append(f"Row {index + 2}: {str(e)}")
            print(f"DEBUG IMPORT ERROR: Row {index + 2}: {str(e)}")
    
    print(f"DEBUG IMPORT: FINISHED - Total created: {questions_created}, Errors: {len(errors)}")
    return questions_created, errors