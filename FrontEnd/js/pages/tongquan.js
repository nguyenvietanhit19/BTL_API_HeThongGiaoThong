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
            window.renderReportRows($('#table-body-reports'), list, function(item) {
                return `<button class="btn-action btn-view" data-id="${item.bao_cao_id || item.id}">Xem</button>`;
            });

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
