from datetime import datetime

import cloudinary.uploader
from flask import Blueprint, jsonify, request

from db import get_db
from middleware.auth_middleware import can_access
from routes.suspension_utils import release_staff_assignments

nhan_vien_bp = Blueprint('nhan_vien', __name__)


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
                bc.ngay_tao,
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
              AND bc.trang_thai IN ('da_phan_cong', 'dang_xu_ly', 'cho_nghiem_thu')
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

        cursor.execute("""
            SELECT trang_thai, nhan_vien_id
            FROM bao_cao
            WHERE bao_cao_id = ?
        """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Khong ton tai'}), 404

        if row[0] != 'da_phan_cong':
            return jsonify({'loi': 'Khong the nhan viec nay'}), 400

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Khong phai cua ban'}), 403

        cursor.execute("""
            SELECT COUNT(*)
            FROM phan_cong pc
            JOIN bao_cao bc ON bc.bao_cao_id = pc.bao_cao_id
            WHERE pc.nhan_vien_id = ?
              AND pc.trang_thai = 'dang_lam'
              AND bc.trang_thai = 'dang_xu_ly'
        """, (request.nguoi_dung_id,))
        dang_lam = cursor.fetchone()[0]

        if dang_lam > 0:
            return jsonify({'loi': 'Ban dang co viec chua hoan thanh'}), 400

        cursor.execute("""
            UPDATE phan_cong
            SET trang_thai = 'dang_lam'
            WHERE phan_cong_id = (
                SELECT TOP 1 phan_cong_id
                FROM phan_cong
                WHERE bao_cao_id = ?
                  AND nhan_vien_id = ?
                ORDER BY lan_thu DESC, phan_cong_id DESC
            )
        """, (id, request.nguoi_dung_id))

        cursor.execute("""
            UPDATE bao_cao
            SET trang_thai = 'dang_xu_ly'
            WHERE bao_cao_id = ?
        """, (id,))

        cursor.execute("""
            INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'da_phan_cong', 'dang_xu_ly', N'Nhan vien nhan viec')
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
            return jsonify({'loi': 'Khong ton tai'}), 404

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Khong phai viec cua ban'}), 403

        if row[0] != 'da_phan_cong':
            return jsonify({'loi': 'Chi tu choi khi chua xu ly'}), 400

        cursor.execute("""
            SELECT TOP 1 phan_cong_id, ISNULL(so_lan_tra_lai, 0)
            FROM phan_cong
            WHERE bao_cao_id = ? AND nhan_vien_id = ?
            ORDER BY lan_thu DESC, phan_cong_id DESC
        """, (id, request.nguoi_dung_id))
        pc = cursor.fetchone()

        if not pc:
            return jsonify({'loi': 'Khong tim thay phan cong hien tai'}), 404

        phan_cong_id, so_lan_tra_lai = pc
        so_lan_tra_lai_moi = so_lan_tra_lai + 1

        cursor.execute("""
            UPDATE phan_cong
            SET so_lan_tra_lai = ?
            WHERE phan_cong_id = ?
        """, (so_lan_tra_lai_moi, phan_cong_id))

        cursor.execute("""
            SELECT ISNULL(SUM(ISNULL(so_lan_tra_lai, 0)), 0)
            FROM phan_cong
            WHERE nhan_vien_id = ?
        """, (request.nguoi_dung_id,))
        tong_so_lan_tu_choi = cursor.fetchone()[0]

        if tong_so_lan_tu_choi >= 2:
            cursor.execute(
                """
                UPDATE nguoi_dung
                SET bi_dinh_chi = 1,
                    ly_do_dinh_chi = ?
                WHERE nguoi_dung_id = ?
                  AND vai_tro = 'nhan_vien'
                """,
                ('Bi dinh chi do co 2 lan tu choi nhan viec', request.nguoi_dung_id)
            )
            release_staff_assignments(
                cursor,
                request.nguoi_dung_id,
                request.nguoi_dung_id,
                'Nhan vien bi dinh chi, bao cao duoc tra ve trang thai da duyet'
            )
        else:
            cursor.execute("""
                UPDATE bao_cao
                SET trang_thai = 'da_duyet',
                    nhan_vien_id = NULL
                WHERE bao_cao_id = ?
            """, (id,))

            cursor.execute("""
                INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
                VALUES (?, ?, 'da_phan_cong', 'da_duyet', N'Tu choi')
            """, (id, request.nguoi_dung_id))

        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'loi': str(e)}), 500
    finally:
        conn.close()


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
            return jsonify({'loi': 'Can anh'}), 400

        cursor.execute("""
            SELECT trang_thai, nhan_vien_id
            FROM bao_cao
            WHERE bao_cao_id = ?
        """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Khong ton tai'}), 404

        if row[0] != 'dang_xu_ly':
            return jsonify({'loi': 'Sai trang thai'}), 400

        if row[1] != request.nguoi_dung_id:
            return jsonify({'loi': 'Khong phai cua ban'}), 403

        for f in files:
            if f.filename == "":
                continue

            ket_qua = cloudinary.uploader.upload(
                f,
                folder='giao_thong',
                resource_type='image'
            )
            url_anh = ket_qua['secure_url']

            cursor.execute("""
                INSERT INTO anh (bao_cao_id, nguoi_upload_id, duong_dan_anh, loai_anh)
                VALUES (?, ?, ?, 'sau_sua_chua')
            """, (id, request.nguoi_dung_id, url_anh))

        cursor.execute("""
            UPDATE phan_cong
            SET trang_thai = 'hoan_thanh',
                ngay_xong = GETDATE()
            WHERE bao_cao_id = ?
              AND nhan_vien_id = ?
              AND trang_thai = 'dang_lam'
        """, (id, request.nguoi_dung_id))

        cursor.execute("""
            UPDATE bao_cao
            SET trang_thai = 'cho_nghiem_thu'
            WHERE bao_cao_id = ?
        """, (id,))

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
        WHERE pc.nhan_vien_id = ?
          AND pc.trang_thai = 'hoan_thanh'
    """

    params = [request.nguoi_dung_id]

    if month:
        try:
            month_start = datetime.strptime(month, '%Y-%m')
            if month_start.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1)
            query += " AND pc.ngay_xong >= ? AND pc.ngay_xong < ?"
            params.extend([month_start, month_end])
        except ValueError:
            return jsonify({'loi': 'Thang khong hop le'}), 400

    query += " ORDER BY pc.ngay_xong DESC"

    cursor.execute(query, params)

    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    return jsonify([dict(zip(cols, r)) for r in rows])


@nhan_vien_bp.route('/lich-su', methods=['GET'])
@can_access(['nhan_vien'])
def lich_su():
    conn = get_db()
    cursor = conn.cursor()

    search = request.args.get('search', '').strip()
    status = request.args.get('status', '').strip()
    month = request.args.get('month', '').strip()

    query = """
        SELECT
            ls.*,
            bc.tieu_de,
            lsc.ten AS loai_su_co
        FROM lich_su_trang_thai ls
        JOIN bao_cao bc ON bc.bao_cao_id = ls.bao_cao_id
        JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
        WHERE ls.nguoi_doi_id = ?
    """
    params = [request.nguoi_dung_id]

    if search:
        query += """
            AND (
                CAST(ls.bao_cao_id AS NVARCHAR(20)) LIKE ?
                OR bc.tieu_de COLLATE Latin1_General_CI_AI LIKE ?
                OR lsc.ten COLLATE Latin1_General_CI_AI LIKE ?
                OR ISNULL(ls.ghi_chu, '') COLLATE Latin1_General_CI_AI LIKE ?
            )
        """
        like_value = f"%{search}%"
        params.extend([like_value, like_value, like_value, like_value])

    if status:
        if status == 'hoan_thanh':
            query += " AND ls.trang_thai_moi = 'cho_nghiem_thu'"
        elif status == 'tu_choi':
            query += " AND ls.trang_thai_cu = 'da_phan_cong' AND ls.trang_thai_moi = 'da_duyet' AND ls.ghi_chu = N'Tu choi'"
        else:
            query += " AND ls.trang_thai_moi = ?"
            params.append(status)

    if month:
        try:
            month_start = datetime.strptime(month, '%Y-%m')
            if month_start.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1)
            query += " AND ls.ngay_doi >= ? AND ls.ngay_doi < ?"
            params.extend([month_start, month_end])
        except ValueError:
            return jsonify({'loi': 'Thang khong hop le'}), 400

    query += " ORDER BY ls.ngay_doi DESC"

    cursor.execute(query, params)

    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    return jsonify([dict(zip(cols, r)) for r in rows])
