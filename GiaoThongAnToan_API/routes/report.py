import cloudinary
from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db
import math

from routes.upload import kiem_tra_vi_tri_anh

bao_cao_bp = Blueprint('bao_cao', __name__)


# ==========================================
# HÀM HỖ TRỢ (HELPERS)
# ==========================================
def dict_fetchone(cursor):
    """Chuyển 1 dòng pyodbc thành Dictionary"""
    row = cursor.fetchone()
    if not row:
        return None
    cols = [column[0] for column in cursor.description]
    return dict(zip(cols, row))


def dict_fetchall(cursor):
    """Chuyển nhiều dòng pyodbc thành list of Dictionaries"""
    rows = cursor.fetchall()
    if not rows:
        return []
    cols = [column[0] for column in cursor.description]
    return [dict(zip(cols, row)) for row in rows]


# ==========================================
# 0. TẠO BÁO CÁO
# ==========================================
@bao_cao_bp.route('', methods=['POST'])
@can_access()
def tao_bao_cao():
    conn = None
    try:
        # Đọc form-data
        tieu_de       = request.form.get('tieu_de', '').strip()
        mo_ta         = request.form.get('mo_ta', '')
        dia_chi       = request.form.get('dia_chi', '')
        loai_su_co_id = request.form.get('loai_su_co_id', type=int)

        try:
            vi_do   = float(request.form.get('vi_do'))
            kinh_do = float(request.form.get('kinh_do'))
        except (TypeError, ValueError):
            return jsonify({'loi': 'vi_do và kinh_do phải là số'}), 400

        if not tieu_de or not loai_su_co_id:
            return jsonify({'loi': 'Thiếu tieu_de hoặc loai_su_co_id'}), 400

        # Nhận nhiều ảnh cùng key 'anh'
        files = [f for f in request.files.getlist('anh') if f.filename != '']

        if not files:
            return jsonify({'loi': 'Bắt buộc phải có ít nhất 1 ảnh hiện trường'}), 400

        # Validate định dạng
        ALLOWED = {'jpg', 'jpeg', 'png'}
        for f in files:
            ext = f.filename.rsplit('.', 1)[-1].lower()
            if ext not in ALLOWED:
                return jsonify({'loi': f'{f.filename}: chỉ chấp nhận jpg, jpeg, png'}), 400

        # Kiểm tra GPS từng ảnh
        for i, f in enumerate(files):
            f.seek(0)
            hop_le, thong_bao = kiem_tra_vi_tri_anh(f, vi_do, kinh_do)
            if not hop_le:
                return jsonify({'loi': f'Ảnh {i + 1}: {thong_bao}'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Tạo báo cáo
        cursor.execute(
            """INSERT INTO bao_cao
               (nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do, trang_thai)
               OUTPUT INSERTED.bao_cao_id
               VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_duyet')""",
            (request.nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do)
        )
        bao_cao_id = cursor.fetchone()[0]

        # Log vào lich_su_trang_thai để admin nhận thông báo
        cursor.execute(
            """INSERT INTO lich_su_trang_thai
               (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi)
               VALUES (?, ?, NULL, 'cho_duyet')""",
            (bao_cao_id, request.nguoi_dung_id)
        )

        # Upload từng ảnh lên Cloudinary → lưu DB
        ds_url = []
        for f in files:
            f.seek(0)
            ket_qua = cloudinary.uploader.upload(f, folder='giao_thong', resource_type='image')
            url = ket_qua['secure_url']
            ds_url.append(url)

            cursor.execute(
                """INSERT INTO anh (bao_cao_id, nguoi_upload_id, duong_dan_anh, loai_anh)
                   VALUES (?, ?, ?, 'bao_cao')""",
                (bao_cao_id, request.nguoi_dung_id, url)
            )

        conn.commit()

        return jsonify({
            'thong_bao': 'Tạo báo cáo thành công',
            'bao_cao_id': bao_cao_id,
            'so_anh': len(ds_url),
            'anh': ds_url
        }), 201

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()

# ==========================================
# 1. LẤY DANH SÁCH SỰ CỐ
# GET /bao-cao
# ==========================================
@bao_cao_bp.route('', methods=['GET'])
def get_danh_sach_bao_cao():
    conn = None
    try:
        loai_su_co_id = request.args.get('loai_su_co_id', type=int)

        conn = get_db()
        cursor = conn.cursor()

        # ✅ Thêm 'cho_duyet' vào NOT IN
        if loai_su_co_id:
            sql = """
                SELECT v.* FROM v_bao_cao_day_du v
                JOIN bao_cao b ON v.bao_cao_id = b.bao_cao_id
                WHERE b.loai_su_co_id = ?
                AND v.trang_thai NOT IN ('tu_choi', 'da_xu_ly', 'cho_duyet')
            """
            cursor.execute(sql, [loai_su_co_id])
        else:
            cursor.execute(
                "SELECT * FROM v_bao_cao_day_du WHERE trang_thai NOT IN ('tu_choi', 'da_xu_ly', 'cho_duyet')"
            )

        danh_sach = dict_fetchall(cursor)

        return jsonify({
            'thong_bao': 'Thành công',
            'so_luong': len(danh_sach),
            'data': danh_sach
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


# ==========================================
# 2. LẤY DANH SÁCH BÁO CÁO CỦA MÌNH
# GET /bao-cao/cua-toi
# ==========================================
@bao_cao_bp.route('/cua-toi', methods=['GET'])
@can_access()
def get_bao_cao_cua_toi():
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # ✅ Fix: dùng nguoi_dung_id trực tiếp thay vì subquery qua email
        cursor.execute(
            """
            SELECT v.* FROM v_bao_cao_day_du v
            JOIN bao_cao b ON v.bao_cao_id = b.bao_cao_id
            WHERE b.nguoi_dung_id = ?
            ORDER BY v.ngay_tao DESC
            """,
            (request.nguoi_dung_id,)
        )
        danh_sach = dict_fetchall(cursor)

        return jsonify({'thong_bao': 'Thành công', 'so_luong': len(danh_sach), 'data': danh_sach}), 200
    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


# ==========================================
# 3. LẤY CHI TIẾT 1 BÁO CÁO (Kèm Ảnh + Lịch Sử)
# GET /bao-cao/<bao_cao_id>
# ==========================================
@bao_cao_bp.route('/<int:bao_cao_id>', methods=['GET'])
def get_chi_tiet(bao_cao_id):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # ✅ Fix: dùng bao_cao_id
        # Lấy thông tin báo cáo kèm tên nhân viên phụ trách và loại sự cố
        cursor.execute("""
            SELECT 
                v.*, 
                nv.ho_ten AS nhan_vien_phu_trach,
                lsc.ten AS loai_su_co
            FROM v_bao_cao_day_du v
            JOIN bao_cao bc ON v.bao_cao_id = bc.bao_cao_id
            LEFT JOIN nguoi_dung nv ON bc.nhan_vien_id = nv.nguoi_dung_id
            LEFT JOIN loai_su_co lsc ON bc.loai_su_co_id = lsc.loai_su_co_id
            WHERE v.bao_cao_id = ?
        """, (bao_cao_id,))
        thong_tin = dict_fetchone(cursor)

        if not thong_tin:
            return jsonify({'loi': 'Không tìm thấy báo cáo'}), 404

        cursor.execute(
            "SELECT anh_id, duong_dan_anh, loai_anh, ngay_upload FROM anh WHERE bao_cao_id = ?",
            (bao_cao_id,)
        )
        hinh_anh = dict_fetchall(cursor)

        # ✅ Fix: dùng nguoi_doi_id thay vì nguoi_doi
        cursor.execute(
            """
            SELECT
                trang_thai_cu,
                trang_thai_moi,
                ghi_chu,
                ngay_doi,
                (SELECT ho_ten FROM nguoi_dung WHERE nguoi_dung_id = ls.nguoi_doi_id) AS ten_nguoi_doi
            FROM lich_su_trang_thai ls
            WHERE bao_cao_id = ?
            ORDER BY ngay_doi DESC
            """,
            (bao_cao_id,)
        )
        lich_su = dict_fetchall(cursor)

        return jsonify({
            'thong_bao': 'Thành công',
            'data': {
                'thong_tin': thong_tin,
                'hinh_anh': hinh_anh,
                'lich_su': lich_su
            }
        }), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


# ==========================================
# 4. GỬI BÁO CÁO MỚI
# POST /bao-cao
# ==========================================
# @bao_cao_bp.route('', methods=['POST'])
# @can_access()
# def tao_bao_cao():
#     conn = None
#     try:
#         data = request.get_json()
#         if not data:
#             return jsonify({'loi': 'Thiếu dữ liệu'}), 400
#
#         tieu_de      = data.get('tieu_de', '').strip()
#         mo_ta        = data.get('mo_ta', '')
#         dia_chi      = data.get('dia_chi', '')
#         vi_do        = data.get('vi_do')
#         kinh_do      = data.get('kinh_do')
#         # ✅ Fix: dùng loai_su_co_id thay vì loai_id
#         loai_su_co_id = data.get('loai_su_co_id')
#
#         if not tieu_de or vi_do is None or kinh_do is None or not loai_su_co_id:
#             return jsonify({'loi': 'Thiếu thông tin bắt buộc (tieu_de, vi_do, kinh_do, loai_su_co_id)'}), 400
#
#         conn = get_db()
#         cursor = conn.cursor()
#
#         sql = """
#             INSERT INTO bao_cao (nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do, trang_thai)
#             OUTPUT INSERTED.bao_cao_id
#             VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_duyet')
#         """
#         cursor.execute(sql, (request.nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do))
#         new_id = cursor.fetchone()[0]
#
#         conn.commit()
#         return jsonify({'thong_bao': 'Tạo báo cáo thành công', 'bao_cao_id': new_id}), 201
#
#     except Exception as e:
#         if conn: conn.rollback()
#         return jsonify({'loi': str(e)}), 500
#     finally:
#         if conn: conn.close()


# ==========================================
# 5. XOÁ BÁO CÁO CỦA MÌNH
# DELETE /bao-cao/<id>
# ==========================================
@bao_cao_bp.route('/<int:id>', methods=['DELETE'])
@can_access()
def xoa_bao_cao(id):
    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Đã cập nhật khóa chính là bao_cao_id
        cursor.execute("SELECT nguoi_dung_id, trang_thai FROM bao_cao WHERE bao_cao_id = ?", (id,))
        bc = cursor.fetchone()

        if not bc:
            return jsonify({'loi': 'Không tìm thấy báo cáo'}), 404

        if bc[0] != request.nguoi_dung_id:
            return jsonify({'loi': 'Bạn không có quyền xoá báo cáo này'}), 403

        if bc[1] not in ('cho_duyet', 'tu_choi'):
            return jsonify({'loi': 'Chỉ có thể xoá báo cáo đang chờ duyệt hoặc bị từ chối'}), 400


        cursor.execute("DELETE FROM bao_cao WHERE bao_cao_id = ?", (id,))
        conn.commit()

        return jsonify({'thong_bao': 'Đã xoá báo cáo thành công'}), 200

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


# Nội dung thông báo theo vai trò nhận
THONG_BAO_USER = {
    'da_duyet':       'Báo cáo của bạn đã được duyệt ✅',
    'tu_choi':        'Báo cáo của bạn bị từ chối ❌',
    'da_phan_cong':   'Báo cáo của bạn đã được phân công xử lý 🔧',
    'dang_xu_ly':     'Báo cáo của bạn đang được xử lý 🔨',
    'cho_nghiem_thu': 'Báo cáo của bạn đang chờ nghiệm thu 🔍',
    'da_xu_ly':       'Báo cáo của bạn đã được xử lý xong 🎉',
}
THONG_BAO_ADMIN = {
    'cho_duyet':      'Có báo cáo mới cần duyệt 📋',
    'cho_nghiem_thu': 'Nhân viên vừa hoàn thành xử lý, chờ nghiệm thu 🔍',
    'dang_xu_ly':     'Nhân viên đang xử lý báo cáo 🔨',
    'tu_choi_viec':   'Nhân viên từ chối nhận việc, cần phân công lại ⚠️',
}
THONG_BAO_NV = {
    'da_phan_cong': 'Bạn được phân công xử lý báo cáo mới 🔧',
}

@bao_cao_bp.route('/thong-bao', methods=['GET'])
@can_access(['user', 'admin', 'nhan_vien'])
def get_thong_bao():
    conn = None
    try:
        tu_id = request.args.get('tu_id', 0, type=int)
        user_id = request.nguoi_dung_id
        vai_tro = request.vai_tro

        conn = get_db()
        cursor = conn.cursor()

        rows = []

        if vai_tro == 'user':
            # User: nhận thông báo về báo cáo của chính mình, do người khác thực hiện
            cursor.execute("""
                SELECT ls.lich_su_id, ls.trang_thai_moi, bc.tieu_de, bc.bao_cao_id
                FROM lich_su_trang_thai ls
                JOIN bao_cao bc ON ls.bao_cao_id = bc.bao_cao_id
                WHERE bc.nguoi_dung_id = ?
                  AND ls.lich_su_id > ?
                  AND ls.nguoi_doi_id != ?
                ORDER BY ls.lich_su_id ASC
            """, (user_id, tu_id, user_id))
            rows = cursor.fetchall()
            template = THONG_BAO_USER

        elif vai_tro == 'admin':
            # Admin: thông báo vai trò (báo cáo mới, nhân viên cập nhật)
            cursor.execute("""
                SELECT ls.lich_su_id,
                       CASE
                         WHEN nd.vai_tro = 'nhan_vien'
                              AND ls.trang_thai_moi = 'da_duyet'
                              AND ls.ghi_chu LIKE N'Từ chối nhận việc:%'
                         THEN 'tu_choi_viec'
                         ELSE ls.trang_thai_moi
                       END AS trang_thai_key,
                       bc.tieu_de, bc.bao_cao_id
                FROM lich_su_trang_thai ls
                JOIN bao_cao bc ON ls.bao_cao_id = bc.bao_cao_id
                JOIN nguoi_dung nd ON ls.nguoi_doi_id = nd.nguoi_dung_id
                WHERE ls.lich_su_id > ?
                  AND ls.nguoi_doi_id != ?
                  AND nd.vai_tro IN ('user', 'nhan_vien')
                  AND (
                    ls.trang_thai_moi IN ('cho_duyet', 'cho_nghiem_thu', 'dang_xu_ly')
                    OR (
                      nd.vai_tro = 'nhan_vien'
                      AND ls.trang_thai_moi = 'da_duyet'
                      AND ls.ghi_chu LIKE N'Từ chối nhận việc:%'
                    )
                  )
                ORDER BY ls.lich_su_id ASC
            """, (tu_id, user_id))
            role_rows = [(r, THONG_BAO_ADMIN) for r in cursor.fetchall()]

            # Admin cũng nhận thông báo về báo cáo do chính mình gửi
            cursor.execute("""
                SELECT ls.lich_su_id, ls.trang_thai_moi, bc.tieu_de, bc.bao_cao_id
                FROM lich_su_trang_thai ls
                JOIN bao_cao bc ON ls.bao_cao_id = bc.bao_cao_id
                WHERE bc.nguoi_dung_id = ?
                  AND ls.lich_su_id > ?
                  AND ls.nguoi_doi_id != ?
                ORDER BY ls.lich_su_id ASC
            """, (user_id, tu_id, user_id))
            own_rows = [(r, THONG_BAO_USER) for r in cursor.fetchall()]

            all_rows = sorted(role_rows + own_rows, key=lambda x: x[0][0])
            seen = set()
            result = []
            for r, tmpl in all_rows:
                lich_su_id, trang_thai_moi, tieu_de, bao_cao_id = r
                noi_dung = tmpl.get(trang_thai_moi, 'Có cập nhật mới')
                key = (lich_su_id, noi_dung)
                if key in seen:
                    continue
                seen.add(key)
                result.append({'lich_su_id': lich_su_id, 'noi_dung': noi_dung, 'tieu_de': tieu_de, 'bao_cao_id': bao_cao_id})
            return jsonify(result), 200

        elif vai_tro == 'nhan_vien':
            # Nhân viên: thông báo khi được phân công
            cursor.execute("""
                SELECT ls.lich_su_id, ls.trang_thai_moi, bc.tieu_de, bc.bao_cao_id
                FROM lich_su_trang_thai ls
                JOIN bao_cao bc ON ls.bao_cao_id = bc.bao_cao_id
                WHERE bc.nhan_vien_id = ?
                  AND ls.lich_su_id > ?
                  AND ls.nguoi_doi_id != ?
                  AND ls.trang_thai_moi IN ('da_phan_cong')
                ORDER BY ls.lich_su_id ASC
            """, (user_id, tu_id, user_id))
            role_rows = [(r, THONG_BAO_NV) for r in cursor.fetchall()]

            # Nhân viên cũng nhận thông báo về báo cáo do chính mình gửi
            cursor.execute("""
                SELECT ls.lich_su_id, ls.trang_thai_moi, bc.tieu_de, bc.bao_cao_id
                FROM lich_su_trang_thai ls
                JOIN bao_cao bc ON ls.bao_cao_id = bc.bao_cao_id
                WHERE bc.nguoi_dung_id = ?
                  AND ls.lich_su_id > ?
                  AND ls.nguoi_doi_id != ?
                ORDER BY ls.lich_su_id ASC
            """, (user_id, tu_id, user_id))
            own_rows = [(r, THONG_BAO_USER) for r in cursor.fetchall()]

            all_rows = sorted(role_rows + own_rows, key=lambda x: x[0][0])
            seen = set()
            result = []
            for r, tmpl in all_rows:
                lich_su_id, trang_thai_moi, tieu_de, bao_cao_id = r
                noi_dung = tmpl.get(trang_thai_moi, 'Có cập nhật mới')
                key = (lich_su_id, noi_dung)
                if key in seen:
                    continue
                seen.add(key)
                result.append({'lich_su_id': lich_su_id, 'noi_dung': noi_dung, 'tieu_de': tieu_de, 'bao_cao_id': bao_cao_id})
            return jsonify(result), 200

        result = []
        for r in rows:
            lich_su_id, trang_thai_moi, tieu_de, bao_cao_id = r
            noi_dung = THONG_BAO_USER.get(trang_thai_moi, 'Có cập nhật mới')
            result.append({
                'lich_su_id': lich_su_id,
                'noi_dung': noi_dung,
                'tieu_de': tieu_de,
                'bao_cao_id': bao_cao_id,
            })

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


# Thêm vào cuối file report.py

@bao_cao_bp.route('/update-last-seen', methods=['PUT'])
@can_access()  # Cho phép tất cả vai trò truy cập
def update_last_seen():
    conn = None
    try:
        data = request.get_json()
        new_id = data.get('last_id')
        user_id = request.nguoi_dung_id

        if new_id is None:
            return jsonify({'loi': 'Thiếu last_id'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Cập nhật mốc ID thông báo cuối cùng cho người dùng này
        cursor.execute(
            "UPDATE nguoi_dung SET last_seen_id = ? WHERE nguoi_dung_id = ?",
            (new_id, user_id)
        )
        conn.commit()

        return jsonify({'tin_nhan': 'Cập nhật thành công'}), 200
    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()
