import os
from functools import wraps

import jwt
from dotenv import load_dotenv
from flask import jsonify, request

from db import get_db

load_dotenv()


def can_access(vai_tro_cho_phep=None):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            allowed_roles = vai_tro_cho_phep or []

            if 'Authorization' in request.headers:
                parts = request.headers['Authorization'].split()
                if len(parts) == 2 and parts[0] == 'Bearer':
                    token = parts[1]

            if not token:
                return jsonify({'loi': 'Thiếu token'}), 401

            try:
                payload = jwt.decode(
                    token,
                    os.getenv('JWT_SECRET_KEY'),
                    algorithms=['HS256']
                )
                request.nguoi_dung_id = payload['nguoi_dung_id']
            except jwt.ExpiredSignatureError:
                return jsonify({'loi': 'Token đã hết hạn'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'loi': 'Token không hợp lệ'}), 401

            conn = None
            try:
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT vai_tro, dang_hoat_dong, ISNULL(bi_dinh_chi, 0)
                    FROM nguoi_dung
                    WHERE nguoi_dung_id = ?
                    """,
                    (request.nguoi_dung_id,)
                )
                row = cursor.fetchone()
            except Exception:
                return jsonify({'loi': 'Không thể xác thực trạng thái tài khoản'}), 500
            finally:
                if conn:
                    conn.close()

            if not row:
                return jsonify({'loi': 'Tài khoản không tồn tại'}), 401

            vai_tro_hien_tai, dang_hoat_dong, bi_dinh_chi = row
            request.vai_tro = vai_tro_hien_tai

            if not dang_hoat_dong:
                return jsonify({'loi': 'Tài khoản đã bị khóa'}), 403

            if vai_tro_hien_tai == 'nhan_vien' and bi_dinh_chi:
                return jsonify({'loi': 'Tài khoản nhân viên đang bị đình chỉ'}), 403

            if allowed_roles and request.vai_tro not in allowed_roles:
                return jsonify({'loi': 'Không có quyền'}), 403

            return f(*args, **kwargs)

        return decorated

    return decorator
