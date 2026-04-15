from flask import Blueprint, request, jsonify
from db import get_db
import pyodbc
admin_bp = Blueprint('admin_bp', __name__)

# 1. Xem báo cáo
@admin_bp.route('/bao-cao', methods=['GET'])
def get_all_reports():
    trang_thai = request.args.get('trang_thai')
    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM bao_cao"
    params = []

    if trang_thai:
        query += " WHERE trang_thai = ?"
        params.append(trang_thai)

    cursor.execute(query, params)
    reports = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]

    cursor.close()
    conn.close()
    return jsonify(reports)

#2. thay đỏi trạng thái báo cáo
@admin_bp.route('/bao-cao/<int:id>/trang-thai', methods=['PUT'])
def cap_nhat_trang_thai(id):
    if not request.is_json:
        return jsonify({"error": "Missing JSON"}), 400

    data = request.json
    trang_thai_moi = data.get('trang_thai')
    nguoi_doi_id = data.get('nguoi_doi_id')

    if not trang_thai_moi:
        return jsonify({"error": "Thiếu trạng thái"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 🔥 1. CHECK ADMIN
        cursor.execute(
            "SELECT vai_tro FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (nguoi_doi_id,)
        )
        user = cursor.fetchone()

        if not user or user[0] != 'admin':
            return jsonify({"error": "Không có quyền"}), 403

        # 🔥 2. CHECK BÁO CÁO
        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        trang_thai_cu = row[0]

        # 🔥 3. KHÔNG CHO SỬA NẾU ĐÃ HOÀN TẤT
        if trang_thai_cu == 'da_xu_ly':
            return jsonify({"error": "Báo cáo đã hoàn tất"}), 400

        # 🔥 4. KHÔNG CHO UPDATE TRÙNG
        if trang_thai_cu == trang_thai_moi:
            return jsonify({"error": "Trạng thái không thay đổi"}), 400

        # 🔥 5. FLOW TRẠNG THÁI (KHỚP NGHIEM_THU)
        allowed_transitions = {
            'cho_duyet': ['da_duyet', 'tu_choi'],
            'da_duyet': ['da_phan_cong'],
            'da_phan_cong': ['dang_xu_ly'],
            'dang_xu_ly': ['da_xu_ly', 'da_duyet'],  # 🔥 quay lại nếu không đạt
            'da_xu_ly': [],
            'tu_choi': []
        }

        if trang_thai_moi not in allowed_transitions.get(trang_thai_cu, []):
            return jsonify({"error": "Chuyển trạng thái không hợp lệ"}), 400

        # 🔥 6. UPDATE
        cursor.execute(
            "UPDATE bao_cao SET trang_thai = ? WHERE bao_cao_id = ?",
            (trang_thai_moi, id)
        )

        # 🔥 7. LOG
        cursor.execute(
            """
            INSERT INTO lich_su_trang_thai 
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi)
            VALUES (?, ?, ?, ?)
            """,
            (id, nguoi_doi_id, trang_thai_cu, trang_thai_moi)
        )

        conn.commit()
        return jsonify({"message": "Cập nhật trạng thái thành công"})

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()

# 3. Phân công nhân viên
@admin_bp.route('/bao-cao/<int:id>/phan-cong', methods=['POST'])
def phan_cong(id):
    if not request.is_json:
        return jsonify({"error": "Missing JSON"}), 400

    data = request.json
    nhan_vien_id = data.get('nhan_vien_id')
    admin_id = data.get('admin_id')

    if not nhan_vien_id:
        return jsonify({"error": "Thiếu nhan_vien_id"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 🔥 1. CHECK ADMIN
        cursor.execute(
            "SELECT vai_tro FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (admin_id,)
        )
        user = cursor.fetchone()

        if not user or user[0] != 'admin':
            return jsonify({"error": "Không có quyền"}), 403

        # 🔥 2. CHECK BÁO CÁO
        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )
        bc = cursor.fetchone()

        if not bc:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        if bc[0] != 'da_duyet':
            return jsonify({"error": "Chỉ phân công báo cáo đã duyệt"}), 400

        # 🔥 3. CHECK ĐANG CÓ NGƯỜI LÀM KHÔNG
        cursor.execute(
            """
            SELECT 1 FROM phan_cong 
            WHERE bao_cao_id = ? AND trang_thai = 'dang_lam'
            """,
            (id,)
        )
        if cursor.fetchone():
            return jsonify({"error": "Đang có nhân viên xử lý"}), 400

        # 🔥 4. CHECK NHÂN VIÊN
        cursor.execute(
            "SELECT vai_tro, bi_dinh_chi FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (nhan_vien_id,)
        )
        nv = cursor.fetchone()

        if not nv:
            return jsonify({"error": "Nhân viên không tồn tại"}), 404

        vai_tro, bi_dinh_chi = nv

        if vai_tro != 'nhan_vien':
            return jsonify({"error": "Chỉ được phân công cho nhân viên"}), 400

        if bi_dinh_chi:
            return jsonify({"error": "Nhân viên bị đình chỉ"}), 403

        # 🔥 5. TÍNH LẦN THỨ
        cursor.execute(
            "SELECT COUNT(*) FROM phan_cong WHERE bao_cao_id = ?",
            (id,)
        )
        lan_thu = cursor.fetchone()[0] + 1

        # 🔥 6. INSERT PHÂN CÔNG MỚI
        cursor.execute(
            """
            INSERT INTO phan_cong (bao_cao_id, nhan_vien_id, lan_thu)
            VALUES (?, ?, ?)
            """,
            (id, nhan_vien_id, lan_thu)
        )

        # 🔥 7. UPDATE BÁO CÁO
        cursor.execute(
            """
            UPDATE bao_cao 
            SET nhan_vien_id = ?, trang_thai = 'da_phan_cong'
            WHERE bao_cao_id = ?
            """,
            (nhan_vien_id, id)
        )

        # 🔥 8. LOG
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
        
# 3. Nghiệm thu
@admin_bp.route('/bao-cao/<int:id>/nghiem-thu', methods=['PUT'])
def nghiem_thu(id):
    if not request.is_json:
        return jsonify({"error": "Missing JSON"}), 400

    data = request.json
    ket_qua = data.get('ket_qua')  # 'dat' | 'khong_dat'
    nguoi_duyet_id = data.get('nguoi_duyet_id')  # admin

    if ket_qua not in ['dat', 'khong_dat']:
        return jsonify({"error": "ket_qua phải là 'dat' hoặc 'khong_dat'"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 🔥 1. CHECK ADMIN
        cursor.execute(
            "SELECT vai_tro FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (nguoi_duyet_id,)
        )
        user = cursor.fetchone()

        if not user or user[0] != 'admin':
            return jsonify({"error": "Không có quyền"}), 403

        # 🔥 2. CHECK BÁO CÁO
        cursor.execute(
            "SELECT trang_thai FROM bao_cao WHERE bao_cao_id = ?",
            (id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Báo cáo không tồn tại"}), 404

        trang_thai = row[0]

        if trang_thai != 'dang_xu_ly':
            return jsonify({"error": "Chỉ nghiệm thu khi đang xử lý"}), 400

        # 🔥 3. LẤY PHÂN CÔNG HIỆN TẠI
        cursor.execute(
            """
            SELECT TOP 1 phan_cong_id, nhan_vien_id, so_lan_tra_lai
            FROM phan_cong
            WHERE bao_cao_id = ? AND trang_thai = 'dang_lam'
            ORDER BY phan_cong_id DESC
            """,
            (id,)
        )
        pc = cursor.fetchone()

        if not pc:
            return jsonify({"error": "Không có nhân viên đang xử lý"}), 400

        phan_cong_id, nhan_vien_id, so_lan_tra_lai = pc

        # =========================================
        # ✅ CASE 1: ĐẠT
        # =========================================
        if ket_qua == 'dat':
            # update báo cáo
            cursor.execute(
                "UPDATE bao_cao SET trang_thai = 'da_xu_ly' WHERE bao_cao_id = ?",
                (id,)
            )

            # update phân công
            cursor.execute(
                """
                UPDATE phan_cong 
                SET trang_thai = 'hoan_thanh', ngay_xong = GETDATE()
                WHERE phan_cong_id = ?
                """,
                (phan_cong_id,)
            )

            # log
            cursor.execute(
                """
                INSERT INTO lich_su_trang_thai 
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
                VALUES (?, ?, 'dang_xu_ly', 'da_xu_ly', N'Nghiệm thu đạt')
                """,
                (id, nguoi_duyet_id)
            )

        # =========================================
        # ❌ CASE 2: KHÔNG ĐẠT (TRẢ LẠI)
        # =========================================
        else:
            # tăng số lần trả lại
            cursor.execute(
                """
                UPDATE phan_cong
                SET so_lan_tra_lai = so_lan_tra_lai + 1
                WHERE phan_cong_id = ?
                """,
                (phan_cong_id,)
            )

            # 🔥 QUAY LẠI da_duyet
            cursor.execute(
                "UPDATE bao_cao SET trang_thai = 'da_duyet' WHERE bao_cao_id = ?",
                (id,)
            )

            # lấy lại số lần mới
            cursor.execute(
                "SELECT so_lan_tra_lai FROM phan_cong WHERE phan_cong_id = ?",
                (phan_cong_id,)
            )
            so_lan_moi = cursor.fetchone()[0]

            # 🔥 CHECK ĐÌNH CHỈ
            if so_lan_moi >= 2:
                cursor.execute(
                    """
                    UPDATE nguoi_dung 
                    SET bi_dinh_chi = 1,
                        ly_do_dinh_chi = N'Tự động đình chỉ: bị trả lại 2 lần'
                    WHERE nguoi_dung_id = ?
                    """,
                    (nhan_vien_id,)
                )

                cursor.execute(
                    """
                    UPDATE phan_cong 
                    SET trang_thai = 'bi_dinh_chi'
                    WHERE phan_cong_id = ?
                    """,
                    (phan_cong_id,)
                )

            # log
            cursor.execute(
                """
                INSERT INTO lich_su_trang_thai 
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
                VALUES (?, ?, 'dang_xu_ly', 'da_duyet', N'Nghiệm thu không đạt - trả lại')
                """,
                (id, nguoi_duyet_id)
            )

        conn.commit()
        return jsonify({"message": "Nghiệm thu thành công"})

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()
#4. thong-ke
@admin_bp.route('/thong-ke', methods=['GET'])
def thong_ke():
    conn = get_db()
    cursor = conn.cursor()

    try:
        # Tổng số báo cáo
        cursor.execute("SELECT COUNT(*) FROM bao_cao")
        tong_bao_cao = cursor.fetchone()[0]

        # Theo trạng thái
        cursor.execute("""
            SELECT trang_thai, COUNT(*) 
            FROM bao_cao 
            GROUP BY trang_thai
        """)
        theo_trang_thai = [
            {"trang_thai": row[0], "so_luong": row[1]}
            for row in cursor.fetchall()
        ]

        # Theo loại sự cố
        cursor.execute("""
            SELECT l.ten, COUNT(*) 
            FROM bao_cao b
            JOIN loai_su_co l ON b.loai_su_co_id = l.loai_su_co_id
            GROUP BY l.ten
        """)
        theo_loai = [
            {"loai_su_co": row[0], "so_luong": row[1]}
            for row in cursor.fetchall()
        ]

        # Top nhân viên xử lý nhiều nhất
        cursor.execute("""
            SELECT TOP 3 nd.ho_ten, COUNT(*) AS so_lan
            FROM phan_cong pc
            JOIN nguoi_dung nd ON pc.nhan_vien_id = nd.nguoi_dung_id
            GROUP BY nd.ho_ten
            ORDER BY so_lan DESC
        """)
        top_nhan_vien = [
            {"ho_ten": row[0], "so_lan_xu_ly": row[1]}
            for row in cursor.fetchall()
        ]

        return jsonify({
            "tong_bao_cao": tong_bao_cao,
            "theo_trang_thai": theo_trang_thai,
            "theo_loai_su_co": theo_loai,
            "top_nhan_vien": top_nhan_vien
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()