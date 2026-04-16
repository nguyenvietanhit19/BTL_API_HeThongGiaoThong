// FILE: js/api.js
(function (window, $) {
    'use strict';

    // ==========================================
    // 🛠 KHU VỰC CẤU HÌNH DEV
    // ==========================================
    const API_BASE = 'http://127.0.0.1:5000';
    const HARDCODED_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuZ3VvaV9kdW5nX2lkIjoxLCJ2YWlfdHJvIjoiYWRtaW4iLCJleHAiOjE3NzY5MjQ1NTR9.UA5ckwxC6VTH6ylUmP5NAfpUE5hCMSflqrGU59SuB8s';
    // ==========================================

    window.getToken = function () {
        // Prefer token saved after login in localStorage; fall back to HARDCODED_TOKEN for dev.
        try {
            const stored = localStorage.getItem('token');
            if (stored) return stored;
        } catch (e) {
            // localStorage may be unavailable in some contexts
        }
        if (HARDCODED_TOKEN && HARDCODED_TOKEN !== '') return HARDCODED_TOKEN;
        return null;
    };

    window.setToken = function (t) {
        if (t) localStorage.setItem('token', t);
        else localStorage.removeItem('token');
    };

    window.apiRequest = async function (method, path, data = null, isForm = false) {
        const headers = {};
        if (!isForm && (method === 'POST' || method === 'PUT')) {
            headers['Content-Type'] = 'application/json';
        }

        const token = window.getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const opts = { method, headers, mode: 'cors' };
        if (data) opts.body = isForm ? data : JSON.stringify(data);

        const url = path.startsWith('http') ? path : (API_BASE + path);
        const res = await fetch(url, opts);
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }

        if (!res.ok) throw json || { error: 'HTTP ' + res.status };
        return json;
    };

    window.showApiError = function (err) {
        console.error('Chi tiết lỗi API:', err);
        const msg = (err && (err.loi || err.error || err.thong_bao)) || 'Lỗi kết nối máy chủ';
        alert(msg);
    };

    window.renderReportRows = function ($tbody, items, actionsHtmlFn) {
        $tbody.empty();
        if (!items || !items.length) {
            $tbody.append('<tr><td colspan="4" class="text-center" style="padding: 20px;">Không có dữ liệu</td></tr>');
            return;
        }

        const statusMap = {
            'cho_duyet': { text: 'Chờ duyệt', color: 'orange' },
            'da_duyet': { text: 'Đã duyệt', color: 'blue' },
            'tu_choi': { text: 'Từ chối', color: 'red' },
            'da_phan_cong': { text: 'Đã phân công', color: 'purple' },
            'dang_xu_ly': { text: 'Đang xử lý', color: 'orange' },
            'cho_nghiem_thu': { text: 'Chờ nghiệm thu', color: 'green' },
            'da_xu_ly': { text: 'Đã xử lý', color: 'green' }
        };

        items.forEach(function (item) {
            const title = item.tieu_de || item.ten || 'Không có tiêu đề';
            const loai = item.loai_su_co || item.loai || 'Chưa phân loại';
            const rawStatus = item.trang_thai || item.trang_thai_hien_tai || '';
            const statusObj = statusMap[rawStatus] || { text: rawStatus, color: 'gray' };

            const $tr = $('<tr/>');
            $tr.append($('<td/>').html('<strong>' + $('<div/>').text(title).html() + '</strong>'));
            $tr.append($('<td/>').text(loai));
            if (rawStatus) {
                $tr.append($('<td/>').html(`<span class="badge ${statusObj.color}">${statusObj.text}</span>`));
            } else {
                $tr.append($('<td/>').text('-'));
            }
            const $actionTd = $('<td/>');
            if (typeof actionsHtmlFn === 'function') {
                $actionTd.html(actionsHtmlFn(item));
            }
            $tr.append($actionTd);
            $tbody.append($tr);
        });
    };

})(window, jQuery);