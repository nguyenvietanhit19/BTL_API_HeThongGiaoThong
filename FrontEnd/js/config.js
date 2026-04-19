// ĐỔI URL NÀY MỖI KHI KHỞI ĐỘNG LẠI NGROK


window.API_BASE =
    window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
        ? 'http://127.0.0.1:5000'
        : 'https://unworthy-imprison-coleslaw.ngrok-free.dev';
        
