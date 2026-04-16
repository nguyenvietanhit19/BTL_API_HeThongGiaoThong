from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db
import math

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


def tinh_khoang_cach_haversine(lat1, lon1, lat2, lon2):
    """Tính khoảng cách đường chim bay (Km)"""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    return R * c


# ==========================================
# 1. LẤY DANH SÁCH SỰ CỐ (Lọc bán kính 1km mặc định)
# GET /bao-cao
# ==========================================
@bao_cao_bp.route('', methods=['GET'])
def get_danh_sach_bao_cao():
    conn = None
    try:
        vi_do   = request.args.get('vi_do',    type=float)
        kinh_do = request.args.get('kinh_do',  type=float)
        ban_kinh = request.args.get('ban_kinh', default=1.0, type=float)

        # ✅ Fix: dùng loai_su_co_id thay vì loai_id
        loai_su_co_id = request.args.get('loai_su_co_id', type=int)

        conn = get_db()
        cursor = conn.cursor()

        sql = "SELECT * FROM v_bao_cao_day_du WHERE trang_thai NOT IN ('tu_choi', 'da_xu_ly')"
        params = []

        if loai_su_co_id:
            sql = (
                "SELECT v.* FROM v_bao_cao_day_du v "
                "JOIN bao_cao b ON v.bao_cao_id = b.bao_cao_id "
                "WHERE b.loai_su_co_id = ? AND v.trang_thai NOT IN ('tu_choi', 'da_xu_ly')"
            )
            params.append(loai_su_co_id)

        cursor.execute(sql, params)
        rows = dict_fetchall(cursor)

        danh_sach = []
        for row in rows:
            lat_bc = float(row['vi_do'])
            lon_bc = float(row['kinh_do'])

            if vi_do is not None and kinh_do is not None:
                kc = tinh_khoang_cach_haversine(vi_do, kinh_do, lat_bc, lon_bc)
                if kc <= ban_kinh:
                    row['khoang_cach_m'] = round(kc * 10000, 0)
                    danh_sach.append(row)
            else:
                row['khoang_cach_m'] = None
                danh_sach.append(row)

        if vi_do is not None and kinh_do is not None:
            danh_sach.sort(key=lambda x: x['khoang_cach_m'] if x['khoang_cach_m'] is not None else float('inf'))

        return jsonify({'thong_bao': 'Thành công', 'so_luong': len(danh_sach), 'data': danh_sach}), 200

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
@bao_cao_bp.route('', methods=['POST'])
@can_access()
def tao_bao_cao():
    conn = None
    try:
        data = request.get_json()
        if not data:
            return jsonify({'loi': 'Thiếu dữ liệu'}), 400

        tieu_de      = data.get('tieu_de', '').strip()
        mo_ta        = data.get('mo_ta', '')
        dia_chi      = data.get('dia_chi', '')
        vi_do        = data.get('vi_do')
        kinh_do      = data.get('kinh_do')
        # ✅ Fix: dùng loai_su_co_id thay vì loai_id
        loai_su_co_id = data.get('loai_su_co_id')

        if not tieu_de or vi_do is None or kinh_do is None or not loai_su_co_id:
            return jsonify({'loi': 'Thiếu thông tin bắt buộc (tieu_de, vi_do, kinh_do, loai_su_co_id)'}), 400

        conn = get_db()
        cursor = conn.cursor()

        sql = """
            INSERT INTO bao_cao (nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do, trang_thai)
            OUTPUT INSERTED.bao_cao_id
            VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_duyet')
        """
        cursor.execute(sql, (request.nguoi_dung_id, loai_su_co_id, tieu_de, mo_ta, dia_chi, vi_do, kinh_do))
        new_id = cursor.fetchone()[0]

        conn.commit()
        return jsonify({'thong_bao': 'Tạo báo cáo thành công', 'bao_cao_id': new_id}), 201

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()


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

        if bc[1] != 'cho_duyet':
            return jsonify({'loi': 'Chỉ có thể xoá báo cáo khi đang ở trạng thái chờ duyệt'}), 400

        # Đã cập nhật khóa chính là bao_cao_id
        cursor.execute("DELETE FROM bao_cao WHERE bao_cao_id = ?", (id,))
        conn.commit()

        return jsonify({'thong_bao': 'Đã xoá báo cáo thành công'}), 200

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn: conn.close()