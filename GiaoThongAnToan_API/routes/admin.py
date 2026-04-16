from flask import Blueprint, request, jsonify
from db import get_db
import pyodbc
from .auth import can_access

admin_bp = Blueprint('admin_bp', __name__)

# =========================================
# 1. XEM BÁO CÁO
# =========================================
@admin_bp.route('/bao-cao', methods=['GET'])
@can_access(['admin'])
def get_all_reports():
    trang_thai = request.args.get('trang_thai')

    conn = get_db()
    cursor = conn.cursor()

    #Dùng View thay vì Bảng gốc
    query = "SELECT * FROM v_bao_cao_day_du"
    params = []

    if trang_thai:
        query += " WHERE trang_thai = ?"
        params.append(trang_thai)
        
    # Thêm sắp xếp để báo cáo mới nhất luôn nằm trên cùng
    query += " ORDER BY ngay_cap_nhat DESC"

    cursor.execute(query, params)

    reports = [
        dict(zip([col[0] for col in cursor.description], row))
        for row in cursor.fetchall()
    ]

    cursor.close()
    conn.close()

    return jsonify(reports)

# =========================================
# 2. DUYỆT BÁO CÁO
# cho_duyet -> da_duyet
# =========================================
@admin_bp.route('/bao-cao/<int:id>/duyet', methods=['PUT'])
@can_access(['admin'])
def duyet_bao_cao(id):

    admin_id = request.nguoi_dung_id

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )

        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        if row[0] != 'cho_duyet':
            return jsonify({"error": "Chỉ duyệt báo cáo đang chờ duyệt"}), 400

        cursor.execute(
            "UPDATE bao_cao SET trang_thai = 'da_duyet' WHERE bao_cao_id = ?",
            (id,)
        )

        cursor.execute(
            """
            INSERT INTO lich_su_trang_thai
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi)
            VALUES (?, ?, 'cho_duyet', 'da_duyet')
            """,
            (id, admin_id)
        )

        conn.commit()

        return jsonify({"message": "Duyệt báo cáo thành công"})

    except Exception as e:

        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()


# =========================================
# 3. TỪ CHỐI BÁO CÁO
# cho_duyet -> tu_choi
# =========================================
@admin_bp.route('/bao-cao/<int:id>/tu-choi', methods=['PUT'])
@can_access(['admin'])
def tu_choi_bao_cao(id):
    data = request.json or {}
    ghi_chu = data.get('ghi_chu', '')

    admin_id = request.nguoi_dung_id

    # basic validation
    if not isinstance(ghi_chu, str):
        return jsonify({"error": "ghi_chu phải là chuỗi"}), 400

    ghi_chu = ghi_chu.strip()

    if not ghi_chu:
        return jsonify({"error": "Thiếu lý do từ chối (ghi_chu)"}), 400

    if len(ghi_chu) > 500:
        return jsonify({"error": "Lý do quá dài (tối đa 500 ký tự)"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )

        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        if row[0] != 'cho_duyet':
            return jsonify({"error": "Chỉ từ chối báo cáo đang chờ duyệt"}), 400

        cursor.execute(
            "UPDATE bao_cao SET trang_thai = 'tu_choi' WHERE bao_cao_id = ?",
            (id,)
        )

        cursor.execute(
            """
            INSERT INTO lich_su_trang_thai
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'cho_duyet', 'tu_choi', ?)
            """,
            (id, admin_id, ghi_chu)
        )

        conn.commit()

        return jsonify({"message": "Đã từ chối báo cáo"})

    except Exception as e:

        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()


# =========================================
# 4. PHÂN CÔNG NHÂN VIÊN
# da_duyet -> da_phan_cong
# =========================================
@admin_bp.route('/bao-cao/<int:id>/phan-cong', methods=['POST'])
@can_access(['admin'])
def phan_cong(id):

    data = request.json
    nhan_vien_id = data.get('nhan_vien_id')

    admin_id = request.nguoi_dung_id

    if not nhan_vien_id:
        return jsonify({"error": "Thiếu nhan_vien_id"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:

        # kiểm tra báo cáo
        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )

        bc = cursor.fetchone()

        if not bc:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        if bc[0] != 'da_duyet':
            return jsonify({"error": "Chỉ phân công báo cáo đã duyệt"}), 400

        # kiểm tra nhân viên
        cursor.execute(
            "SELECT vai_tro, bi_dinh_chi FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (nhan_vien_id,)
        )

        nv = cursor.fetchone()

        if not nv:
            return jsonify({"error": "Nhân viên không tồn tại"}), 404

        if nv[0] != 'nhan_vien':
            return jsonify({"error": "Chỉ phân công cho nhân viên"}), 400

        if nv[1]:
            return jsonify({"error": "Nhân viên bị đình chỉ"}), 403

        # số lần phân công
        cursor.execute(
            "SELECT COUNT(*) FROM phan_cong WHERE bao_cao_id = ?",
            (id,)
        )

        lan_thu = cursor.fetchone()[0] + 1

        cursor.execute(
            """
            INSERT INTO phan_cong (bao_cao_id, nhan_vien_id, lan_thu, trang_thai)
            VALUES (?, ?, ?, 'dang_lam')
            """,
            (id, nhan_vien_id, lan_thu)
        )

        cursor.execute(
            """
            UPDATE bao_cao
            SET nhan_vien_id = ?, trang_thai = 'da_phan_cong'
            WHERE bao_cao_id = ?
            """,
            (nhan_vien_id, id)
        )

        cursor.execute(
            """
            INSERT INTO lich_su_trang_thai
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'da_duyet', 'da_phan_cong', N'Phân công nhân viên')
            """,
            (id, admin_id)
        )

        conn.commit()

        return jsonify({"message": "Phân công thành công"})

    except Exception as e:

        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()


# =========================================
# 5. NGHIỆM THU
# cho_nghiem_thu -> da_xu_ly
# cho_nghiem_thu -> dang_xu_ly
# =========================================
@admin_bp.route('/bao-cao/<int:id>/nghiem-thu', methods=['PUT'])
@can_access(['admin'])
def nghiem_thu(id):

    data = request.json
    ket_qua = data.get('ket_qua')

    admin_id = request.nguoi_dung_id

    if ket_qua not in ['dat', 'khong_dat']:
        return jsonify({"error": "ket_qua phải là dat hoặc khong_dat"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )

        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        if row[0] != 'cho_nghiem_thu':
            return jsonify({"error": "Chỉ nghiệm thu khi đang chờ nghiệm thu"}), 400

        # đạt
        if ket_qua == 'dat':

            cursor.execute(
                "UPDATE bao_cao SET trang_thai = 'da_xu_ly' WHERE bao_cao_id = ?",
                (id,)
            )

            cursor.execute(
                """
                INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi)
                VALUES (?, ?, 'cho_nghiem_thu', 'da_xu_ly')
                """,
                (id, admin_id)
            )

        # không đạt
        else:

            cursor.execute(
                "UPDATE bao_cao SET trang_thai = 'dang_xu_ly' WHERE bao_cao_id = ?",
                (id,)
            )

            cursor.execute(
                """
                INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
                VALUES (?, ?, 'cho_nghiem_thu', 'dang_xu_ly', N'Nghiệm thu không đạt')
                """,
                (id, admin_id)
            )

        conn.commit()

        return jsonify({"message": "Nghiệm thu thành công"})

    except Exception as e:

        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()