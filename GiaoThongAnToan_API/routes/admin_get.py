from flask import Blueprint, request, jsonify
from db import get_db
from .auth import can_access

admin_get_bp = Blueprint('admin_get_bp', __name__)

@admin_get_bp.route('/dashboard', methods=['GET'])
@can_access(['admin'])
def dashboard():

    conn = get_db()
    cursor = conn.cursor()

    try:
        # ========================
        # 🔥 1. DASHBOARD (cards)
        # ========================
        cursor.execute("""
            SELECT 
                COUNT(*) AS tong,
                SUM(CASE WHEN trang_thai = 'cho_duyet' THEN 1 ELSE 0 END) AS cho_duyet,
                SUM(CASE WHEN trang_thai = 'da_duyet' THEN 1 ELSE 0 END) AS da_duyet,
                SUM(CASE WHEN trang_thai = 'da_phan_cong' THEN 1 ELSE 0 END) AS da_phan_cong,
                SUM(CASE WHEN trang_thai = 'dang_xu_ly' THEN 1 ELSE 0 END) AS dang_xu_ly,
                SUM(CASE WHEN trang_thai = 'cho_nghiem_thu' THEN 1 ELSE 0 END) AS cho_nghiem_thu,
                SUM(CASE WHEN trang_thai = 'da_xu_ly' THEN 1 ELSE 0 END) AS da_xu_ly,
                SUM(CASE WHEN trang_thai = 'tu_choi' THEN 1 ELSE 0 END) AS tu_choi
            FROM bao_cao    
        """)

        row = cursor.fetchone()

        cards = {
            "tong": row[0],
            "cho_duyet": row[1] or 0,
            "da_duyet": row[2] or 0,
            "da_phan_cong": row[3] or 0,
            "dang_xu_ly": row[4] or 0,
            "cho_nghiem_thu": row[5] or 0,
            "da_xu_ly": row[6] or 0,
            "tu_choi": row[7] or 0
        }

        # ========================
        # 🔥 2. THỐNG KÊ LOẠI
        # ========================
        cursor.execute("""
            SELECT l.ten, COUNT(*)
            FROM bao_cao bc
            JOIN loai_su_co l ON bc.loai_su_co_id = l.loai_su_co_id
            GROUP BY l.ten
        """)

        theo_loai = {row[0]: row[1] for row in cursor.fetchall()}

        # ========================
        # 🔥 3. FILTER LIST
        # ========================
        trang_thai = request.args.get('trang_thai')
        keyword = request.args.get('keyword')

        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit

        query = """
            FROM bao_cao bc
            LEFT JOIN loai_su_co l ON bc.loai_su_co_id = l.loai_su_co_id
            WHERE 1=1
        """

        params = []

        if trang_thai:
            query += " AND bc.trang_thai = ?"
            params.append(trang_thai)

        if keyword:
            query += " AND bc.tieu_de LIKE ?"
            params.append(f"%{keyword}%")

        # 🔹 count
        cursor.execute("SELECT COUNT(*) " + query, params)
        total = cursor.fetchone()[0]

        # 🔹 data
        cursor.execute(f"""
            SELECT 
                bc.bao_cao_id,
                bc.tieu_de,
                bc.trang_thai,
                l.ten AS loai
            {query}
            ORDER BY bc.bao_cao_id DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """, params + [offset, limit])

        data = [
            dict(zip([col[0] for col in cursor.description], row))
            for row in cursor.fetchall()
        ]

        return jsonify({
            "cards": cards,
            "theo_loai": theo_loai,
            "list": {
                "page": page,
                "limit": limit,
                "total": total,
                "data": data
            }
        })

    except Exception as e:
        print("❌ LỖI:", e)
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        conn.close()