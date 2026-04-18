def release_staff_assignments(cursor, nhan_vien_id, actor_id, reason):
    cursor.execute(
        """
        SELECT ho_ten
        FROM nguoi_dung
        WHERE nguoi_dung_id = ?
        """,
        (nhan_vien_id,)
    )
    staff_row = cursor.fetchone()
    ten_nhan_vien = (staff_row[0] or '').strip() if staff_row else ''
    if not ten_nhan_vien:
        ten_nhan_vien = f'ID {nhan_vien_id}'

    reason = reason.format(ten_nhan_vien=ten_nhan_vien)

    cursor.execute(
        """
        SELECT bao_cao_id, trang_thai
        FROM bao_cao
        WHERE nhan_vien_id = ?
          AND trang_thai IN ('da_phan_cong', 'dang_xu_ly')
        """,
        (nhan_vien_id,)
    )
    reports = cursor.fetchall()

    for bao_cao_id, trang_thai_cu in reports:
        cursor.execute(
            """
            UPDATE phan_cong
            SET trang_thai = 'bi_dinh_chi'
            WHERE phan_cong_id = (
                SELECT TOP 1 phan_cong_id
                FROM phan_cong
                WHERE bao_cao_id = ? AND nhan_vien_id = ?
                ORDER BY lan_thu DESC, phan_cong_id DESC
            )
            """,
            (bao_cao_id, nhan_vien_id)
        )

        cursor.execute(
            """
            UPDATE bao_cao
            SET trang_thai = 'da_duyet',
                nhan_vien_id = NULL
            WHERE bao_cao_id = ?
            """,
            (bao_cao_id,)
        )

        cursor.execute(
            """
            INSERT INTO lich_su_trang_thai
            (bao_cao_id, nguoi_doi_id, trang_thai_cu, trang_thai_moi, ghi_chu)
            VALUES (?, ?, ?, 'da_duyet', ?)
            """,
            (bao_cao_id, actor_id, trang_thai_cu, reason)
        )

    return len(reports)
