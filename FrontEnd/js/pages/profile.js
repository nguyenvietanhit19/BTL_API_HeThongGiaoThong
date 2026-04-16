// FILE: js/pages/profile.js
(function(window, $){
    'use strict';

    window.loadProfile = async function() {
        try {
            // Lấy dữ liệu từ API
            const u = await window.apiRequest('GET', '/auth/toi');
            if (!u || u.error) return;
            
            // 1. Cập nhật thẻ Profile Summary (Bên trái)
            $('#display-name').text(u.ho_ten || 'Người dùng ẩn danh');
            
            // Format ngày tạo (hiển thị theo GMT+7 nếu helper có sẵn)
            const joinDate = u.ngay_tao ? (window.formatToTZ ? window.formatToTZ(u.ngay_tao, {dateOnly:true}) : new Date(u.ngay_tao).toLocaleDateString('vi-VN')) : 'Chưa cập nhật';
            $('.join-date').text('Thành viên từ: ' + joinDate);
            
            // Phân loại vài trò (Role mapping)
            const roleMap = {
                'admin': { text: 'Quản trị viên', class: 'badge-assigned' }, 
                'nhan_vien': { text: 'Nhân viên xử lý', class: 'badge-processing' }, 
                'user': { text: 'Người dùng', class: 'badge-approved' } 
            };
            const roleObj = roleMap[u.vai_tro] || { text: u.vai_tro, class: '' };
            $('.user-role').removeClass('badge-assigned badge-processing badge-approved').addClass(roleObj.class).text(roleObj.text);

            // Cập nhật ảnh đại diện
            const avatar = u.avatar || '/FrontEnd/img/default-avatar.png';
            $('#profile-avatar').attr('src', avatar);
            
            // 2. Cập nhật Form Thông tin (Bên phải)
            $('#input-ho-ten').val(u.ho_ten || '');
            $('#input-sdt').val(u.so_dien_thoai || '');
            $('#input-email').val(u.email || '');

        } catch (err) {
            console.error("Lỗi tải thông tin tài khoản:", err);
            if(window.showApiError) window.showApiError(err);
        }
    };

    // Xử lý chuyển đổi qua lại giữa các tab
    $(document).off('click', '.tab-btn').on('click', '.tab-btn', function() {
        $('.tab-btn').removeClass('active');
        $('.tab-content').removeClass('active');
        
        $(this).addClass('active');
        const targetId = $(this).data('tab') + '-tab';
        $('#' + targetId).addClass('active');
    });

})(window, jQuery);