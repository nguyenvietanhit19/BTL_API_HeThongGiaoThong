import datetime
import os
import random

import bcrypt
import jwt
from flask import Blueprint, jsonify, request

from db import get_db
from middleware.auth_middleware import can_access
from routes.quen_mat_khau import gui_mail

auth_bp = Blueprint('auth', __name__)


# ==========================================
# BƯỚC 1: GỬI MÃ XÁC NHẬN EMAIL TRƯỚC KHI ĐĂNG KÝ
# POST /auth/gui-ma-dang-ky
# ==========================================
@auth_bp.route('/gui-ma-dang-ky', methods=['POST'])
def gui_ma_dang_ky():
    data = request.get_json()
    email = data.get('email', '').strip()
    mat_khau = data.get('mat_khau', '')
    ho_ten = data.get('ho_ten', '').strip()

    if not email or not mat_khau or not ho_ten:
        return jsonify({'loi': 'Thiếu thông tin (email, mat_khau, ho_ten)'}), 400

    if len(mat_khau) < 6:
        return jsonify({'loi': 'Mật khẩu phải có ít nhất 6 ký tự'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, dang_hoat_dong, da_xac_nhan FROM nguoi_dung WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()

        if row:
            nguoi_dung_id, dang_hoat_dong, da_xac_nhan = row

            if da_xac_nhan:
                return jsonify({'loi': 'Email đã được đăng ký'}), 409

            ma = str(random.randint(100000, 999999))
            het_han = datetime.datetime.now() + datetime.timedelta(minutes=1)
            hash_mk = bcrypt.hashpw(mat_khau.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            cursor.execute(
                """UPDATE nguoi_dung
                   SET ho_ten = ?, mat_khau = ?, ma_xac_nhan = ?, ma_het_han = ?
                   WHERE nguoi_dung_id = ?""",
                (ho_ten, hash_mk, ma, het_han, nguoi_dung_id)
            )
            conn.commit()
        else:
            ma = str(random.randint(100000, 999999))
            het_han = datetime.datetime.now() + datetime.timedelta(minutes=10)
            hash_mk = bcrypt.hashpw(mat_khau.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            cursor.execute(
                """INSERT INTO nguoi_dung
                   (email, mat_khau, ho_ten, da_xac_nhan, ma_xac_nhan, ma_het_han)
                   VALUES (?, ?, ?, 0, ?, ?)""",
                (email, hash_mk, ho_ten, ma, het_han)
            )
            conn.commit()

        thanh_cong = gui_mail(email, ma, tieu_de='Mã xác nhận đăng ký tài khoản')
        if not thanh_cong:
            return jsonify({'loi': 'Không thể gửi email, thử lại sau'}), 500

        return jsonify({'thong_bao': 'Mã xác nhận đã gửi về email, có hiệu lực 10 phút'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ==========================================
# BƯỚC 2: XÁC NHẬN MÃ -> KÍCH HOẠT TÀI KHOẢN
# POST /auth/dang-ky
# ==========================================
@auth_bp.route('/dang-ky', methods=['POST'])
def dang_ky():
    data = request.get_json()
    email = data.get('email', '').strip()
    ma_xac_nhan = data.get('ma_xac_nhan', '').strip()

    if not email or not ma_xac_nhan:
        return jsonify({'loi': 'Thiếu email hoặc mã xác nhận'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, dang_hoat_dong, da_xac_nhan, ma_xac_nhan, ma_het_han FROM nguoi_dung WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Email không tồn tại, vui lòng gửi mã trước'}), 404

        nguoi_dung_id, dang_hoat_dong, da_xac_nhan, ma_luu, het_han = row

        if da_xac_nhan:
            return jsonify({'loi': 'Tài khoản đã được kích hoạt, vui lòng đăng nhập'}), 409

        if not ma_luu:
            return jsonify({'loi': 'Chưa yêu cầu gửi mã, vui lòng thực hiện bước 1'}), 400

        if ma_xac_nhan != ma_luu:
            return jsonify({'loi': 'Mã xác nhận không đúng'}), 400

        if datetime.datetime.now() > het_han:
            cursor.execute(
                "UPDATE nguoi_dung SET ma_xac_nhan = NULL, ma_het_han = NULL WHERE nguoi_dung_id = ?",
                (nguoi_dung_id,)
            )
            conn.commit()
            return jsonify({'loi': 'Mã đã hết hạn, vui lòng yêu cầu mã mới'}), 400

        cursor.execute(
            """UPDATE nguoi_dung
               SET dang_hoat_dong = 1, da_xac_nhan = 1,
                   ma_xac_nhan = NULL, ma_het_han = NULL
               WHERE nguoi_dung_id = ?""",
            (nguoi_dung_id,)
        )
        conn.commit()

        return jsonify({'thong_bao': 'Đăng ký thành công, vui lòng đăng nhập'}), 201

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# POST /auth/dang-nhap
@auth_bp.route('/dang-nhap', methods=['POST'])
def dang_nhap():
    data = request.get_json()
    email = data.get('email', '')
    mat_khau = data.get('mat_khau', '')

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT nguoi_dung_id, mat_khau, ho_ten, vai_tro,
                   dang_hoat_dong, da_xac_nhan, ISNULL(bi_dinh_chi, 0), last_seen_id
            FROM nguoi_dung
            WHERE email = ?
            """,
            (email,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Email hoặc mật khẩu sai'}), 401

        nguoi_dung_id, hash_mk, ho_ten, vai_tro, dang_hoat_dong, da_xac_nhan, bi_dinh_chi, last_seen_id = row   #last_seen_id để lưu lịch sử trạng thái mới nhất mà người dùng này đã xem

        if not da_xac_nhan:
            return jsonify({'loi': 'Tài khoản chưa xác nhận'}), 403

        if not dang_hoat_dong:
            return jsonify({'loi': 'Tài khoản đã bị khóa'}), 403

        if vai_tro == 'nhan_vien' and bi_dinh_chi:
            return jsonify({'loi': 'Tài khoản nhân viên đang bị đình chỉ'}), 403

        if not bcrypt.checkpw(mat_khau.encode('utf-8'), hash_mk.encode('utf-8')):
            return jsonify({'loi': 'Email hoặc mật khẩu sai'}), 401

        token = jwt.encode({
            'nguoi_dung_id': nguoi_dung_id,
            'vai_tro': vai_tro,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }, os.getenv('JWT_SECRET_KEY'), algorithm='HS256')

        return jsonify({
            'token': token,
            'ho_ten': ho_ten,
            'vai_tro': vai_tro,
            'last_seen_id': last_seen_id or 0  # Trả về để Frontend lưu vào localStorage
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


# PUT /auth/doi-mat-khau
@auth_bp.route('/doi-mat-khau', methods=['PUT'])
@can_access()
def doi_mat_khau():
    data = request.get_json() or {}
    mat_khau_cu = data.get('mat_khau_cu', '')
    mat_khau_moi = data.get('mat_khau_moi', '')

    if not mat_khau_cu or not mat_khau_moi:
        return jsonify({'loi': 'Thiếu mật khẩu cũ hoặc mật khẩu mới'}), 400

    if len(mat_khau_moi) < 6:
        return jsonify({'loi': 'Mật khẩu mới phải có ít nhất 6 ký tự'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT mat_khau FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (request.nguoi_dung_id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tìm thấy tài khoản'}), 404

        hash_mk = row[0]
        if not bcrypt.checkpw(mat_khau_cu.encode('utf-8'), hash_mk.encode('utf-8')):
            return jsonify({'loi': 'Mật khẩu cũ không đúng'}), 400

        hash_moi = bcrypt.hashpw(mat_khau_moi.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute(
            "UPDATE nguoi_dung SET mat_khau = ? WHERE nguoi_dung_id = ?",
            (hash_moi, request.nguoi_dung_id)
        )
        conn.commit()
        return jsonify({'thong_bao': 'Đổi mật khẩu thành công'}), 200
    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()
