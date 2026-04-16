// FILE: js/api.js
(function(window, $) {
    'use strict';

    // ==========================================
    // 🛠 KHU VỰC CẤU HÌNH DEV
    // ==========================================
    const API_BASE = 'http://127.0.0.1:5000'; 
    const HARDCODED_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuZ3VvaV9kdW5nX2lkIjoyLCJ2YWlfdHJvIjoibmhhbl92aWVuIiwiZXhwIjoxNzc2OTI3MTc0fQ.KBZMalsEOvOJ7dKVegskSyqVhPQkYQeX5xdO11wqCHI'; 
    // ==========================================

    window.getToken = function() { 
        if (HARDCODED_TOKEN && HARDCODED_TOKEN !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuZ3VvaV9kdW5nX2lkIjoyLCJ2YWlfdHJvIjoibmhhbl92aWVuIiwiZXhwIjoxNzc2OTI3MTc0fQ.KBZMalsEOvOJ7dKVegskSyqVhPQkYQeX5xdO11wqCHI') {
            return HARDCODED_TOKEN;
        }
        return localStorage.getItem('token'); 
    };
    
    window.setToken = function(t) { 
        if (t) localStorage.setItem('token', t); 
        else localStorage.removeItem('token'); 
    };

    // Preferred timezone offset in hours for displaying timestamps (Asia/Bangkok = GMT+7)
    window.PREFERRED_TZ_OFFSET = 0;

    // Format timestamp strings/numbers/Date to timezone-aware display (uses GMT offset)
    // Options: { tzOffsetHours: number, dateOnly: boolean }
    window.formatTimestampToTZ = function(s, options) {
        options = options || {};
        var tzOffsetHours = (options.tzOffsetHours !== undefined) ? options.tzOffsetHours : window.PREFERRED_TZ_OFFSET;
        var dateOnly = options.dateOnly;
        if (s === null || s === undefined || s === '') return '';
        var epoch;
        if (s instanceof Date) {
            epoch = s.getTime();
        } else if (typeof s === 'number') {
            epoch = s;
        } else if (typeof s === 'string') {
            // If string contains timezone info or ISO 'T', let Date parse it
            if (/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s) || s.indexOf('T') !== -1) {
                var d = new Date(s);
                if (isNaN(d.getTime())) return s;
                epoch = d.getTime();
            } else {
                // Parse 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' as UTC
                var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
                if (!m) return s;
                var Y = parseInt(m[1], 10), Mo = parseInt(m[2], 10) - 1, D = parseInt(m[3], 10);
                var h = parseInt(m[4] || '0', 10), mi = parseInt(m[5] || '0', 10), sec = parseInt(m[6] || '0', 10);
                epoch = Date.UTC(Y, Mo, D, h, mi, sec);
            }
        } else {
            return '';
        }

        var tzMs = epoch + tzOffsetHours * 3600000;
        var dt = new Date(tzMs);
        // Use UTC getters to avoid host-local timezone effects
        var Y2 = dt.getUTCFullYear(), M2 = dt.getUTCMonth() + 1, D2 = dt.getUTCDate();
        var H2 = dt.getUTCHours(), Min2 = dt.getUTCMinutes();
        var pad = function(n){ return n < 10 ? '0' + n : n; };
        var datePart = Y2 + '-' + pad(M2) + '-' + pad(D2);
        if (dateOnly) return datePart;
        return datePart + ' ' + pad(H2) + ':' + pad(Min2);
    };

    window.formatToTZ = function(s, opts){ return window.formatTimestampToTZ(s, opts); };

    window.apiRequest = async function(method, path, data=null, isForm=false) {
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
        try { json = text ? JSON.parse(text) : null; } catch(e) { json = text; }
        
        if (!res.ok) throw json || { error: 'HTTP ' + res.status };
        return json;
    };

    window.showApiError = function(err) {
        console.error('Chi tiết lỗi API:', err);
        const msg = (err && (err.loi || err.error || err.thong_bao)) || 'Lỗi kết nối máy chủ';
        alert(msg);
    };

    window.renderReportRows = function($tbody, items, actionsHtmlFn) {
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

        items.forEach(function(item) {
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