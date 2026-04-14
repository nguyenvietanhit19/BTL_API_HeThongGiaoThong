from flask import Blueprint, request, jsonify
from middleware.auth_middleware import can_access
from db import get_db
import cloudinary
import cloudinary.uploader
import os
from dotenv import load_dotenv
from PIL import Image
import math
import io

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

upload_bp = Blueprint('upload', __name__)


def doc_gps_exif(file):
    try:
        img = Image.open(file)
        exif_data = img._getexif()
        if not exif_data:
            return None

        from PIL.ExifTags import TAGS, GPSTAGS
        gps_info = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id)
            if tag == "GPSInfo":
                for gps_tag_id, gps_value in value.items():
                    gps_info[GPSTAGS.get(gps_tag_id)] = gps_value

        if not gps_info:
            return None

        def to_decimal(d, m, s):
            return d + m / 60 + s / 3600

        lat = to_decimal(*gps_info["GPSLatitude"])
        lon = to_decimal(*gps_info["GPSLongitude"])
        if gps_info.get("GPSLatitudeRef") == "S":
            lat = -lat
        if gps_info.get("GPSLongitudeRef") == "W":
            lon = -lon

        return lat, lon
    except Exception:
        return None


def kiem_tra_vi_tri_anh(file, vi_do_bao_cao, kinh_do_bao_cao, nguong_km=1.0):
    gps = doc_gps_exif(file)
    if gps is None:
        return True, "Ảnh không có GPS, bỏ qua kiểm tra"

    lat, lon = gps
    R = 6371
    dlat = math.radians(lat - vi_do_bao_cao)
    dlon = math.radians(lon - kinh_do_bao_cao)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(vi_do_bao_cao)) * math.cos(math.radians(lat)) * math.sin(dlon/2)**2
    khoang_cach = R * 2 * math.asin(math.sqrt(a))

    if khoang_cach > nguong_km:
        return False, f"Ảnh chụp cách vị trí báo cáo {khoang_cach:.1f}km"

    return True, "OK"


# POST /bao-cao/<id>/anh
@upload_bp.route('/bao-cao/<int:id>/anh', methods=['POST'])
@can_access(['user', 'nhan_vien'])
def upload_anh(id):
    if 'anh' not in request.files:
        return jsonify({'loi': 'Thiếu file ảnh'}), 400

    file = request.files['anh']

    if file.filename == '':
        return jsonify({'loi': 'Chưa chọn file'}), 400

    # Kiểm tra định dạng file
    ALLOWED = {'jpg', 'jpeg', 'png'}
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED:
        return jsonify({'loi': 'Chỉ chấp nhận jpg, jpeg, png'}), 400

    conn = None
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Lấy thông tin báo cáo
        cursor.execute(
            "SELECT vi_do, kinh_do, trang_thai FROM bao_cao WHERE id = ?", (id,)
        )
        bao_cao = cursor.fetchone()
        if not bao_cao:
            return jsonify({'loi': 'Không tìm thấy báo cáo'}), 404

        vi_do, kinh_do, trang_thai = bao_cao

        # Kiểm tra EXIF GPS
        file.seek(0)
        hop_le, thong_bao = kiem_tra_vi_tri_anh(file, vi_do, kinh_do)
        if not hop_le:
            return jsonify({'loi': thong_bao}), 400

        # Tự động phân loại ảnh theo vai trò
        vai_tro = request.vai_tro
        if vai_tro == 'user':
            loai_anh = 'bao_cao'
        elif vai_tro == 'nhan_vien':
            if trang_thai == 'dang_xu_ly':
                loai_anh = 'hien_truong'
            else:
                loai_anh = 'sau_sua_chua'

        # Upload lên Cloudinary
        file.seek(0)
        ket_qua = cloudinary.uploader.upload(
            file,
            folder='giao_thong',
            resource_type='image'
        )
        url_anh = ket_qua['secure_url']

        # Lưu vào database
        cursor.execute(
            """INSERT INTO anh (bao_cao_id, nguoi_upload, duong_dan_anh, loai_anh)
               VALUES (?, ?, ?, ?)""",
            (id, request.nguoi_dung_id, url_anh, loai_anh)
        )
        conn.commit()

        return jsonify({
            'thong_bao': 'Upload thành công',
            'url': url_anh,
            'loai_anh': loai_anh
        }), 201

    except Exception as e:
        return jsonify({'loi': str(e)}), 500
    finally:
        if conn:
            conn.close()