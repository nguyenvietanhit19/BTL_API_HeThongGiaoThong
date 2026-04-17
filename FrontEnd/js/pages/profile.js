(function(window, $){
    'use strict';

    window.loadProfile = async function() {
        try {
            const u = await window.apiRequest('GET', '/auth/toi');
            if (!u || u.error) return;

            $('#display-name').text(u.ho_ten || 'Người dùng ẩn danh');

            const joinDate = u.ngay_tao
                ? (window.formatToTZ ? window.formatToTZ(u.ngay_tao, { dateOnly: true }) : new Date(u.ngay_tao).toLocaleDateString('vi-VN'))
                : 'Chưa cập nhật';
            $('.join-date').text('Thành viên từ: ' + joinDate);

            const roleMap = {
                'admin': { text: 'Quản trị viên', class: 'badge-assigned' },
                'nhan_vien': { text: 'Nhân viên xử lý', class: 'badge-processing' },
                'user': { text: 'Người dùng', class: 'badge-approved' }
            };
            const roleObj = roleMap[u.vai_tro] || { text: u.vai_tro, class: '' };
            $('.user-role')
                .removeClass('badge-assigned badge-processing badge-approved')
                .addClass(roleObj.class)
                .text(roleObj.text);

            $('#input-user-id').val(u.nguoi_dung_id || u.id || '');
            $('#input-ho-ten').val(u.ho_ten || '');
            $('#input-email').val(u.email || '');
        } catch (err) {
            console.error('Lỗi tải thông tin tài khoản:', err);
            if (window.showApiError) window.showApiError(err);
        }
    };

    $(document).off('submit', '#info-tab form').on('submit', '#info-tab form', async function(e) {
        e.preventDefault();

        const ho_ten = $('#input-ho-ten').val().trim();
        const email = $('#input-email').val().trim();

        if (!ho_ten || !email) {
            alert('Vui lòng không để trống Họ tên hoặc Email.');
            return;
        }

        const $btn = $(this).find('button[type="submit"]');
        $btn.prop('disabled', true).text('Đang lưu...');

        try {
            await window.apiRequest('PUT', '/auth/toi', { ho_ten: ho_ten, email: email });
            alert('Cập nhật thông tin thành công!');
            window.loadProfile();
        } catch (err) {
            window.showApiError(err);
        } finally {
            $btn.prop('disabled', false).text('Lưu thay đổi');
        }
    });
})(window, jQuery);
