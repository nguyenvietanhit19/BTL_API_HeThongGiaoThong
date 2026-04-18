import jwt
import os
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

def can_access(vai_tro_cho_phep=[]):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):  #có thể nhận nhiều tham số (* là nhiều ts vị trí hay còn gọi là số) còn (** nhiều tham số kiểu key = value )
            token = None

            # Lấy token từ header Authorization: Bearer <token>
            if 'Authorization' in request.headers:
                parts = request.headers['Authorization'].split()
                if len(parts) == 2 and parts[0] == 'Bearer':
                    token = parts[1]

            if not token:
                return jsonify({'loi': 'Thiếu token'}), 401

            try:
                payload = jwt.decode(
                    token,
                    'day_la_secret_key_rat_dai_va_kho_doan_123456',
                    algorithms=['HS256']
                )
                request.nguoi_dung_id = payload['nguoi_dung_id']   #để dùng trong các api khác
                request.vai_tro = payload['vai_tro']    #để dùng trong các api khác
            except jwt.ExpiredSignatureError:
                return jsonify({'loi': 'Token đã hết hạn'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'loi': 'Token không hợp lệ'}), 401

            # Kiểm tra vai trò
            if vai_tro_cho_phep and request.vai_tro not in vai_tro_cho_phep:
                return jsonify({'loi': 'Không có quyền'}), 403

            return f(*args, **kwargs)
        return decorated
    return decorator