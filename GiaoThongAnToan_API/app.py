import os

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

from routes.admin import admin_bp
from routes.admin_get import admin_get_bp
from routes.auth import auth_bp
from routes.nhan_vien import nhan_vien_bp
from routes.quan_ly_tai_khoan import quan_ly_bp
from routes.quen_mat_khau import qmk_bp
from routes.report import bao_cao_bp
from routes.reports import reports_bp
from routes.upload import upload_bp

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(qmk_bp, url_prefix='/auth')

app.register_blueprint(bao_cao_bp, url_prefix='/bao-cao')
app.register_blueprint(upload_bp, url_prefix='')

app.register_blueprint(reports_bp, url_prefix='/api/Reports')
app.register_blueprint(nhan_vien_bp, url_prefix='/nhan-vien')

app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(admin_get_bp, url_prefix='/admin_get')
app.register_blueprint(quan_ly_bp, url_prefix='/admin')

if __name__ == '__main__':
    print("Danh sách các API hiện có:")
    print(app.url_map)

    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
