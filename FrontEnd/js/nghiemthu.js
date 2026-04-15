$(document).ready(function() {
    
    // 1. Khi click vào một hàng báo cáo trong danh sách
    $(document).on('click', '.report-row', function() {
        // Sau này gọi AJAX API chi tiết ở đây dựa vào ID
        
        // Hiệu ứng mờ dần danh sách, hiện chi tiết
        $('#view-list').fadeOut(200, function() {
            $('#view-detail').fadeIn(200);
        });
    });

    // 2. Khi click vào nút Quay lại
    $(document).on('click', '#btn-back-to-list', function() {
        // Sau này có thể reload lại AJAX danh sách ở đây nếu cần

        // Hiệu ứng mờ dần chi tiết, hiện lại danh sách
        $('#view-detail').fadeOut(200, function() {
            $('#view-list').fadeIn(200);
        });
    });

});