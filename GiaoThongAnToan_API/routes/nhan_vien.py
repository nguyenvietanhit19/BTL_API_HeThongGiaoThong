from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db

nhan_vien_bp = Blueprint('nhan_vien', __name__)


# GET /nhan-vien/viec-cua-toi       (chỉ hiển thị các công việc đang làm)
@nhan_vien_bp.route('/viec-cua-toi', methods=['GET'])
@can_access(['nhan_vien'])
def viec_cua_toi():
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT 
                bc.bao_cao_id,
                bc.tieu_de,
                bc.mo_ta,
                bc.dia_chi,
                bc.trang_thai,
                bc.ngay_tao,          -- 🔥 THÊM
                bc.ngay_cap_nhat,
            
                lsc.ten AS loai_su_co,
                lsc.mau_sac,
            
                pc.lan_thu,
                pc.ngay_nhan,
                pc.trang_thai AS pc_trang_thai

            FROM bao_cao bc
            JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
            JOIN phan_cong pc ON bc.bao_cao_id = pc.bao_cao_id

            WHERE pc.nhan_vien_id = ?
              AND pc.nhan_vien_id = ?
              AND pc.lan_thu = (
                    SELECT MAX(lan_thu)
                    FROM phan_cong
                    WHERE bao_cao_id = bc.bao_cao_id
                      AND nhan_vien_id = ?
              )
              AND bc.trang_thai IN ('da_phan_cong','dang_xu_ly','cho_nghiem_thu')

            ORDER BY bc.ngay_cap_nhat DESC
        """, (request.nguoi_dung_id, request.nguoi_dung_id, request.nguoi_dung_id))

        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        return jsonify([dict(zip(cols, r)) for r in rows])

    finally:
        conn.close()


@nhan_vien_bp.route('/bao-cao/<int:id>/nhan-viec', methods=['PUT'])
@can_access(['nhan_vien'])
def nhan_viec(id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        conn.autocommit = False

        # 1. Kiểm tra báo cáo tồn tại + trạng thái
        cursor.execute("""
                       SELECT trang_thai, nhan_vien_id
                       FROM bao_cao
                       WHERE bao_cao_id = ?
                       """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tồn tại'}), 404

        if row[0] != 'da_phan_cong':
            return jsonify({'loi': 'Không thể nhận việc này'}), 400

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Không phải của bạn'}), 403

        # 2. ❗ CHECK đang có việc chưa xong
        cursor.execute("""
                       SELECT COUNT(*)
                       FROM phan_cong
                       WHERE nhan_vien_id = ?
                         AND trang_thai = 'dang_lam'
                       """, (request.nguoi_dung_id,))

        dang_lam = cursor.fetchone()[0]

        if dang_lam > 0:
            return jsonify({'loi': 'Bạn đang có việc chưa hoàn thành'}), 400

        # 3. Update bảng phan_cong
        cursor.execute("""
                       UPDATE phan_cong
                       SET trang_thai = 'dang_lam'
                       WHERE bao_cao_id = ?
                         AND nhan_vien_id = ?
                         AND trang_thai = 'dang_lam'
                       """, (id, request.nguoi_dung_id))

        # 4. Update bảng bao_cao
        cursor.execute("""
                       UPDATE bao_cao
                       SET trang_thai = 'dang_xu_ly'
                       WHERE bao_cao_id = ?
                       """, (id,))

        # 5. Lưu lịch sử
        cursor.execute("""
                       INSERT INTO lich_su_trang_thai
                           (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
                       VALUES (?, ?, 'da_phan_cong', 'dang_xu_ly', N'Nhân viên nhận việc')
                       """, (id, request.nguoi_dung_id))

        conn.commit()
        return jsonify({'ok': True})

    except Exception as e:
        conn.rollback()
        return jsonify({'loi': str(e)}), 500

    finally:
        conn.close()
@nhan_vien_bp.route('/bao-cao/<int:id>/tu-choi', methods=['PUT'])
@can_access(['nhan_vien'])
def tu_choi(id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        conn.autocommit = False

        cursor.execute("""
            SELECT trang_thai, nhan_vien_id
            FROM bao_cao
            WHERE bao_cao_id = ?
        """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tồn tại'}), 404

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Không phải việc của bạn'}), 403

        if row[0] != 'da_phan_cong':
            return jsonify({'loi': 'Chỉ từ chối khi chưa xử lý'}), 400

        # lấy phan_cong hiện tại
        cursor.execute("""
            SELECT TOP 1 phan_cong_id
            FROM phan_cong
            WHERE bao_cao_id = ? AND nhan_vien_id = ?
            ORDER BY lan_thu DESC
        """, (id, request.nguoi_dung_id))

        pc = cursor.fetchone()

        # tăng số lần từ chối
        cursor.execute("""
            UPDATE phan_cong
            SET so_lan_tra_lai = so_lan_tra_lai + 1
            WHERE phan_cong_id = ?
        """, (pc[0],))

        # gọi SP đình chỉ nếu cần
        cursor.execute("EXEC sp_kiem_tra_dinh_chi ?", (pc[0],))

        # trả lại hệ thống
        cursor.execute("""
            UPDATE bao_cao
            SET trang_thai = 'da_duyet',
                nhan_vien_id = NULL
            WHERE bao_cao_id = ?
        """, (id,))

        cursor.execute("""
            INSERT INTO lich_su_trang_thai
            VALUES (?, ?, 'da_phan_cong', 'da_duyet', N'Từ chối')
        """, (id, request.nguoi_dung_id))

        conn.commit()
        return jsonify({'ok': True})

    except:
        conn.rollback()
        raise
    finally:
        conn.close()


import os, uuid
from werkzeug.utils import secure_filename

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@nhan_vien_bp.route('/bao-cao/<int:id>/hoan-thanh', methods=['POST'])
@can_access(['nhan_vien'])
def hoan_thanh(id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        conn.autocommit = False

        ghi_chu = request.form.get("ghi_chu", "")
        files = request.files.getlist("images")

        if not files or all(f.filename == "" for f in files):
            return jsonify({'loi': 'Cần ảnh'}), 400

        cursor.execute("""
            SELECT trang_thai, nhan_vien_id
            FROM bao_cao
            WHERE bao_cao_id = ?
        """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tồn tại'}), 404

        if row[0] != 'dang_xu_ly':
            return jsonify({'loi': 'Sai trạng thái'}), 400

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Không phải của bạn'}), 403

        # upload ảnh
        for f in files:
            if f.filename == "":
                continue

            filename = str(uuid.uuid4()) + "_" + secure_filename(f.filename)
            path = os.path.join(UPLOAD_FOLDER, filename)
            f.save(path)

            cursor.execute("""
                INSERT INTO anh (bao_cao_id, nguoi_upload_id, duong_dan_anh, loai_anh)
                VALUES (?, ?, ?, 'sau_sua_chua')
            """, (id, request.nguoi_dung_id, path))

        # update phân công
        cursor.execute("""
            UPDATE phan_cong
            SET trang_thai = 'hoan_thanh',
                ngay_xong = GETDATE()
            WHERE bao_cao_id = ?
              AND nhan_vien_id = ?
              AND trang_thai = 'dang_lam'
        """, (id, request.nguoi_dung_id))

        # update báo cáo
        cursor.execute("""
            UPDATE bao_cao
            SET trang_thai = 'cho_nghiem_thu'
            WHERE bao_cao_id = ?
        """, (id,))

        # lịch sử
        cursor.execute("""
            INSERT INTO lich_su_trang_thai
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'dang_xu_ly', 'cho_nghiem_thu', ?)
        """, (id, request.nguoi_dung_id, ghi_chu))

        conn.commit()
        return jsonify({'ok': True})

    except Exception as e:
        conn.rollback()
        return jsonify({'loi': str(e)}), 500

    finally:
        conn.close()

@nhan_vien_bp.route('/da-hoan-thanh', methods=['GET'])
@can_access(['nhan_vien'])
def da_hoan_thanh():
    conn = get_db()
    cursor = conn.cursor()

    month = request.args.get('month')

    query = """
        SELECT 
            bc.bao_cao_id,
            bc.tieu_de,
            lsc.ten AS loai_su_co,
            pc.ngay_xong
        FROM phan_cong pc
        JOIN bao_cao bc ON bc.bao_cao_id = pc.bao_cao_id
        JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
    """

    params = []

    if month:
        query += " AND FORMAT(pc.ngay_xong, 'yyyy-MM') = ?"
        params.append(month)

    cursor.execute(query, params)

    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    return jsonify([dict(zip(cols, r)) for r in rows])

@nhan_vien_bp.route('/lich-su', methods=['GET'])
@can_access(['nhan_vien'])
def lich_su():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            ls.*,
            bc.tieu_de,
            lsc.ten AS loai_su_co
        FROM lich_su_trang_thai ls
        JOIN bao_cao bc ON bc.bao_cao_id = ls.bao_cao_id
        JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
        WHERE ls.nguoi_doi_id = ?
        ORDER BY ls.ngay_doi DESC
    """, (request.nguoi_dung_id,))

    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    return jsonify([dict(zip(cols, r)) for r in rows])

