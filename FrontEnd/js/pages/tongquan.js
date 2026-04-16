// FILE: js/pages/tongquan.js
(function(window, $){
    'use strict';

    window.loadDashboard = async function(page = 1, limit = 6) {
        try {
            const res = await window.apiRequest('GET', `/admin_get/dashboard?page=${page}&limit=${limit}`);
            
            if (res.cards) {
                $('#stat-cho-duyet').text(res.cards.cho_duyet || 0);
                $('#stat-dang-xu-ly').text(res.cards.dang_xu_ly || 0);
                $('#stat-da-xu-ly').text(res.cards.da_xu_ly || 0);
                $('#stat-tong-bao-cao').text(res.cards.tong || 0);

                $('#menu-cho-duyet').text(res.cards.cho_duyet || 0);
                $('#menu-da-duyet').text(res.cards.da_duyet || 0);  
                $('#menu-tu-choi').text(res.cards.tu_choi || 0);
                $('#menu-cho-phan-cong').text(res.cards.cho_phan_cong || 0);
                $('#menu-da-phan-cong').text(res.cards.da_phan_cong || 0);
                $('#menu-dang-xu-ly').text(res.cards.dang_xu_ly || 0);  
                $('#menu-cho-nghiem-thu').text(res.cards.cho_nghiem_thu || 0);
                $('#menu-da-xu-ly').text(res.cards.da_xu_ly || 0);
            }

            const list = (res.list && res.list.data) ? res.list.data : [];
            const $tbody = $('#table-body-reports').empty();
            
            // Vẽ bảng dữ liệu 5 cột
            if (list.length === 0) {
                $tbody.append('<tr><td colspan="5" style="text-align:center; padding: 20px; color: #666;">Không có báo cáo nào cần xử lý</td></tr>');
            } else {
                const statusMap = {
                    'cho_duyet': { text: 'Chờ duyệt', color: 'gray' },
                    'da_duyet': { text: 'Đã duyệt', color: 'blue' },
                    'tu_choi': { text: 'Từ chối', color: 'red' },
                    'da_phan_cong': { text: 'Đã phân công', color: 'purple' },
                    'dang_xu_ly': { text: 'Đang xử lý', color: 'orange' },
                    'cho_nghiem_thu': { text: 'Chờ nghiệm thu', color: 'green' },
                    'da_xu_ly': { text: 'Đã xử lý', color: 'green' }
                };

                list.forEach(function(item) {
                    const id = item.bao_cao_id || item.id;
                    const loai = item.loai_su_co || item.loai || 'Chưa phân loại';
                    const rawStatus = item.trang_thai || item.trang_thai_hien_tai || '';
                    const statusObj = statusMap[rawStatus] || { text: rawStatus.replace(/_/g, ' ').toUpperCase(), color: 'gray' };
                    
                    const titleHtml = `
                        <div class="report-summary" style="display:flex;flex-direction:column;">
                            <strong style="color:#2b3035;font-size:15px;margin-bottom:4px;">${item.tieu_de || 'Không có tiêu đề'}</strong>
                            <span class="muted" style="font-size:13px;color:#6c757d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.dia_chi || 'Chưa cập nhật địa chỉ'}</span>
                        </div>
                    `;

                    $tbody.append(`
                        <tr class="report-row">
                            <td><strong style="color: #2b3035; font-size: 15px;">#${id}</strong></td>
                            <td>${titleHtml}</td>
                            <td>${loai}</td>
                            <td><span class="badge ${statusObj.color}">${statusObj.text}</span></td>
                            <td>
                                <button class="btn-action btn-view" data-id="${id}">Xem</button>
                            </td>
                        </tr>
                    `);
                });
            }

            // Xử lý phân trang
            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'dashboard',
                    anchor: '#table-body-reports',
                    currentPage: page,
                    pageSize: limit,
                    totalItems: (res.list && res.list.total) || 0,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadDashboard(nextPage, nextLimit);
                    }
                });
            }

        } catch (err) {
            if(window.showApiError) window.showApiError(err);
        }
    };
})(window, jQuery);