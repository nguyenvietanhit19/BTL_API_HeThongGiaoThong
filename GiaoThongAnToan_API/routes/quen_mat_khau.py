from flask import Blueprint, request, jsonify
from db import get_db
import bcrypt
import random
import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

qmk_bp = Blueprint('quen_mat_khau', __name__)


def gui_mail(den, ma_xac_nhan):
    """Gửi email chứa mã xác nhận"""
    try:
        email_gui = os.getenv('MAIL_EMAIL')
        mat_khau_app = os.getenv('MAIL_PASSWORD')

        msg = MIMEMultipart()
        msg['From']    = email_gui
        msg['To']      = den
        msg['Subject'] = 'Mã xác nhận đặt lại mật khẩu'

        noi_dung = f"""
        <h2>Hệ thống Báo cáo Sự cố Giao thông</h2>
        <p>Bạn đã yêu cầu đặt lại mật khẩu.</p>
        <p>Mã xác nhận của bạn là:</p>
        <h1 style="color: #E24B4A; letter-spacing: 8px;">{ma_xac_nhan}</h1>
        <p>Mã có hiệu lực trong <strong>10 phút</strong>.</p>
        <p>Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>
        """

        msg.attach(MIMEText(noi_dung, 'html'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(email_gui, mat_khau_app)
        server.send_message(msg)
        server.quit()

        return True
    except Exception as e:
        print(f"Lỗi gửi mail: {e}")
        return False


# ==========================================
# 1. GỬI MÃ XÁC NHẬN
# POST /auth/quen-mat-khau
# ==========================================
@qmk_bp.route('/quen-mat-khau', methods=['POST'])
def quen_mat_khau():
    data = request.get_json()
    email = data.get('email', '').strip()

    if not email:
        return jsonify({'loi': 'Thiếu email'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Kiểm tra email tồn tại
        cursor.execute(
            "SELECT nguoi_dung_id, ho_ten FROM nguoi_dung WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()

        if not row:
            # Trả về thành công để tránh lộ thông tin email có tồn tại không
            return jsonify({'thong_bao': 'Nếu email tồn tại, mã xác nhận sẽ được gửi'}), 200

        nguoi_dung_id, ho_ten = row

        # Tạo mã 6 số ngẫu nhiên
        ma = str(random.randint(100000, 999999))

        # Thời gian hết hạn = hiện tại + 10 phút
        het_han = datetime.datetime.now() + datetime.timedelta(minutes=10)

        # Lưu mã vào DB
        cursor.execute(
            "UPDATE nguoi_dung SET ma_xac_nhan = ?, ma_het_han = ? WHERE nguoi_dung_id = ?",
            (ma, het_han, nguoi_dung_id)
        )
        conn.commit()

        # Gửi mail
        thanh_cong = gui_mail(email, ma)
        if not thanh_cong:
            return jsonify({'loi': 'Không thể gửi email, thử lại sau'}), 500

        return jsonify({'thong_bao': 'Mã xác nhận đã được gửi về email của bạn'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ==========================================
# 2. XÁC NHẬN MÃ VÀ ĐỔI MẬT KHẨU
# POST /auth/dat-lai-mat-khau
# ==========================================
@qmk_bp.route('/dat-lai-mat-khau', methods=['POST'])
def dat_lai_mat_khau():
    data = request.get_json()
    email        = data.get('email', '').strip()
    ma_xac_nhan  = data.get('ma_xac_nhan', '').strip()
    mat_khau_moi = data.get('mat_khau_moi', '')

    if not email or not ma_xac_nhan or not mat_khau_moi:
        return jsonify({'loi': 'Thiếu thông tin (email, ma_xac_nhan, mat_khau_moi)'}), 400

    if len(mat_khau_moi) < 6:
        return jsonify({'loi': 'Mật khẩu mới phải có ít nhất 6 ký tự'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, ma_xac_nhan, ma_het_han FROM nguoi_dung WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Email không tồn tại'}), 404

        nguoi_dung_id, ma_luu, het_han = row

        # Kiểm tra mã có tồn tại không
        if not ma_luu:
            return jsonify({'loi': 'Chưa yêu cầu đặt lại mật khẩu'}), 400

        # Kiểm tra mã có đúng không
        if ma_xac_nhan != ma_luu:
            return jsonify({'loi': 'Mã xác nhận không đúng'}), 400

        # Kiểm tra mã có hết hạn không
        if datetime.datetime.now() > het_han:
            # Xóa mã hết hạn
            cursor.execute(
                "UPDATE nguoi_dung SET ma_xac_nhan = NULL, ma_het_han = NULL WHERE nguoi_dung_id = ?",
                (nguoi_dung_id,)
            )
            conn.commit()
            return jsonify({'loi': 'Mã xác nhận đã hết hạn, vui lòng yêu cầu mã mới'}), 400

        # Hash mật khẩu mới
        hash_mk = bcrypt.hashpw(mat_khau_moi.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Cập nhật mật khẩu mới + xóa mã xác nhận
        cursor.execute(
            """UPDATE nguoi_dung
               SET mat_khau = ?, ma_xac_nhan = NULL, ma_het_han = NULL
               WHERE nguoi_dung_id = ?""",
            (hash_mk, nguoi_dung_id)
        )
        conn.commit()

        return jsonify({'thong_bao': 'Đổi mật khẩu thành công, vui lòng đăng nhập lại'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()