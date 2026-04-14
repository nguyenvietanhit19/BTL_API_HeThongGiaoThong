from flask import Blueprint, request, jsonify
import bcrypt
import jwt
import os
import datetime
from db import get_db
from middleware.auth_middleware import can_access

auth_bp = Blueprint('auth', __name__)


# POST /auth/dang-ky
@auth_bp.route('/dang-ky', methods=['POST'])
def dang_ky():
    data = request.get_json()
    email    = data.get('email', '').strip()
    mat_khau = data.get('mat_khau', '')
    ho_ten   = data.get('ho_ten', '').strip()

    if not email or not mat_khau or not ho_ten:
        return jsonify({'loi': 'Thiếu thông tin'}), 400

    hash_mk = bcrypt.hashpw(mat_khau.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO nguoi_dung (email, mat_khau, ho_ten) VALUES (?, ?, ?)",
            (email, hash_mk, ho_ten)
        )
        conn.commit()
        return jsonify({'thong_bao': 'Đăng ký thành công'}), 201
    except Exception as e:
        if 'UNIQUE' in str(e) or 'unique' in str(e):
            return jsonify({'loi': 'Email đã tồn tại'}), 409
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# POST /auth/dang-nhap
@auth_bp.route('/dang-nhap', methods=['POST'])
def dang_nhap():
    data = request.get_json()
    email    = data.get('email', '')
    mat_khau = data.get('mat_khau', '')

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT nguoi_dung_id, mat_khau, ho_ten, vai_tro, dang_hoat_dong FROM nguoi_dung WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Email hoặc mật khẩu sai'}), 401

        nguoi_dung_id, hash_mk, ho_ten, vai_tro, dang_hoat_dong = row

        if not dang_hoat_dong:
            return jsonify({'loi': 'Tài khoản đã bị khoá'}), 403

        if not bcrypt.checkpw(mat_khau.encode('utf-8'), hash_mk.encode('utf-8')):
            return jsonify({'loi': 'Email hoặc mật khẩu sai'}), 401

        SECRET_KEY = "abc123"

        token = jwt.encode({
            'nguoi_dung_id': nguoi_dung_id,
            'vai_tro': vai_tro,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }, SECRET_KEY, algorithm='HS256')
        #
        # token = jwt.encode({
        #     'nguoi_dung_id': id,
        #     'vai_tro': vai_tro,
        #     'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
        # }, os.getenv('JWT_SECRET_KEY'), algorithm='HS256')

        return jsonify({
            'token': token,
            'ho_ten': ho_ten,
            'vai_tro': vai_tro
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# GET /auth/toi
@auth_bp.route('/toi', methods=['GET'])
@can_access()
def xem_thong_tin():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT nguoi_dung_id, email, ho_ten, vai_tro, ngay_tao FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (request.nguoi_dung_id,)
        )
        row = cursor.fetchone()
        col = [d[0] for d in cursor.description]
        return jsonify(dict(zip(col, row))), 200
    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# PUT /auth/toi
@auth_bp.route('/toi', methods=['PUT'])
@can_access()
def cap_nhat_thong_tin():
    data = request.get_json()
    ho_ten = data.get('ho_ten', '').strip()

    if not ho_ten:
        return jsonify({'loi': 'Thiếu họ tên'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE nguoi_dung SET ho_ten = ? WHERE nguoi_dung_id = ?",
            (ho_ten, request.nguoi_dung_id)
        )
        conn.commit()
        return jsonify({'thong_bao': 'Cập nhật thành công'}), 200
    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()