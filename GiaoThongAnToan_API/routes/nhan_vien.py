from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db

nhan_vien_bp = Blueprint('nhan_vien', __name__)


# GET /nhan-vien/viec-cua-toi       (chỉ hiển thị các công việc đang làm)
@nhan_vien_bp.route('/viec-cua-toi', methods=['GET'])
@can_access(['nhan_vien'])
def viec_cua_toi():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                bc.bao_cao_id,
                bc.tieu_de,
                bc.mo_ta,
                bc.dia_chi,
                bc.vi_do,
                bc.kinh_do,
                bc.trang_thai,
                bc.ngay_tao,
                bc.ngay_cap_nhat,
                lsc.ten         AS loai_su_co,
                lsc.mau_sac,
                nd.ho_ten       AS ten_nguoi_gui,
                pc.lan_thu,
                pc.so_lan_tra_lai,
                pc.ngay_nhan
            FROM bao_cao bc
            JOIN loai_su_co lsc ON bc.loai_su_co_id  = lsc.loai_su_co_id
            JOIN nguoi_dung nd  ON bc.nguoi_dung_id   = nd.nguoi_dung_id
            JOIN phan_cong pc   ON pc.bao_cao_id      = bc.bao_cao_id
                               AND pc.nhan_vien_id    = ?
                               AND pc.trang_thai      = 'dang_lam'
            WHERE bc.nhan_vien_id = ?
              AND bc.trang_thai IN ('da_phan_cong', 'dang_xu_ly', 'cho_nghiem_thu')
            ORDER BY bc.ngay_cap_nhat DESC
        """, (request.nguoi_dung_id, request.nguoi_dung_id))

        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        ket_qua = [dict(zip(cols, row)) for row in rows]

        return jsonify({
            'tong': len(ket_qua),
            'danh_sach': ket_qua
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# PUT /nhan-vien/bao-cao/<id>/nhan-viec
@nhan_vien_bp.route('/bao-cao/<int:id>/nhan-viec', methods=['PUT'])
@can_access(['nhan_vien'])
def nhan_viec(id):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT trang_thai, nhan_vien_id FROM bao_cao WHERE bao_cao_id = ?", (id,)
        )
        bao_cao = cursor.fetchone()

        if not bao_cao:
            return jsonify({'loi': 'Không tìm thấy báo cáo'}), 404

        trang_thai, nhan_vien_id = bao_cao

        if trang_thai != 'da_phan_cong':
            return jsonify({'loi': f'Báo cáo đang ở trạng thái {trang_thai}, không thể nhận việc'}), 400

        if nhan_vien_id != request.nguoi_dung_id:
            return jsonify({'loi': 'Báo cáo này không được phân công cho bạn'}), 403

        cursor.execute(
            "UPDATE bao_cao SET trang_thai = 'dang_xu_ly' WHERE bao_cao_id = ?", (id,)
        )

        cursor.execute("""
            INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'da_phan_cong', 'dang_xu_ly', N'Nhân viên đã nhận việc')
        """, (id, request.nguoi_dung_id))

        conn.commit()
        return jsonify({'thong_bao': 'Nhận việc thành công, bắt đầu xử lý'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# PUT /nhan-vien/bao-cao/<id>/hoan-thanh
@nhan_vien_bp.route('/bao-cao/<int:id>/hoan-thanh', methods=['PUT'])
@can_access(['nhan_vien'])
def hoan_thanh(id):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT trang_thai, nhan_vien_id FROM bao_cao WHERE bao_cao_id = ?", (id,)
        )
        bao_cao = cursor.fetchone()

        if not bao_cao:
            return jsonify({'loi': 'Không tìm thấy báo cáo'}), 404

        trang_thai, nhan_vien_id = bao_cao

        if trang_thai != 'dang_xu_ly':
            return jsonify({'loi': f'Báo cáo đang ở trạng thái {trang_thai}, không thể báo hoàn thành'}), 400

        if nhan_vien_id != request.nguoi_dung_id:
            return jsonify({'loi': 'Báo cáo này không được phân công cho bạn'}), 403

        cursor.execute("""
            SELECT COUNT(*) FROM anh
            WHERE bao_cao_id = ? AND loai_anh = 'sau_sua_chua'
        """, (id,))
        so_anh = cursor.fetchone()[0]

        if so_anh == 0:
            return jsonify({'loi': 'Phải upload ảnh sau sửa chữa trước khi báo hoàn thành'}), 400

        cursor.execute(
            "UPDATE bao_cao SET trang_thai = 'cho_nghiem_thu' WHERE bao_cao_id = ?", (id,)
        )

        cursor.execute("""
            UPDATE phan_cong SET trang_thai = 'hoan_thanh', ngay_xong = GETDATE()
            WHERE bao_cao_id = ? AND nhan_vien_id = ? AND trang_thai = 'dang_lam'
        """, (id, request.nguoi_dung_id))

        cursor.execute("""
            INSERT INTO lich_su_trang_thai
                (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, 'dang_xu_ly', 'cho_nghiem_thu', N'Nhân viên báo hoàn thành')
        """, (id, request.nguoi_dung_id))

        conn.commit()
        return jsonify({'thong_bao': 'Báo hoàn thành thành công, chờ admin nghiệm thu'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()

@nhan_vien_bp.route('/da-hoan-thanh', methods=['GET'])
@can_access(['nhan_vien'])
def da_hoan_thanh():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        month = request.args.get('month')  # yyyy-mm

        query = """
            SELECT 
                bc.bao_cao_id,
                bc.tieu_de,
                lsc.ten AS loai_su_co,
                pc.ngay_xong,
                bc.trang_thai
            FROM phan_cong pc
            JOIN bao_cao bc ON bc.bao_cao_id = pc.bao_cao_id
            JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
            WHERE pc.nhan_vien_id = ?
              AND pc.trang_thai = 'hoan_thanh'
        """

        params = [request.nguoi_dung_id]

        if month:
            query += " AND FORMAT(pc.ngay_xong, 'yyyy-MM') = ?"
            params.append(month)

        query += " ORDER BY pc.ngay_xong DESC"

        cursor.execute(query, params)

        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        data = [dict(zip(cols, row)) for row in rows]

        return jsonify(data), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()

@nhan_vien_bp.route('/lich-su', methods=['GET'])
@can_access(['nhan_vien'])
def lich_su():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        search = request.args.get('search', '')
        status = request.args.get('status', '')
        month = request.args.get('month')

        query = """
            SELECT 
                bc.bao_cao_id,
                bc.tieu_de,
                lsc.ten AS loai_su_co,
                lstt.trang_thai_moi,
                lstt.ghi_chu,
                lstt.ngay_doi
            FROM lich_su_trang_thai lstt
            JOIN bao_cao bc ON bc.bao_cao_id = lstt.bao_cao_id
            JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
            WHERE lstt.nguoi_doi_id = ?
        """

        params = [request.nguoi_dung_id]

        if search:
            query += " AND bc.tieu_de LIKE ?"
            params.append(f"%{search}%")

        if status:
            if status == 'done':
                query += " AND lstt.trang_thai_moi = 'da_xu_ly'"
            elif status == 'reject':
                query += " AND lstt.trang_thai_moi = 'tu_choi'"

        if month:
            query += " AND FORMAT(lstt.ngay_doi, 'yyyy-MM') = ?"
            params.append(month)

        query += " ORDER BY lstt.ngay_doi DESC"

        cursor.execute(query, params)

        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        data = [dict(zip(cols, row)) for row in rows]

        return jsonify(data), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()