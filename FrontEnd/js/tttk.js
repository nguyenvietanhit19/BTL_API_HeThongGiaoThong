$(document).ready(function() {
    // 1. XỬ LÝ XEM TRƯỚC ẢNH ĐẠI DIỆN (AVATAR PREVIEW)
    $('#upload-avatar').on('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            // Kiểm tra định dạng file
            const validImageTypes = ['image/gif', 'image/jpeg', 'image/png'];
            if (!validImageTypes.includes(file.type)) {
                alert("Vui lòng chọn định dạng ảnh (JPG, PNG, GIF).");
                return;
            }

            // Đọc file và hiển thị lên thẻ img
            const reader = new FileReader();
            reader.onload = function(e) {
                $('#profile-avatar').attr('src', e.target.result);
            };
            reader.readAsDataURL(file);
        }
    });

    // 2. KIỂM TRA MẬT KHẨU TRÙNG KHỚP
    $('#form-change-password').on('submit', function(e) {
        e.preventDefault();
        
        const oldPass = $(this).find('input[type="password"]').eq(0).val();
        const newPass = $(this).find('input[type="password"]').eq(1).val();
        const confirmPass = $(this).find('input[type="password"]').eq(2).val();

        // Kiểm tra bỏ trống
        if (!oldPass || !newPass || !confirmPass) {
            alert("Vui lòng nhập đầy đủ các trường mật khẩu.");
            return;
        }

        // Kiểm tra độ dài mật khẩu mới
        if (newPass.length < 8) {
            alert("Mật khẩu mới phải có ít nhất 8 ký tự.");
            return;
        }

        // Kiểm tra trùng khớp
        if (newPass !== confirmPass) {
            alert("Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.");
            // Highlight ô nhập lỗi
            $(this).find('input[type="password"]').eq(2).css('border-color', '#ee5d50');
            return;
        }

        // Nếu mọi thứ ổn, giả lập gọi API
        console.log("Đang đổi mật khẩu...");
        alert("Cập nhật mật khẩu thành công!");
        this.reset(); // Xóa form
        $(this).find('input').css('border-color', '#e0e5f2'); // Reset màu viền
    });

    // 3. XỬ LÝ LƯU THÔNG TIN CƠ BẢN
    $('#form-update-profile').on('submit', function(e) {
        e.preventDefault();
        
        const fullName = $(this).find('input[type="text"]').eq(0).val();
        const phone = $(this).find('input[type="text"]').eq(1).val();

        if (!fullName || !phone) {
            alert("Họ tên và Số điện thoại không được để trống.");
            return;
        }

        // Cập nhật tên hiển thị ở cột trái ngay lập tức (UI feedback)
        $('#display-name').text(fullName);

        console.log("Dữ liệu gửi đi:", { fullName, phone });
        alert("Thông tin cá nhân đã được cập nhật!");
    });
    
});