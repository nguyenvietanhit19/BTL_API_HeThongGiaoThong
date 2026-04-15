from flask import Flask
from dotenv import load_dotenv
import os
from flask_cors import CORS
from routes.reports import reports_bp
from dotenv import load_dotenv
import os  # <--- BẠN THÊM DÒNG NÀY VÀO ĐÂY NHÉ
from routes.admin import admin_bp
from routes.nhan_vien import nhan_vien_bp
from routes.admin_get import admin_get_bp

# 1. BẮT BUỘC NẠP .ENV TRƯỚC TIÊN!
load_dotenv()

# 2. Sau đó mới import các route (vì các route này có gọi middleware/db)
from routes.auth import auth_bp
from routes.upload import upload_bp
from routes.report import bao_cao_bp

app = Flask(__name__)
# ... phần code bên dưới của bạn giữ nguyên ...

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(bao_cao_bp, url_prefix='/bao-cao')
app.register_blueprint(upload_bp, url_prefix='')  # ← thêm dòng này
app.register_blueprint(reports_bp, url_prefix='/api/Reports')
app.register_blueprint(nhan_vien_bp, url_prefix='/nhan-vien')

app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(admin_get_bp, url_prefix='/admin_get')

if __name__ == '__main__':
    # In ra toàn bộ các đường dẫn API đang có thật trong app
    print(app.url_map)

    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)