// FILE: js/pages/reports.js
(function(window, $) {
    'use strict';

    // ============================================================
    // 1. TẢI DANH SÁCH THEO TRẠNG THÁI
    // ============================================================
    window.loadListByStatus = async function(status, containerSelector) {
        try {
            const res = await window.apiRequest('GET', `/admin_get/dashboard?trang_thai=${encodeURIComponent(status)}&page=1&limit=100`);
            const data = (res.list && res.list.data) ? res.list.data : [];
            
            // Helper định dạng ngày tháng
            function fmtDate(s) {
                if (window.formatToTZ) return window.formatToTZ(s);
                if (!s) return '';
                const d = new Date(s);
                if (isNaN(d.getTime())) return s.toString();
                const pad = n => n < 10 ? '0' + n : n;
                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }

            const $tb = $(containerSelector);
            $tb.empty();
            
            if (!data.length) { 
                $tb.append('<tr><td colspan="6" class="text-center" style="padding: 20px;">Không có dữ liệu báo cáo</td></tr>'); 
                return; 
            }

            data.forEach(function(item) {
                const id = item.bao_cao_id || item.id || '';
                const $tr = $('<tr/>');

                // Render dữ liệu tùy theo trạng thái của bảng
                if (status === 'cho_duyet') {
                    const titleHtml = `<div class="report-summary"><strong>${(item.tieu_de||'')}</strong><div class="muted" style="font-size:12px;color:#666;">${(item.dia_chi||'')}</div></div>`;
                    $tr.append($('<td/>').html(titleHtml));
                    $tr.append($('<td/>').text(item.loai || ''));
                    $tr.append($('<td/>').text(item.nguoi_bao_cao || item.ho_ten || ''));
                    $tr.append($('<td/>').text(fmtDate(item.ngay_tao)));
                    $tr.append($('<td/>').html(`
                        <button class="btn-action btn-approve" data-id="${id}">Duyệt</button>
                        <button class="btn-action btn-reject" data-id="${id}">Từ chối</button>
                        <button class="btn-action btn-view" data-id="${id}">Xem</button>
                    `));
                } 
                else if (status === 'cho_nghiem_thu') {
                    $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                    $tr.append($('<td/>').text(item.tieu_de || ''));
                    $tr.append($('<td/>').text(item.nhan_vien_phu_trach || item.nhan_vien || ''));
                    $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                    $tr.append($('<td/>').html(`
                        <button class="btn-action btn-accept" data-id="${id}">Duyệt</button> 
                        <button class="btn-action btn-reject-nt" data-id="${id}">Không duyệt</button>
                        <button class="btn-action btn-view" data-id="${id}">Xem</button>
                    `));
                } 
                else {
                    // Dùng chung cho Đã duyệt, Từ chối, Đang xử lý, Đã xử lý
                    const titleHtml = `<div class="report-summary"><strong>${(item.tieu_de||'')}</strong><div class="muted" style="font-size:12px;color:#666;">${(item.dia_chi||'')}</div></div>`;
                    $tr.append($('<td/>').html(titleHtml));
                    
                    if (status === 'tu_choi') {
                        $tr.append($('<td/>').text(item.loai || ''));
                        $tr.append($('<td/>').text(item.ghi_chu_trang_thai || ''));
                    } else {
                        $tr.append($('<td/>').text(item.nhan_vien_phu_trach || item.nhan_vien || 'Chưa có'));
                    }

                    $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                    $tr.append($('<td/>').text((item.trang_thai || '').replace(/_/g, ' ')));
                    $tr.append($('<td/>').html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`));
                }

                $tb.append($tr);
            });
        } catch(e) { window.showApiError(e); }
    };


    // ============================================================
    // 2. TẢI CHI TIẾT MỘT BÁO CÁO (MODAL)
    // ============================================================
    window.loadReportDetail = async function(id) {
        try {
            const res = await window.apiRequest('GET', '/bao-cao/' + id);
            const info = res.data ? (res.data.thong_tin || res.data) : res;
            if (!info) return alert('Không tìm thấy báo cáo');

            // Khởi tạo Modal nếu chưa có trên trang
            if ($('#reportDetailModal').length === 0) {
                const modalHtml = `
                <div id="reportDetailModal" style="display:none;position:fixed;inset:0;z-index:9999;">
                    <div class="rd-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);"></div>
                    <div class="rd-content" style="position:relative;max-width:900px;margin:30px auto;background:#fff;border-radius:12px;padding:25px;max-height:90vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
                        <button class="rd-close" style="position:absolute;right:15px;top:15px;border:none;background:none;font-size:28px;cursor:pointer;color:#888;">&times;</button>
                        <div class="breadcrumb" style="margin-bottom:10px;color:#888;font-size:13px;">Chi tiết báo cáo › <strong id="rd-id"></strong></div>
                        <h2 id="rd-tieu-de" style="margin-top:0;color:#333;"></h2>
                        <p id="rd-dia-chi" style="color:#666;font-size:14px;margin-bottom:20px;"></p>
                        
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:25px;">
                            <div style="background:#f9f9f9;padding:15px;border-radius:8px;">
                                <h4 style="margin:0 0 10px 0;color:#555;">THÔNG TIN CHUNG</h4>
                                <p><strong>Loại sự cố:</strong> <span id="rd-loai"></span></p>
                                <p><strong>Người báo cáo:</strong> <span id="rd-nguoi-gui"></span></p>
                                <p><strong>Nhân viên xử lý:</strong> <span id="rd-nhan-vien"></span></p>
                                <p><strong>Trạng thái:</strong> <span id="rd-trang-thai" class="badge"></span></p>
                            </div>
                            <div style="background:#f9f9f9;padding:15px;border-radius:8px;">
                                <h4 style="margin:0 0 10px 0;color:#555;">MÔ TẢ NỘI DUNG</h4>
                                <div id="rd-mo-ta" style="font-size:14px;line-height:1.5; color: #444;"></div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div class="image-section">
                                <h4 style="border-left:4px solid #007bff; padding-left:10px; color: #007bff;">ẢNH HIỆN TRƯỜNG (USER)</h4>
                                <div id="rd-grid-anh-goc" class="img-grid" style="display:flex; gap:10px; flex-wrap:wrap; min-height:100px; background:#fcfcfc; border:1px dashed #ddd; border-radius:8px; padding:10px;"></div>
                            </div>
                            <div class="image-section">
                                <h4 style="border-left:4px solid #28a745; padding-left:10px; color: #28a745;">ẢNH HOÀN THÀNH (NHÂN VIÊN)</h4>
                                <div id="rd-grid-anh-xuly" class="img-grid" style="display:flex; gap:10px; flex-wrap:wrap; min-height:100px; background:#fcfcfc; border:1px dashed #ddd; border-radius:8px; padding:10px;"></div>
                            </div>
                        </div>

                        <hr style="border:none; border-top:1px solid #eee; margin:25px 0;">
                        <h4 style="color:#555;">LỊCH SỬ TRẠNG THÁI</h4>
                        <div id="rd-timeline"></div>
                    </div>
                </div>`;
                $(document.body).append(modalHtml);

                $('#reportDetailModal .rd-close, #reportDetailModal .rd-overlay').on('click', function() {
                    $('#reportDetailModal').fadeOut(150);
                });
            }

            // Đổ dữ liệu văn bản vào Modal
            const $m = $('#reportDetailModal');
            $m.find('#rd-id').text('#' + id);
            $m.find('#rd-tieu-de').text(info.tieu_de || 'Không có tiêu đề');
            $m.find('#rd-dia-chi').text(info.dia_chi || 'Không rõ địa chỉ');
            $m.find('#rd-loai').text(info.loai_su_co || info.loai || 'Chưa phân loại');
            $m.find('#rd-nguoi-gui').text(info.ho_ten || info.nguoi_bao_cao || 'N/A');
            $m.find('#rd-nhan-vien').text(info.nhan_vien_phu_trach || 'Chưa có nhân viên');
            $m.find('#rd-mo-ta').text(info.mo_ta || 'Không có mô tả chi tiết');
            
            const st = (info.trang_thai || 'cho_duyet');
            $m.find('#rd-trang-thai').text(st.replace(/_/g, ' ').toUpperCase()).attr('class', 'badge ' + st);

            // Lọc và hiển thị hình ảnh
            const $gridGoc = $m.find('#rd-grid-anh-goc').empty();
            const $gridXuLy = $m.find('#rd-grid-anh-xuly').empty();
            const images = res.data ? (res.data.hinh_anh || []) : (res.hinh_anh || []);
            
            if (images.length === 0) {
                $gridGoc.append('<small style="color:#999">Không có ảnh</small>');
                $gridXuLy.append('<small style="color:#999">Chưa có ảnh đối chứng</small>');
            } else {
                images.forEach(img => {
                    const src = img.duong_dan_anh || img.duong_dan;
                    const imgHtml = `
                        <div class="report-thumb">
                            <img src="${src}" data-src="${src}" class="report-thumb-img" 
                                 style="width:100px; height:100px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid #eee;">
                        </div>`;
                    
                    if (img.loai_anh === 'bao_cao') {
                        $gridGoc.append(imgHtml);
                    } else if (img.loai_anh === 'sau_sua_chua') {
                        $gridXuLy.append(imgHtml);
                    }
                });
            }

            // Xử lý Lịch sử (Timeline)
            const $tl = $m.find('#rd-timeline').empty();
            const timeline = res.data ? (res.data.lich_su || []) : (res.lich_su || []);
            timeline.forEach(t => {
                $tl.append(`
                    <div style="margin-bottom:10px; font-size:13px; padding-left:15px; border-left:2px solid #ddd; position:relative;">
                        <div style="position:absolute; left:-6px; top:4px; width:10px; height:10px; background:#ccc; border-radius:50%;"></div>
                        <strong>${window.formatToTZ ? window.formatToTZ(t.ngay_doi) : t.ngay_doi}</strong>: 
                        <span style="color:#888;">${t.trang_thai_cu || 'Mới'}</span> &rarr; <span class="text-primary" style="font-weight:600;">${t.trang_thai_moi}</span>
                        ${t.ghi_chu ? `<div style="font-style:italic; color:#666; margin-top:2px;">- Ghi chú: ${t.ghi_chu}</div>` : ''}
                    </div>`);
            });

            $m.fadeIn(150);

        } catch (e) { 
            console.error(e); 
            alert('Lỗi khi tải thông tin chi tiết báo cáo'); 
        }
    };


    // ============================================================
    // 3. XỬ LÝ SỰ KIỆN CÁC NÚT BẤM (Event Delegation)
    // ============================================================

    // Mở Modal Xem Chi Tiết
    $(document).on('click', '.btn-view', function() {
        window.loadReportDetail($(this).data('id'));
    });

    // --- CHỜ DUYỆT ---
    $(document).on('click', '.btn-approve', function() {
        const id = $(this).data('id');
        $('#confirmApproveModal').data('reportId', id);
        $('#confirm-approve-text').text('Bạn có chắc chắn muốn duyệt báo cáo #' + id + '?');
        $('#confirmApproveModal').fadeIn(150);
    });

    $(document).on('click', '#confirm-approve-btn', async function() {
        const id = $('#confirmApproveModal').data('reportId');
        if (!id) return;
        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/duyet`);
            $('#confirmApproveModal').fadeOut(150);
            if (window.refreshSidebarCounts) window.refreshSidebarCounts();
            window.loadListByStatus('cho_duyet', '#table-body-cho-duyet');
        } catch (e) { window.showApiError(e); }
    });

    $(document).on('click', '.btn-reject', function() {
        const id = $(this).data('id');
        $('#rejectModal').data('reportId', id);
        $('#reject-reason').val('');
        $('#confirm-reject-btn').prop('disabled', true);
        $('#rejectModal').fadeIn(150);
    });

    $(document).on('input', '#reject-reason', function() {
        const v = $(this).val().trim();
        $('#confirm-reject-btn').prop('disabled', v.length < 3);
    });

    $(document).on('click', '#confirm-reject-btn', async function() {
        const id = $('#rejectModal').data('reportId');
        const ghi_chu = $('#reject-reason').val().trim();
        if (!id || !ghi_chu) return;
        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/tu-choi`, { ghi_chu: ghi_chu });
            $('#rejectModal').fadeOut(150);
            if (window.refreshSidebarCounts) window.refreshSidebarCounts();
            window.loadListByStatus('cho_duyet', '#table-body-cho-duyet');
        } catch (e) { window.showApiError(e); }
    });


    // --- CHỜ NGHIỆM THU ---
    $(document).on('click', '.btn-accept', async function() {
        const id = $(this).data('id');
        if (!confirm('Nghiệm thu thành công? Báo cáo sẽ được đóng.')) return;
        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, { ket_qua: 'dat' });
            if (window.refreshSidebarCounts) window.refreshSidebarCounts();
            window.loadListByStatus('cho_nghiem_thu', '#table-body-nghiem-thu');
        } catch(e) { window.showApiError(e); }
    });

    $(document).on('click', '.btn-reject-nt', async function() {
        const id = $(this).data('id');
        if (!confirm('Nghiệm thu KHÔNG ĐẠT? Nhân viên sẽ phải làm lại.')) return;
        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, { ket_qua: 'khong_dat' });
            if (window.refreshSidebarCounts) window.refreshSidebarCounts();
            window.loadListByStatus('cho_nghiem_thu', '#table-body-nghiem-thu');
        } catch(e) { window.showApiError(e); }
    });


    // --- ĐÓNG CÁC MODAL XÁC NHẬN ---
    $(document).on('click', '#cancel-approve-btn, #confirmApproveModal .modal-overlay', function() {
        $('#confirmApproveModal').fadeOut(150);
    });
    $(document).on('click', '#cancel-reject-btn, #rejectModal .modal-overlay', function() {
        $('#rejectModal').fadeOut(150);
    });


    // --- TRÌNH XEM ẢNH PHÓNG TO (LIGHTBOX) ---
    $(document).on('click', '.report-thumb-img', function(e) {
        e.preventDefault();
        const src = $(this).data('src') || $(this).attr('src');
        if (!src) return;
        if ($('#imageViewerModal').length === 0) {
            const viewerHtml = `
            <div id="imageViewerModal" style="display:none;position:fixed;inset:0;z-index:10000;">
                <div class="iv-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.85);"></div>
                <div class="iv-content" style="position:relative;max-width:90vw;max-height:90vh;margin:40px auto;display:flex;align-items:center;justify-content:center;">
                    <button class="iv-close" style="position:absolute;right:20px;top:10px;border:none;background:none;color:#fff;font-size:36px;cursor:pointer;">&times;</button>
                    <img id="iv-image" src="${src}" style="max-width:100%;max-height:85vh;border-radius:8px;display:block;margin:0 auto;box-shadow: 0 0 20px rgba(0,0,0,0.5);" />
                </div>
            </div>`;
            $(document.body).append(viewerHtml);
            $('#imageViewerModal .iv-overlay, #imageViewerModal .iv-close').on('click', function(){ 
                $('#imageViewerModal').fadeOut(150); 
            });
        } else {
            $('#iv-image').attr('src', src);
        }
        $('#imageViewerModal').fadeIn(150);
    });

})(window, jQuery);