from flask import Flask
from flask_cors import CORS
from routes.auth import auth_bp
from routes.upload import upload_bp
from routes.reports import reports_bp
from dotenv import load_dotenv
import os  # <--- BẠN THÊM DÒNG NÀY VÀO ĐÂY NHÉ

load_dotenv()

app = Flask(__name__)
# ... phần code bên dưới của bạn giữ nguyên ...

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(upload_bp, url_prefix='')  # ← thêm dòng này
app.register_blueprint(reports_bp, url_prefix='/api/Reports')

if __name__ == '__main__':
    # In ra toàn bộ các đường dẫn API đang có thật trong app
    print(app.url_map)

    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)