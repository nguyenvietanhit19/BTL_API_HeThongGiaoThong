from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db
from datetime import datetime
from routes.suspension_utils import release_staff_assignments

quan_ly_bp = Blueprint('quan_ly', __name__)


def _sort_activity_key(item):
    value = item.get('thoi_gian')
    if value is None:
        return datetime.min
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return datetime.min


# ==========================================
# 1. LẤY DANH SÁCH TẤT CẢ TÀI KHOẢN
# GET /admin/nguoi-dung
# ==========================================
@quan_ly_bp.route('/nguoi-dung', methods=['GET'])
@can_access(['admin'])
def danh_sach_nguoi_dung():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT nguoi_dung_id, email, ho_ten, vai_tro,
                   dang_hoat_dong, bi_dinh_chi, ngay_tao
            FROM nguoi_dung
            ORDER BY ngay_tao DESC
        """)
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


# ==========================================
# 2. XEM CHI TIẾT 1 TÀI KHOẢN
# GET /admin/nguoi-dung/<id>
# ==========================================
@quan_ly_bp.route('/nguoi-dung/<int:id>', methods=['GET'])
@can_access(['admin'])
def chi_tiet_nguoi_dung(id):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT nguoi_dung_id, email, ho_ten, vai_tro,
                   dang_hoat_dong, bi_dinh_chi, ly_do_dinh_chi, ngay_tao
            FROM nguoi_dung
            WHERE nguoi_dung_id = ?
        """, (id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tìm thấy người dùng'}), 404

        cols = [d[0] for d in cursor.description]
        nguoi_dung = dict(zip(cols, row))

        # Lấy lịch sử báo cáo
        cursor.execute("""
            SELECT bao_cao_id, tieu_de, trang_thai, ngay_tao
            FROM bao_cao
            WHERE nguoi_dung_id = ?
            ORDER BY ngay_tao DESC
        """, (id,))
        rows = cursor.fetchall()
        cols_bc = [d[0] for d in cursor.description]
        bao_cao = [dict(zip(cols_bc, r)) for r in rows]

        # Lay lich su tac dong len tai khoan nay
        cursor.execute("""
            SELECT
                nk.nhat_ky_id,
                nk.hanh_dong,
                nk.gia_tri_cu,
                nk.gia_tri_moi,
                nk.thoi_gian,
                admin.ho_ten AS ten_admin
            FROM nhat_ky_admin nk
            JOIN nguoi_dung admin ON nk.admin_id = admin.nguoi_dung_id
            WHERE nk.nguoi_dung_id = ?
            ORDER BY nk.thoi_gian DESC
        """, (id,))
        rows = cursor.fetchall()
        cols_nk = [d[0] for d in cursor.description]
        nhat_ky = [dict(zip(cols_nk, r)) for r in rows]

        hoat_dong = []

        for bc in bao_cao:
            hoat_dong.append({
                'loai': 'bao_cao_tao',
                'thoi_gian': bc.get('ngay_tao'),
                'tieu_de': 'Đăng báo cáo mới',
                'mo_ta': bc.get('tieu_de') or 'Báo cáo sự cố',
                'tham_chieu': bc.get('bao_cao_id'),
                'trang_thai': bc.get('trang_thai')
            })

        cursor.execute("""
            SELECT
                ls.bao_cao_id,
                ls.trang_thai_cu,
                ls.trang_thai_moi,
                ls.ghi_chu,
                ls.ngay_doi,
                bc.tieu_de,
                nd.ho_ten AS ten_nguoi_doi
            FROM lich_su_trang_thai ls
            JOIN bao_cao bc ON bc.bao_cao_id = ls.bao_cao_id
            LEFT JOIN nguoi_dung nd ON nd.nguoi_dung_id = ls.nguoi_doi_id
            WHERE bc.nguoi_dung_id = ?
            ORDER BY ls.ngay_doi DESC
        """, (id,))
        rows = cursor.fetchall()
        cols_ls = [d[0] for d in cursor.description]
        lich_su_bao_cao = [dict(zip(cols_ls, r)) for r in rows]

        for ls in lich_su_bao_cao:
            hoat_dong.append({
                'loai': 'bao_cao_cap_nhat',
                'thoi_gian': ls.get('ngay_doi'),
                'tieu_de': 'Cập nhật trạng thái báo cáo',
                'mo_ta': ls.get('tieu_de') or 'Báo cáo sự cố',
                'tham_chieu': ls.get('bao_cao_id'),
                'trang_thai_cu': ls.get('trang_thai_cu'),
                'trang_thai_moi': ls.get('trang_thai_moi'),
                'ghi_chu': ls.get('ghi_chu'),
                'ten_nguoi_thuc_hien': ls.get('ten_nguoi_doi')
            })

        for nk in nhat_ky:
            hoat_dong.append({
                'loai': 'tai_khoan_cap_nhat',
                'thoi_gian': nk.get('thoi_gian'),
                'tieu_de': nk.get('hanh_dong'),
                'gia_tri_cu': nk.get('gia_tri_cu'),
                'gia_tri_moi': nk.get('gia_tri_moi'),
                'ten_nguoi_thuc_hien': nk.get('ten_admin')
            })

        hoat_dong.sort(key=_sort_activity_key, reverse=True)

        return jsonify({
            'nguoi_dung': nguoi_dung,
            'bao_cao': bao_cao,
            'nhat_ky': nhat_ky,
            'hoat_dong': hoat_dong
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ==========================================
# 3. CẤP / THU HỒI VAI TRÒ
# PUT /admin/nguoi-dung/<id>/vai-tro
# ==========================================
@quan_ly_bp.route('/nguoi-dung/<int:id>/vai-tro', methods=['PUT'])
@can_access(['admin'])
def cap_nhat_vai_tro(id):
    data = request.get_json()
    vai_tro_moi = data.get('vai_tro', '').strip()

    if vai_tro_moi not in ['user', 'nhan_vien', 'admin']:
        return jsonify({'loi': 'Vai trò không hợp lệ, chỉ chấp nhận: user, nhan_vien, admin'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, vai_tro, ho_ten FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tìm thấy người dùng'}), 404

        nguoi_dung_id, vai_tro_cu, ho_ten = row

        # Không cho tự đổi vai trò của chính mình
        if nguoi_dung_id == request.nguoi_dung_id:
            return jsonify({'loi': 'Không thể tự thay đổi vai trò của mình'}), 400

        # Không đổi nếu vai trò giống nhau
        if vai_tro_cu == vai_tro_moi:
            return jsonify({'loi': f'{ho_ten} đã có vai trò {vai_tro_cu} rồi'}), 400

        # Cập nhật vai trò
        cursor.execute(
            "UPDATE nguoi_dung SET vai_tro = ? WHERE nguoi_dung_id = ?",
            (vai_tro_moi, id)
        )

        # Ghi nhật ký admin
        hanh_dong = 'cap_quyen' if vai_tro_moi in ['admin', 'nhan_vien'] else 'thu_quyen'
        cursor.execute(
            """INSERT INTO nhat_ky_admin
               (admin_id, nguoi_dung_id, hanh_dong, gia_tri_cu, gia_tri_moi)
               VALUES (?, ?, ?, ?, ?)""",
            (request.nguoi_dung_id, id, hanh_dong, vai_tro_cu, vai_tro_moi)
        )

        conn.commit()
        return jsonify({
            'thong_bao': f'Đã đổi vai trò của {ho_ten} từ {vai_tro_cu} → {vai_tro_moi}'
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ==========================================
# 4. KHOÁ / MỞ KHOÁ TÀI KHOẢN
# PUT /admin/nguoi-dung/<id>/trang-thai
# ==========================================
@quan_ly_bp.route('/nguoi-dung/<int:id>/trang-thai', methods=['PUT'])
@can_access(['admin'])
def cap_nhat_trang_thai_tk(id):
    data = request.get_json()
    dang_hoat_dong = data.get('dang_hoat_dong')

    if dang_hoat_dong is None:
        return jsonify({'loi': 'Thiếu trường dang_hoat_dong (true/false)'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, ho_ten, dang_hoat_dong FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tìm thấy người dùng'}), 404

        nguoi_dung_id, ho_ten, trang_thai_cu = row

        if nguoi_dung_id == request.nguoi_dung_id:
            return jsonify({'loi': 'Không thể khoá tài khoản của chính mình'}), 400

        cursor.execute(
            "UPDATE nguoi_dung SET dang_hoat_dong = ? WHERE nguoi_dung_id = ?",
            (1 if dang_hoat_dong else 0, id)
        )

        hanh_dong = 'mo_khoa_tk' if dang_hoat_dong else 'khoa_tk'
        cursor.execute(
            """INSERT INTO nhat_ky_admin
               (admin_id, nguoi_dung_id, hanh_dong, gia_tri_cu, gia_tri_moi)
               VALUES (?, ?, ?, ?, ?)""",
            (request.nguoi_dung_id, id, hanh_dong,
             str(bool(trang_thai_cu)), str(dang_hoat_dong))
        )

        conn.commit()
        trang_thai_text = 'mở khoá' if dang_hoat_dong else 'khoá'
        return jsonify({'thong_bao': f'Đã {trang_thai_text} tài khoản {ho_ten}'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()


# ==========================================
# 5. GỠ ĐÌNH CHỈ NHÂN VIÊN
# PUT /admin/nguoi-dung/<id>/dinh-chi
# ==========================================
@quan_ly_bp.route('/nguoi-dung/<int:id>/dinh-chi', methods=['PUT'])
@can_access(['admin'])
def go_dinh_chi(id):
    data = request.get_json(silent=True) or {}
    ly_do = str(data.get('ly_do') or '').strip()

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT nguoi_dung_id, ho_ten, bi_dinh_chi, vai_tro FROM nguoi_dung WHERE nguoi_dung_id = ?",
            (id,)
        )
        row = cursor.fetchone()

        if not row:
            return jsonify({'loi': 'Không tìm thấy người dùng'}), 404

        nguoi_dung_id, ho_ten, bi_dinh_chi, vai_tro = row

        if vai_tro != 'nhan_vien':
            return jsonify({'loi': 'Chỉ có thể đình chỉ nhân viên'}), 400

        if ly_do:
            if bi_dinh_chi:
                return jsonify({'loi': f'{ho_ten} đang bị đình chỉ rồi'}), 400

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM bao_cao
                WHERE nhan_vien_id = ?
                  AND trang_thai = 'dang_xu_ly'
                """,
                (id,)
            )
            dang_xu_ly_count = cursor.fetchone()[0]

            if dang_xu_ly_count > 0:
                return jsonify({'loi': f'không thể đình chỉ nhân viên do nhân viên {ho_ten} đang có báo cáo đang xử lý'}), 400

            cursor.execute(
                "UPDATE nguoi_dung SET bi_dinh_chi = 1, ly_do_dinh_chi = ? WHERE nguoi_dung_id = ?",
                (ly_do, id)
            )

            cursor.execute(
                """INSERT INTO nhat_ky_admin
                   (admin_id, nguoi_dung_id, hanh_dong, gia_tri_cu, gia_tri_moi)
                   VALUES (?, ?, 'dinh_chi', 'False', 'True')""",
                (request.nguoi_dung_id, id)
            )

            release_staff_assignments(
                cursor,
                id,
                request.nguoi_dung_id,
                'Nhân viên bị đình chỉ: {ten_nhan_vien}, báo cáo được trả về trạng thái đã duyệt'
            )

            conn.commit()
            return jsonify({'thong_bao': f'Đã đình chỉ nhân viên {ho_ten}'}), 200

        if not bi_dinh_chi:
            return jsonify({'loi': f'{ho_ten} hiện không bị đình chỉ'}), 400

        cursor.execute(
            "UPDATE nguoi_dung SET bi_dinh_chi = 0, ly_do_dinh_chi = NULL WHERE nguoi_dung_id = ?",
            (id,)
        )

        cursor.execute(
            """INSERT INTO nhat_ky_admin
               (admin_id, nguoi_dung_id, hanh_dong, gia_tri_cu, gia_tri_moi)
               VALUES (?, ?, 'go_dinh_chi', 'True', 'False')""",
            (request.nguoi_dung_id, id)
        )

        conn.commit()
        return jsonify({'thong_bao': f'Đã gỡ đình chỉ cho nhân viên {ho_ten}'}), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()

# ==========================================
# 6. XEM NHẬT KÝ ADMIN
# GET /admin/nhat-ky
# ==========================================
@quan_ly_bp.route('/nhat-ky', methods=['GET'])
@can_access(['admin'])
def xem_nhat_ky():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                nk.nhat_ky_id,
                nk.hanh_dong,
                nk.gia_tri_cu,
                nk.gia_tri_moi,
                nk.thoi_gian,
                a.ho_ten  AS ten_admin,
                nd.ho_ten AS ten_nguoi_dung,
                nd.email  AS email_nguoi_dung
            FROM nhat_ky_admin nk
            JOIN nguoi_dung a  ON nk.admin_id      = a.nguoi_dung_id
            JOIN nguoi_dung nd ON nk.nguoi_dung_id = nd.nguoi_dung_id
            ORDER BY nk.thoi_gian DESC
        """)
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
