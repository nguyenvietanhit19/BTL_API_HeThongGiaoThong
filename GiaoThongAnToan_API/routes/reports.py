from flask import Blueprint, request, jsonify
from db import get_db

# Tạo một Blueprint cho phần Báo cáo
reports_bp = Blueprint('reports', __name__)


# 1. API Lấy danh sách Loại sự cố
# 1. API Lấy danh sách Loại sự cố
@reports_bp.route('/loai-su-co', methods=['GET'])
def get_loai_su_co():
    conn = get_db()
    cursor = conn.cursor()
    try:
        # THAY ĐỔI: Sửa 'id' thành 'loai_su_co_id' trong câu query
        cursor.execute("SELECT loai_su_co_id, ten, mau_sac, bieu_tuong FROM loai_su_co")
        rows = cursor.fetchall()

        result = []
        for row in rows:
            result.append({
                "id": row[0],  # Vẫn map vào key "id" để JSON trả ra cho Frontend dễ dùng
                "ten": row[1],
                "mau_sac": row[2],
                "bieu_tuong": row[3]
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()


# 2. API Gửi báo cáo mới
@reports_bp.route('/gui-bao-cao', methods=['POST'])
def gui_bao_cao():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    try:
        # THAY ĐỔI: Sửa 'loai_id' thành 'loai_su_co_id'
        query = """
            INSERT INTO bao_cao (nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do, trang_thai, ngay_tao, ngay_cap_nhat)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_duyet', GETDATE(), GETDATE())
        """
        cursor.execute(query, (
            data['nguoi_dung_id'],
            data['loai_su_co_id'], # Đổi key json khớp với DB
            data['tieu_de'],
            data.get('mo_ta'),
            data.get('dia_chi'),
            data['vi_do'],
            data['kinh_do']
        ))
        conn.commit()
        return jsonify({"message": "Gửi báo cáo thành công!"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()


# 3. API Xem lịch sử báo cáo cá nhân
@reports_bp.route('/lich-su/<int:user_id>', methods=['GET'])
def get_lich_su(user_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        # THAY ĐỔI: b.id -> b.bao_cao_id | b.loai_id -> b.loai_su_co_id | l.id -> l.loai_su_co_id
        query = """
            SELECT b.bao_cao_id, b.tieu_de, b.dia_chi, b.trang_thai, b.ngay_tao, l.ten, l.mau_sac
            FROM bao_cao b
            JOIN loai_su_co l ON b.loai_su_co_id = l.loai_su_co_id
            WHERE b.nguoi_dung_id = ?
            ORDER BY b.ngay_tao DESC
        """
        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()

        result = []
        for row in rows:
            result.append({
                "id": row[0], # Map bao_cao_id ra thành key 'id' cho JSON
                "tieu_de": row[1],
                "dia_chi": row[2],
                "trang_thai": row[3],
                "ngay_tao": row[4].strftime("%Y-%m-%d %H:%M:%S") if row[4] else None,
                "ten_loai_su_co": row[5],
                "mau_sac_hien_thi": row[6]
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        conn.close()